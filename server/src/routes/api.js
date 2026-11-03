import express from 'express';
import * as jobs from '../lib/jobs.js';
import * as cache from '../lib/cache.js';
import { rateLimit, briefRateLimit, createRateLimit } from '../lib/rateLimit.js';
import * as brief from '../services/brief.js';
import { quotaStatus, quotaDay, nextQuotaReset, canAfford } from '../lib/quota.js';
import * as runner from '../services/runner.js';
import { config } from '../config.js';
import { MAX_CUSTOM_WINDOW_DAYS, parseChannelInput } from '../services/youtube.js';
import { listRuns as listAuditRuns, readRunLog } from '../lib/auditLog.js';
import * as store from '../lib/store.js';
import * as watches from '../lib/watches.js';
import { PLANS as WAITLIST_PLANS, normalizeEmail, joinWaitlist } from '../lib/waitlist.js';
import * as scheduler from '../services/scheduler.js';
import { loadUser, requireUser, requireVerified, requireAdmin, forgetUser } from '../lib/auth.js';
import { parseAvatarDataUrl } from '../lib/avatar.js';
import { getUser, setAvatar, clearAvatar, getAvatar, upsertUser, acceptTerms, linkRun, runIdsFor, usageFor, tryConsume, refund, deleteUserData } from '../lib/db.js';
import { limitsFor } from '../lib/limits.js';
import { domainAcceptsMail } from '../lib/emailDomain.js';

export const router = express.Router();

/** Express 4 does not catch a rejected promise, so every async handler goes through this. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
/** Account bookkeeping that runs when a job settles must never become an unhandled rejection. */
const quietly = (p) => Promise.resolve(p).catch((err) => console.error('[account] bookkeeping failed:', err.message));

// Who is calling, for every route below. Public routes ignore req.user; the ones
// that need an account say so with requireUser.
router.use(loadUser);

/**
 * YouTube's API policies (III.A): reading YouTube data needs the account's
 * agreement to the Terms and Privacy Policy. The app asks before every analysis
 * or draft (web/src/lib/consent.jsx); this holds for any other client too.
 */
const requireTerms = wrap(async (req, res, next) => {
  if ((await getUser(req.user.uid))?.termsAcceptedAt) return next();
  res.status(403).json({ error: 'Agree to the Terms and Privacy Policy first.', code: 'TERMS_REQUIRED' });
});

/** A client-fixable input problem: 400 with a code that says so. */
const bad = (message) => Object.assign(new Error(message), { status: 400, code: 'VALIDATION' });

/**
 * The 429 body for a used-up daily allowance. `noun` is [singular, plural]. It
 * is DAILY_LIMIT, not RATE_LIMITED: the person cannot fix it by waiting an
 * hour, and the client shows a reset time rather than a retry countdown.
 */
export function dailyLimitBody(limit, noun, now = new Date()) {
  return {
    code: 'DAILY_LIMIT',
    error: `You've used your ${limit} ${limit === 1 ? noun[0] : noun[1]} for today. They reset at midnight Pacific.`,
    resetsAt: nextQuotaReset(now),
  };
}

/**
 * YouTube answered, but the person's own input or filters left nothing usable.
 * Free retries here would let one account spend the project's search quota
 * without limit (a minViews nothing passes, a new niche each time), so these stay charged.
 */
const INPUT_FAILURES = new Set(['NO_RESULTS', 'NO_RESULTS_AFTER_FILTER', 'CHANNEL_NOT_FOUND', 'CHANNEL_NO_UPLOADS', 'VALIDATION']);

/**
 * Whether a failed analysis keeps its charge. Only a cancel (started on purpose,
 * quota spent) and an input failure do. Everything on our side or YouTube's is
 * refunded even when YouTube was already called: QUOTA_EXHAUSTED / QUOTA_BUSY
 * (the project's daily quota, not the person's fault), YOUTUBE_ERROR (5xx and
 * other API errors) and any error with no code (our own backend).
 */
export function chargedFailure(err) {
  return err?.code === 'CANCELLED' || INPUT_FAILURES.has(err?.code);
}

// Watches carry their owner's uid for filtering; clients have no use for it.
const publicWatch = ({ ownerUid, ...w }) => w;

