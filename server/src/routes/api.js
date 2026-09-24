import express from 'express';
import * as jobs from '../lib/jobs.js';
import * as cache from '../lib/cache.js';
import { rateLimit } from '../lib/rateLimit.js';
import { quotaStatus } from '../lib/quota.js';
import * as runner from '../services/runner.js';
import { config } from '../config.js';
import { MAX_CUSTOM_WINDOW_DAYS, parseChannelInput } from '../services/youtube.js';
import { listRuns as listAuditRuns, readRunLog } from '../lib/auditLog.js';
import * as store from '../lib/store.js';
import * as watches from '../lib/watches.js';
import * as scheduler from '../services/scheduler.js';

export const router = express.Router();

/** A client-fixable input problem: 400 with a code that says so. */
const bad = (message) => Object.assign(new Error(message), { status: 400, code: 'VALIDATION' });

const WINDOWS = new Set(['24h', '7d', '30d', '90d', 'custom']);
const CONTENT_TYPES = new Set(['shorts', 'long', 'both']);
const GAP_MODES = new Set(['inclusive', 'strict']);

function validate(body) {
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

  // Opt-in: doubles the search.list slices to widen the candidate pool. Costs
  // real quota, so it is never on by default -- see lib/searchPlan.js.
  const deepScan = body.deepScan === true;

  // ISO 3166-1 alpha-2 / ISO 639-1 respectively; YouTube rejects anything else.
  const regionCode = body.regionCode ? String(body.regionCode).toUpperCase().slice(0, 2) : undefined;
  const relevanceLanguage = body.relevanceLanguage ? String(body.relevanceLanguage).toLowerCase().slice(0, 2) : undefined;

  return { niche, window, customAfter, contentType, gapMode, minViews, regionCode, relevanceLanguage, deepScan, channelId };
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, quota: quotaStatus(), cache: cache.stats(), store: store.stats(), phases: jobs.PHASES });
});

/**
 * Starts an analysis. Returns immediately with either a cached result or a job
 * id to poll -- the pipeline takes 20-60s and holding the request open that long
 * is how you collect proxy timeouts.
 */
router.post('/analyze', (req, res, next) => {
  let input;
  try {
    input = validate(req.body ?? {});
  } catch (err) {
    return next(err);
  }

  const force = req.body?.force === true;

  // A cache hit costs nothing, so it bypasses the rate limit entirely --
  // browsing already-computed reports should never be throttled.
  if (!force) {
    const hit = cache.get(cache.cacheKey(input));
    if (hit) {
      return res.json({ status: 'done', cached: true, cacheAgeSeconds: hit.ageSeconds, result: hit.value });
    }
  }

  // Only uncached runs count against the per-IP limit and the YouTube quota.
  rateLimit(req, res, () => {
    const started = runner.startAnalysis(input, { force });
    res.status(started.status === 'done' ? 200 : 202).json(started);
  });
});

router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found or expired.', code: 'JOB_NOT_FOUND' });

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

router.get('/quota', (req, res) => {
  res.json({
    ...quotaStatus({
      contentType: req.query.contentType,
      deepScan: req.query.deepScan === 'true',
      channelMode: req.query.channelMode === 'true',
    }),
    cache: cache.stats(),
    cacheTtlSeconds: config.cache.ttlSeconds,
    rateLimitPerHour: config.rateLimit.perHour,
  });
});

/**
 * Report history, newest first. One row per persisted run with the counts and
 * relevance summary, so the list is useful without opening any of them.
 */
router.get('/runs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  res.json({
    runs: store.listRuns({
      limit,
      // Same key derivation the pipeline and the store use, so "runs of this
      // subject" means one thing everywhere.
      nicheKey: req.query.niche || req.query.channelId
        ? store.subjectKey({ niche: req.query.niche, channelId: req.query.channelId })
        : undefined,
    }),
  });
});