const WINDOWS = new Set(['24h', '7d', '30d', '90d', 'custom']);
const CONTENT_TYPES = new Set(['shorts', 'long', 'both']);
const GAP_MODES = new Set(['inclusive', 'strict']);

export function validate(body) {
  // Channel mode analyses one channel's own uploads, so it takes a channel
  // reference instead of a niche. Accepts a URL, an @handle or a UC... id --
  // resolved to an id server-side by channels.list (1 unit).
  const rawChannel = String(body.channelId ?? '').trim();
  let channelId;
  if (rawChannel) {
    if (!parseChannelInput(rawChannel)) {
      throw bad('That does not look like a YouTube channel. Paste the channel URL, its @handle, or its UC... id.');
    }
    channelId = rawChannel;
  }

  const niche = String(body.niche ?? '').trim();
  // In channel mode the channel itself is the subject, so a niche is optional.
  if (!channelId) {
    if (niche.length < 2) throw bad('Niche must be at least 2 characters.');
    if (niche.length > 100) throw bad('Niche must be under 100 characters.');
  } else if (niche.length > 100) {
    throw bad('Niche must be under 100 characters.');
  }

  const window = body.window ?? '7d';
  if (!WINDOWS.has(window)) throw bad(`window must be one of: ${[...WINDOWS].join(', ')}`);

  // A custom range carries its own start date; everything else is a preset.
  let customAfter;
  if (window === 'custom') {
    if (!config.allowCustomWindow) throw bad('Custom date ranges are not available yet.');
    const at = new Date(body.customAfter ?? '');
    if (Number.isNaN(at.getTime())) throw bad('A custom range needs a valid start date (ISO 8601).');
    if (at.getTime() >= Date.now()) throw bad('The custom start date must be in the past.');
    const daysBack = (Date.now() - at.getTime()) / 86_400_000;
    if (daysBack > MAX_CUSTOM_WINDOW_DAYS) {
      throw bad(`A custom range can reach back at most ${MAX_CUSTOM_WINDOW_DAYS} days.`);
    }
    customAfter = at.toISOString();
  }

  const contentType = body.contentType ?? 'both';
  if (!CONTENT_TYPES.has(contentType)) throw bad(`contentType must be one of: ${[...CONTENT_TYPES].join(', ')}`);

  const gapMode = body.gapMode ?? 'inclusive';
  if (!GAP_MODES.has(gapMode)) throw bad(`gapMode must be one of: ${[...GAP_MODES].join(', ')}`);

  const minViews = Number(body.minViews ?? 0);
  if (!Number.isFinite(minViews) || minViews < 0) throw bad('minViews must be a non-negative number.');
  if (minViews > 1_000_000_000) throw bad('minViews must be at most 1,000,000,000.');

  // Opt-in: doubles the search.list slices to widen the candidate pool. Costs
  // real quota, so it is never on by default -- see lib/searchPlan.js.
  const deepScan = body.deepScan === true && config.features.deepScan; // off until the quota audit: ignored, not an error

  // ISO 3166-1 alpha-2 / ISO 639-1 respectively; YouTube rejects anything else,
  // and that refusal would otherwise spend a run to say so.
  const regionCode = body.regionCode ? String(body.regionCode).trim().toUpperCase() : undefined;
  if (regionCode && !/^[A-Z]{2}$/.test(regionCode)) throw bad('Region must be a two-letter country code, like US or IN.');
  const relevanceLanguage = body.relevanceLanguage ? String(body.relevanceLanguage).trim().toLowerCase() : undefined;
  if (relevanceLanguage && !/^[a-z]{2}$/.test(relevanceLanguage)) throw bad('Language must be a two-letter code, like en or ta.');

  return { niche, window, customAfter, contentType, gapMode, minViews, regionCode, relevanceLanguage, deepScan, channelId };
}

// For a host's uptime check. The usage numbers live behind /quota.
router.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * Starts an analysis. Returns immediately with either a cached result or a job
 * id to poll -- the pipeline takes 20-60s and holding the request open that long
 * is how you collect proxy timeouts.
 *
 * Needs an account. Only a FRESH run costs the person one of their daily
 * analyses: a cache hit, or joining an identical run already in flight, spends
 * no YouTube quota and so is free -- and either way the report is linked to the
 * caller, so it shows up in their history.
 */
router.post('/analyze', requireUser, requireVerified, requireTerms, wrap(async (req, res) => {
  const uid = req.user.uid;
  const input = validate(req.body ?? {}); // a 400 reaches the error handler through wrap()

  const force = req.body?.force === true;
  const key = runner.analysisKey(input);

  // A cache hit costs nothing, so it bypasses the rate limit entirely --
  // browsing already-computed reports should never be throttled.
  if (!force) {
    const hit = await runner.usableHit(key);
    if (hit) {
      await linkRun(uid, hit.value?.runId);
      return res.json({ status: 'done', cached: true, cacheAgeSeconds: hit.ageSeconds, result: hit.value });
    }
  }

  // Joining a run already in flight is free too (even with force: the runner
  // would join it regardless). The link is made when the job settles, on the
  // server, so it still happens if the browser stops polling.
  const running = runner.runningJobFor(key);
  if (running) {
    jobs.addOwner(running, uid);
    jobs.whenSettled(running, (err, result) => { if (!err) quietly(linkRun(uid, result?.runId)); });
    return res.status(202).json({ status: 'running', jobId: running, cached: false, joined: true });
  }

  // A fresh run the shared YouTube quota cannot finish would spend its search
  // calls and then fail: say so up front, before anything is charged.
  if (!(await canAfford({ contentType: input.contentType, deepScan: input.deepScan, channelMode: Boolean(input.channelId) }))) {
    throw Object.assign(new Error('Daily YouTube quota cannot cover another analysis.'), { status: 503, code: 'QUOTA_EXHAUSTED' });
  }

  // The allowance is taken BEFORE the per-person limiter so someone who is out of
  // analyses is told so, rather than burning their hourly limit on refusals and
  // then seeing a misleading "rate limit" message.
  const day = quotaDay();
  const used = await tryConsume(uid, day, 'analyses', limitsFor(req.user).analyses);
  if (!used.ok) return res.status(429).json(dailyLimitBody(used.limit, ['analysis', 'analyses']));

  // The limiter answers 429 itself when it refuses; the allowance taken above was then never used.
  const allowed = await new Promise((resolve) => {
    let called = false;
    rateLimit(req, res, () => { called = true; resolve(true); });
    if (!called) resolve(false);
  });
  if (!allowed) return void (await refund(uid, day, 'analyses'));

  let started;
  try {
    started = await runner.startAnalysis(input, { force, owner: uid });
  } catch (err) {
    await refund(uid, day, 'analyses');
    throw err;
  }
  if (started.status === 'done' || started.joined) {
    // Raced into a hit or a join after all: nothing was spent.
    await refund(uid, day, 'analyses');
    if (started.status === 'done') await linkRun(uid, started.result?.runId);
    else jobs.whenSettled(started.jobId, (err, result) => { if (!err) quietly(linkRun(uid, result?.runId)); });
  } else {
    // Refunded unless the failure was the person's own doing: see chargedFailure.
    jobs.whenSettled(started.jobId, (err, result) => {
      if (err) { if (!chargedFailure(err)) quietly(refund(uid, day, 'analyses')); }
      else quietly(linkRun(uid, result?.runId));
    });
  }
  res.status(started.status === 'done' ? 200 : 202).json(started);
}));

/** Stops a run the caller started or joined. The analysis it already used stays counted. */
router.post('/jobs/:id/cancel', requireUser, (req, res) => {
  const outcome = jobs.cancel(req.params.id, req.user.uid);
  if (!outcome) return res.status(404).json({ error: 'This run is no longer in progress.', code: 'JOB_NOT_FOUND' });
  res.json({ status: outcome });
});

router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'This run is no longer in progress. It may have finished, so check your dashboard, or try again.', code: 'JOB_NOT_FOUND' });

  res.json({
    id: job.id,
    status: job.status,
    phase: job.phase,
    detail: job.detail,
    progress: job.progress,
    error: job.error,
    result: job.status === 'done' ? job.result : null,
    elapsedMs: Date.now() - job.createdAt,
  });
});

/** Facts the Privacy Policy and Terms pages print, kept in .env with everything else. */
router.get('/site', (_req, res) => {
  res.json({ contactEmail: config.site.contactEmail || null, dataMaxDays: config.store.maxDataDays });
});