/**
 * A finished report, by run id. This is what makes a report shareable and
 * bookmarkable: before it existed a report lived only in React state plus a
 * 3-hour query-hash cache, so a page reload lost it and there was no URL to
 * send anyone. Costs no quota -- it is a disk read of an already-paid-for run.
 */
router.get('/runs/:runId', (req, res) => {
  const result = store.readRun(req.params.runId);
  if (!result) return res.status(404).json({ error: 'Report not found or pruned.', code: 'RUN_NOT_FOUND' });
  res.json({ status: 'done', persisted: true, result });
});

// ------------------------------------------------------------- watches ----

/**
 * Saved subjects, re-analysed on an interval. A watch is what actually builds
 * the baseline gap recurrence needs -- without something re-running the
 * analysis, "recurring" can never become true.
 */
router.get('/watches', (_req, res) => {
  res.json({
    watches: watches.list(),
    minIntervalHours: config.scheduler.minIntervalHours,
    maxWatches: config.scheduler.maxWatches,
    schedulerEnabled: config.scheduler.enabled,
  });
});

router.post('/watches', (req, res, next) => {
  let input;
  try {
    input = validate(req.body ?? {});

    const existing = watches.list();
    if (existing.length >= config.scheduler.maxWatches) {
      throw bad(`At most ${config.scheduler.maxWatches} watches. Delete one first.`);
    }

    const intervalHours = Number(req.body.intervalHours ?? 24 * 7);
    if (!Number.isFinite(intervalHours) || intervalHours < config.scheduler.minIntervalHours) {
      // A floor, not a preference: each run spends real quota unattended, and a
      // watch on a 1-hour interval would drain the day's budget while nobody
      // was looking.
      throw bad(`intervalHours must be at least ${config.scheduler.minIntervalHours}.`);
    }

    // The same subject watched twice would just double-spend quota to append
    // duplicate history for one niche.
    const key = JSON.stringify(cache.cacheKey(input));
    if (existing.some((w) => JSON.stringify(cache.cacheKey(w.input)) === key)) {
      throw bad('That exact query is already being watched.');
    }

    res.status(201).json({ watch: watches.create({ input, intervalHours, label: req.body.label }) });
  } catch (err) {
    next(err);
  }
});

router.patch('/watches/:id', (req, res, next) => {
  try {
    const patch = {};
    if (req.body?.enabled !== undefined) patch.enabled = Boolean(req.body.enabled);
    if (req.body?.label !== undefined) patch.label = String(req.body.label).slice(0, 120);
    if (req.body?.intervalHours !== undefined) {
      const h = Number(req.body.intervalHours);
      if (!Number.isFinite(h) || h < config.scheduler.minIntervalHours) {
        throw bad(`intervalHours must be at least ${config.scheduler.minIntervalHours}.`);
      }
      patch.intervalHours = h;
    }
    const updated = watches.update(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'Watch not found.', code: 'WATCH_NOT_FOUND' });
    res.json({ watch: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/watches/:id', (req, res) => {
  if (!watches.remove(req.params.id)) {
    return res.status(404).json({ error: 'Watch not found.', code: 'WATCH_NOT_FOUND' });
  }
  res.status(204).end();
});

/** What the newest run of a watch found that the previous one did not. Free. */
router.get('/watches/:id/digest', (req, res) => {
  const d = scheduler.digest(req.params.id);
  if (!d) return res.status(404).json({ error: 'No completed run for that watch yet.', code: 'NO_DIGEST' });
  res.json({ digest: d });
});

// ------------------------------------------------------------ audit log ----

/**
 * Audit trail: what each run actually extracted, and whether it stayed on the
 * requested niche. One row per run, newest first, with the relevance summary
 * so drift is visible without opening every log.
 */
router.get('/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  res.json({ runs: listAuditRuns(limit) });
});

/** The full human-readable log for one run -- the thing to actually read. */
router.get('/logs/:runId', (req, res) => {
  const text = readRunLog(req.params.runId);
  if (text === null) return res.status(404).json({ error: 'Log not found or expired.', code: 'LOG_NOT_FOUND' });
  res.type('text/plain').send(text);
});