// Visitors are logged out, so these are limited per address, not per account.
const ipKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const waitlistLimit = createRateLimit({ perHour: 8, noun: 'waitlist sign-ups', keyFn: ipKey });
const emailCheckLimit = createRateLimit({ perHour: 60, noun: 'email checks', keyFn: ipKey });

/** Public: can this address's domain receive mail? Asked before an account is created. */
router.post('/email-check', emailCheckLimit, wrap(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  res.json({ ok: Boolean(email) && (await domainAcceptsMail(email.split('@').pop())) });
}));

/** Public: saves an email for a paid plan that is not on sale yet. `company` is a honeypot for bots. */
router.post('/waitlist', waitlistLimit, wrap(async (req, res) => {
  const body = req.body ?? {};
  if (typeof body.company === 'string' && body.company.trim()) return res.json({ ok: true }); // a bot: pretend it worked
  const email = normalizeEmail(body.email);
  if (!email) throw bad('Enter a valid email address.');
  const plan = String(body.plan ?? '').toLowerCase();
  if (!WAITLIST_PLANS.includes(plan)) throw bad('Choose Creator or Studio.');
  await joinWaitlist({ email, plan, uid: req.user?.uid ?? null });
  res.json({ ok: true });
}));

router.get('/quota', requireUser, requireAdmin, wrap(async (req, res) => {
  res.json({
    ...(await quotaStatus({
      contentType: req.query.contentType,
      deepScan: req.query.deepScan === 'true',
      channelMode: req.query.channelMode === 'true',
    })),
    cache: await cache.stats(),
    cacheTtlSeconds: config.cache.ttlSeconds,
    rateLimitPerHour: config.rateLimit.perHour,
  });
}));

/**
 * Report history, newest first. One row per persisted run with the counts and
 * relevance summary, so the list is useful without opening any of them.
 */
// ?limit=-1 used to return everything (slice(0, -1)).
export const clampLimit = (v, d, max) => Math.max(1, Math.min(Math.floor(Number(v)) || d, max));
// ?niche=a&niche=b arrives as an array and crashed nicheKey with a 500.
const firstParam = (v) => (Array.isArray(v) ? v[0] : v) == null ? undefined : String(Array.isArray(v) ? v[0] : v);
// No upper bound let 1e20 overflow the next-run date and crash the scheduler.
export const validInterval = (h) => Number.isFinite(h) && h >= config.scheduler.minIntervalHours && h <= config.scheduler.maxIntervalHours;

router.get('/runs', wrap(async (req, res) => {
  // Your history is the reports you ran or joined, not everyone's: the index is shared.
  if (!req.user) return res.json({ runs: [] });
  const limit = clampLimit(req.query.limit, 30, 200);
  const own = await runIdsFor(req.user.uid);
  res.json({
    runs: store.ownRuns(await store.listRuns({
      limit,
      runIds: own,
      // Same key derivation the pipeline and the store use, so "runs of this
      // subject" means one thing everywhere.
      nicheKey: req.query.niche || req.query.channelId
        ? store.subjectKey({ niche: firstParam(req.query.niche), channelId: firstParam(req.query.channelId) })
        : undefined,
      // Scopes history to one page's mode (niche explorer vs channel analyzer)
      // when the caller isn't already asking for one specific subject.
      channelMode: req.query.mode === 'channel' ? true : req.query.mode === 'niche' ? false : undefined,
    }), own),
  });
}));

/**
 * A finished report, by run id. This is what makes a report shareable and
 * bookmarkable: before it existed a report lived only in React state plus a
 * 3-hour query-hash cache, so a page reload lost it and there was no URL to
 * send anyone. Costs no quota -- it is a disk read of an already-paid-for run.
 */
router.get('/runs/:runId', wrap(async (req, res) => {
  const result = await store.readRun(req.params.runId);
  if (!result && await store.wasExpired(req.params.runId)) {
    return res.status(410).json({
      error: `This report was removed: YouTube data is kept for ${config.store.maxDataDays} days. Run the search again to see current numbers.`,
      code: 'RUN_EXPIRED',
    });
  }
  if (!result) return res.status(404).json({ error: 'Report not found or pruned.', code: 'RUN_NOT_FOUND' });
  res.json({ status: 'done', persisted: true, result });
}));

/**
 * "Make it": hooks, script beats and SEO for one gap of a saved report. A saved
 * brief is a disk read; generating one is a single DeepSeek call, polled through
 * the job registry like an analysis (a reasoning model can take over a minute).
 */
router.get('/runs/:runId/gaps/:i/brief', wrap(async (req, res) => {
  // 200 with a null brief rather than a 404: "none yet" is the normal state of
  // most gaps, and the page asks for every one on load.
  const language = String(req.query.language ?? '').slice(0, 40);
  const saved = await store.readBrief(req.params.runId, Number(req.params.i), language);
  res.json({ status: saved ? 'done' : 'none', cached: Boolean(saved), brief: saved });
}));

router.post('/runs/:runId/gaps/:i/brief', requireUser, requireVerified, requireTerms, wrap(async (req, res) => {
  const uid = req.user.uid;
  const index = Number(req.params.i);
  const force = req.body?.force === true;
  const language = String(req.body?.language ?? '').trim().slice(0, 40);
  // Redraft options. Anything unrecognised is ignored rather than rejected.
  const format = ['short', 'long-form'].includes(req.body?.format) ? req.body.format : '';
  const style = ['points', 'script'].includes(req.body?.style) ? req.body.style : '';
  const minutes = Number(req.body?.targetMinutes);
  const targetMinutes = Number.isInteger(minutes) && minutes >= 1 && minutes <= config.brief.maxMinutes ? minutes : null;
  // A redraft replaces the one saved brief everyone with the link sees, so only
  // someone who has this report in their own history may ask for one.
  if (force && !(await runIdsFor(uid)).includes(req.params.runId)) {
    return res.status(403).json({ error: 'Only someone who ran this report can redraft its briefs.', code: 'NOT_OWNER' });
  }
  {
    // Saved briefs and joins of a running job cost nothing, so they skip the limiter.
    const free = !force && ((await store.readBrief(req.params.runId, index, language)) || null);
    if (free) return res.json({ status: 'done', cached: true, brief: free });
    // Joining a draft already running, and asking for a gap that does not exist,
    // cost nothing, so neither is charged to the hourly allowance.
    const peek = await brief.peekBrief(req.params.runId, index, language);
    if (peek.missing) return res.status(404).json({ error: 'That gap was not found in this report.', code: 'GAP_NOT_FOUND' });
    if (peek.jobId) {
      if (force) return res.status(409).json({ error: 'A draft of this brief is already running. Wait for it, then redraft.', code: 'BRIEF_RUNNING', jobId: peek.jobId });
      return res.status(202).json({ status: 'running', jobId: peek.jobId, cached: false });
    }
    // Only a NEW generation (one DeepSeek call) takes a daily brief; see /analyze
    // for why the allowance comes before the hourly limiter.
    const day = quotaDay();
    const used = await tryConsume(uid, day, 'briefs', limitsFor(req.user).briefs);
    if (!used.ok) return res.status(429).json(dailyLimitBody(used.limit, ['brief', 'briefs']));

    const allowed = await new Promise((resolve) => {
      let called = false;
      briefRateLimit(req, res, () => { called = true; resolve(true); });
      if (!called) resolve(false);
    });
    if (!allowed) return void (await refund(uid, day, 'briefs'));
    try {
      const started = await brief.startBrief(req.params.runId, index, { force, language, format, style, targetMinutes, core: req.body?.core === true,
        // Which saved brief's essentials to keep; null re-plans from scratch.
        planFrom: typeof req.body?.planFrom === 'string' ? req.body.planFrom.trim().slice(0, 40) : null });
      if (started.status === 'done' || !started.jobId || started.joined) await refund(uid, day, 'briefs');
      else jobs.whenSettled(started.jobId, (err) => { if (err) quietly(refund(uid, day, 'briefs')); }); // a failed draft is owed back
      res.status(started.status === 'done' ? 200 : 202).json(started);
    } catch (err) {
      await refund(uid, day, 'briefs');
      throw err;
    }
  }
}));

// ------------------------------------------------------------- watches ----

/**
 * Saved subjects, re-analysed on an interval. A watch is what actually builds
 * the baseline gap recurrence needs -- without something re-running the
 * analysis, "recurring" can never become true.
 */
router.get('/watches', requireUser, wrap(async (req, res) => {
  res.json({
    watches: watches.ownedBy(await watches.list(), req.user.uid).map(publicWatch),
    minIntervalHours: config.scheduler.minIntervalHours,
    // What THIS person may keep, not the server-wide ceiling.
    maxWatches: config.users.maxWatches,
    schedulerEnabled: config.scheduler.enabled,
  });
}));

router.post('/watches', requireUser, requireVerified, wrap(async (req, res) => {
  if (!config.features.watches) throw bad('Watches are not available yet.');
  const uid = req.user.uid;
  const input = validate(req.body ?? {});

  const existing = await watches.list();
  if (watches.atOwnerCap(existing, uid, config.users.maxWatches)) {
    throw bad(`You can keep ${config.users.maxWatches} ${config.users.maxWatches === 1 ? 'watch' : 'watches'}. Delete one first.`);
  }
  if (existing.length >= config.scheduler.maxWatches) {
    throw bad(`At most ${config.scheduler.maxWatches} watches. Delete one first.`);
  }

  const intervalHours = Number(req.body.intervalHours ?? 24 * 7);
  if (!validInterval(intervalHours)) {
    // A floor, not a preference: each run spends real quota unattended, and a
    // watch on a 1-hour interval would drain the day's budget while nobody
    // was looking.
    throw bad(`intervalHours must be between ${config.scheduler.minIntervalHours} and ${config.scheduler.maxIntervalHours}.`);
  }

  // The same subject watched twice would just double-spend quota to append
  // duplicate history for one niche.
  if (watches.hasDuplicate(existing, uid, input)) {
    throw bad('That exact query is already being watched.');
  }

  res.status(201).json({ watch: publicWatch(await watches.create({ input, intervalHours, label: req.body.label, ownerUid: uid })) });
}));

// Someone else's watch answers exactly like a missing one: 404, never 403, so a
// guessed id does not confirm that it exists.
const notYourWatch = (res) => res.status(404).json({ error: 'Watch not found.', code: 'WATCH_NOT_FOUND' });

router.patch('/watches/:id', requireUser, wrap(async (req, res) => {
  if (!watches.ownedWatch(await watches.list(), req.params.id, req.user.uid)) return notYourWatch(res);
  const patch = {};
  if (req.body?.enabled !== undefined) patch.enabled = Boolean(req.body.enabled);
  if (req.body?.label !== undefined) patch.label = String(req.body.label).slice(0, 120);
  if (req.body?.intervalHours !== undefined) {
    const h = Number(req.body.intervalHours);
    if (!validInterval(h)) {
      throw bad(`intervalHours must be between ${config.scheduler.minIntervalHours} and ${config.scheduler.maxIntervalHours}.`);
    }
    patch.intervalHours = h;
  }
  const updated = await watches.update(req.params.id, patch);
  if (!updated) return notYourWatch(res);
  res.json({ watch: publicWatch(updated) });
}));

router.delete('/watches/:id', requireUser, wrap(async (req, res) => {
  if (!watches.ownedWatch(await watches.list(), req.params.id, req.user.uid) || !(await watches.remove(req.params.id))) {
    return notYourWatch(res);
  }
  res.status(204).end();
}));

/** What the newest run of a watch found that the previous one did not. Free. */
router.get('/watches/:id/digest', requireUser, wrap(async (req, res) => {
  if (!watches.ownedWatch(await watches.list(), req.params.id, req.user.uid)) return notYourWatch(res);
  const d = await scheduler.digest(req.params.id);
  if (!d) return res.status(404).json({ error: 'No completed run for that watch yet.', code: 'NO_DIGEST' });
  res.json({ digest: d });
}));

// -------------------------------------------------------------- account ----

/** The signed-in person, today's usage and what the limits are. */
router.get('/me', requireUser, wrap(async (req, res) => {
  const { uid } = req.user;
  // Independent reads go out together: each is a round trip to the database.
  const day = quotaDay();
  const [found, usage, watchCount] = await Promise.all([
    getUser(uid),
    usageFor(uid, day),
    // Watches are held back until the audit; when on, count only this person's.
    config.features.watches ? watches.countOwnedBy(uid) : 0,
  ]);
  // The row exists after loadUser unless it was just deleted; recreate rather than 500.
  const user = found ?? (await upsertUser(req.user));
  res.json({
    user: {
      uid: user.uid, email: user.email, name: user.name, photoUrl: user.photoUrl, provider: user.provider,
      emailVerified: user.emailVerified, createdAt: user.createdAt, termsAcceptedAt: user.termsAcceptedAt,
      hasCustomAvatar: user.hasCustomAvatar,
    },
    usage: { day, analyses: usage.analyses, briefs: usage.briefs },
    limits: limitsFor(req.user),
    resetsAt: nextQuotaReset(),
    watches: watchCount,
  });
}));

/** Records that the person accepted the Terms and Privacy Policy. */
router.post('/me/consent', requireUser, wrap(async (req, res) => {
  await upsertUser(req.user); // make sure the row exists before stamping it
  res.json({ ok: true, termsAcceptedAt: await acceptTerms(req.user.uid) });
}));

// Each picture is about 30 KB; a person has no reason to change it often.
const avatarLimit = createRateLimit({ perHour: 20, noun: 'picture changes' });

/** Saves the picture the browser resized (a JPEG data URL). */
router.put('/me/avatar', requireUser, requireVerified, avatarLimit, wrap(async (req, res) => {
  const bytes = parseAvatarDataUrl(req.body?.image);
  await upsertUser(req.user); // make sure the row exists before attaching to it
  await setAvatar(req.user.uid, bytes);
  res.json({ ok: true, photoUrl: (await getUser(req.user.uid)).photoUrl });
}));

router.delete('/me/avatar', requireUser, wrap(async (req, res) => {
  await clearAvatar(req.user.uid);
  res.json({ ok: true, photoUrl: (await getUser(req.user.uid))?.photoUrl ?? null });
}));

/** A person's uploaded picture. Public, like any avatar; the URL carries a version, so it can be cached for good. */
router.get('/avatar/:uid', wrap(async (req, res) => {
  const bytes = await getAvatar(String(req.params.uid).slice(0, 128));
  if (!bytes) return res.status(404).json({ error: 'No picture.', code: 'NOT_FOUND' });
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.send(bytes);
}));

/**
 * Deletes everything held about the account: profile (and picture), report links, usage
 * (except today's counter, see deleteUserData), watches and waitlist rows. Reports and
 * drafts stay: other people may have the same report linked, it holds no personal
 * data about the deleted person, and the retention
 * sweep removes it within YOUTUBE_DATA_MAX_DAYS regardless. The browser deletes
 * the Firebase account itself (the server holds no admin credentials).
 */
router.delete('/me', requireUser, wrap(async (req, res) => {
  const { uid, email } = req.user;
  await watches.removeOwned(uid);
  await deleteUserData(uid, email, quotaDay());
  forgetUser(uid);
  res.json({ ok: true });
}));

// ------------------------------------------------------------- featured ----

/** A trimmed sample report for the marketing homepage. Public; nothing in it is per-user. */
router.get('/featured', wrap(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const reports = await store.featuredReports();
  const featured = reports[0] ?? await store.featuredReport();
  res.json({ featured, reports: reports.length ? reports : [featured].filter(Boolean) });
}));

// ------------------------------------------------------------ audit log ----

/**
 * Audit trail: what each run actually extracted, and whether it stayed on the
 * requested niche. One row per run, newest first, with the relevance summary
 * so drift is visible without opening every log. Operator-only (ADMIN_EMAILS):
 * the logs cover every account's searches and quote comments and error stacks.
 */
router.get('/logs', requireUser, requireAdmin, wrap(async (req, res) => {
  const limit = clampLimit(req.query.limit, 30, 100);
  res.json({ runs: await listAuditRuns(limit) });
}));

/** The full human-readable log for one run -- the thing to actually read. */
router.get('/logs/:runId', requireUser, requireAdmin, wrap(async (req, res) => {
  const text = await readRunLog(req.params.runId);
  if (text === null) return res.status(404).json({ error: 'Log not found or expired.', code: 'LOG_NOT_FOUND' });
  res.type('text/plain').send(text);
}));
