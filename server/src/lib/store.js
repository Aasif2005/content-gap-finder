import crypto from 'node:crypto';
import { config } from '../config.js';
import { col } from './mongo.js';

/**
 * Durable storage for finished reports, "Make it" drafts and the per-niche gap
 * history that recurrence detection reads (MongoDB collections runs, expired_runs,
 * briefs, niche_history).
 *
 * The difference from lib/cache.js is what the key MEANS. The cache is keyed by a
 * hash of the query, so it answers "have we run exactly this recently?" and
 * expires in hours. This is keyed by runId and lives for the 30 days YouTube's
 * policies allow (see sweepExpired), so it answers "show me that report again":
 * what makes a report linkable at all.
 *
 * Reports and drafts carry an `expireAt` a day past the retention limit, which a
 * TTL index uses as a backstop; the sweep normally removes them first and leaves
 * a marker so the API can say "removed" instead of "not found".
 */
const DAY_MS = 24 * 3600 * 1000;
// Gap history holds our own model-written questions and scores, never raw
// YouTube text; the derived-metrics amendment allows 36 months for those.
export const HISTORY_MAX_DAYS = 36 * 30;

const validId = (id) => /^[a-zA-Z0-9_-]+$/.test(id ?? '');
const plain = (x) => JSON.parse(JSON.stringify(x)); // what the old JSON files stored: no undefined, no class instances
const dropMeta = ({ _id, expireAt, ...rest }) => rest;

/**
 * Niches are user-typed, so "Sourdough Baking" and " sourdough  baking " have
 * to land on the same history file or recurrence silently never matches.
 * Hashed rather than slugified because a niche can contain any script at all
 * (Tamil, Arabic, emoji) and those don't make safe filenames.
 */
export function nicheKey(niche) {
  const normalized = (niche ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------- reports ---

/**
 * The history key for a run's subject. Channel-mode runs have no niche text at
 * all, so hashing `query.niche` would collide every channel on the hash of the
 * empty string. Mirrors the key the pipeline hands to appendGapHistory(), so
 * "previous runs of this subject" means the same thing in both places.
 */
export const subjectKey = (query) =>
  query.channelId ? nicheKey(`channel:${query.channelId}`) : nicheKey(query.niche);

/** One compact index line per run, so listing history never opens every report. */
const summarize = (result) => ({
  runId: result.runId,
  niche: result.query.niche,
  nicheKey: subjectKey(result.query),
  window: result.query.window,
  contentType: result.query.contentType,
  regionCode: result.query.regionCode ?? null,
  relevanceLanguage: result.query.relevanceLanguage ?? null,
  deepScan: Boolean(result.query.deepScan),
  channelMode: Boolean(result.query.channelId),
  // listRuns() can filter on this; without it that filter silently matched nothing.
  channelId: result.query.channelId ?? null,
  channelTitle: result.channel?.title ?? null,
  generatedAt: result.generatedAt,
  videosAnalyzed: result.stats.videosAnalyzed,
  topicsFound: result.stats.topicsFound,
  gapsFound: result.stats.gapsFound,
  avoidFound: result.stats.avoidFound,
  objectionsFound: result.stats.objectionsFound ?? 0,
  thinPool: Boolean(result.thinPool),
  relevance: result.stats.relevance ?? null,
});

export async function saveRun(result) {
  if (!result?.runId) return null;
  const summary = summarize(result);
  const keepUntil = new Date(new Date(result.generatedAt).getTime() + (config.store.maxDataDays + 1) * DAY_MS);
  await col('runs').replaceOne(
    { _id: result.runId },
    { ...summary, expireAt: Number.isFinite(keepUntil.getTime()) ? keepUntil : new Date(Date.now() + (config.store.maxDataDays + 1) * DAY_MS), result: plain(result) },
    { upsert: true }
  );
  await pruneRuns();
  return summary;
}

export async function readRun(runId) {
  if (!validId(runId)) return null;
  const doc = await col('runs').findOne({ _id: runId }, { projection: { result: 1 } });
  return doc?.result ?? null;
}

/**
 * Newest first. `nicheKey` narrows to one niche's history, which is what the
 * recurrence pass and the "previous runs of this niche" UI both want.
 */
export async function listRuns({ limit = 30, nicheKey: key, channelId, channelMode } = {}) {
  const filter = {};
  if (key) filter.nicheKey = key;
  if (channelId) filter.channelId = channelId;
  // Lets the two separate pages (niche explorer / channel analyzer) each show
  // only their own history, instead of one mixed list.
  if (channelMode !== undefined) filter.channelMode = channelMode;
  let cursor = col('runs').find(filter, { projection: { result: 0 } }).sort({ generatedAt: -1 });
  if (Number.isFinite(limit)) cursor = cursor.limit(limit);
  return (await cursor.toArray()).map(dropMeta);
}

/**
 * Only the rows whose run id is in `ids` (an array or a Set): the caller's own
 * history. The run index is shared by everyone, so ownership is a join against
 * the user_runs table (lib/db.js), done here as a pure filter.
 */
export function ownRuns(rows, ids) {
  const own = ids instanceof Set ? ids : new Set(ids);
  return rows.filter((r) => own.has(r.runId));
}

// -------------------------------------------------------- featured sample ---

/**
 * Index rows that could be the homepage sample, best first: the newest runs of
 * `niche` with at least 2 gaps. Only that niche: the run index is everyone's
 * searches, and a stranger's search must never headline the marketing page.
 * Nothing older than `maxDays` is ever offered -- a sample is still YouTube
 * data, on the same 30-day clock as every other report.
 *
 * Channel analyses are left out: they have no niche to headline a homepage with.
 * Returns candidates rather than one row so the caller can step past a report
 * whose file has since been pruned.
 */
export function featuredCandidates(rows, { now = Date.now(), niche, maxDays = config.store.maxDataDays } = {}) {
  const cutoff = now - maxDays * DAY_MS;
  const fresh = rows
    .filter((r) => !r.channelMode && Number.isFinite(new Date(r.generatedAt).getTime()) && new Date(r.generatedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  const key = niche ? nicheKey(niche) : null;
  return key ? fresh.filter((r) => r.nicheKey === key && (r.gapsFound ?? 0) >= 2) : [];
}

const top = (list, n) => (Array.isArray(list) ? list.slice(0, n) : []);

/** The few fields of a report the marketing page shows, so a public endpoint hands out a sample, not the whole report. */
export function trimFeatured(run) {
  const gaps = top(run.gaps, 3).map((g) => ({
    question: g.question,
    demandStrength: g.demandStrength,
    coverage: g.coverage,
    evidenceCount: g.evidenceCount,
    distinctVideos: g.distinctVideos,
    demandScore: g.demandScore,
    suggestedTitle: g.suggestedTitle,
    evidence: top(g.evidence, 3).map((e) => ({ text: e.text, likes: e.likes, videoId: e.videoId })),
  }));
  const topics = top(run.topics, 3).map((t) => ({
    label: t.label,
    heatScore: t.heatScore,
    summary: t.summary,
    videos: top(t.videos, 3).map((v) => ({
      videoId: v.videoId, title: v.title, channelTitle: v.channelTitle, views: v.views, url: v.url, thumbnail: v.thumbnail,
    })),
  }));
  // Every video the run knows about, so a comment's source can be named.
  const titles = new Map();
  for (const v of [...(run.topVideos ?? []), ...(run.topics ?? []).flatMap((t) => t.videos ?? []), ...(run.gaps ?? []).flatMap((g) => g.coveringVideos ?? [])]) {
    if (v?.videoId && v.title && !titles.has(v.videoId)) titles.set(v.videoId, v.title);
  }
  const videoTitles = {};
  for (const g of gaps) for (const e of g.evidence) if (titles.has(e.videoId)) videoTitles[e.videoId] = titles.get(e.videoId);

  const st = run.stats ?? {};
  return {
    runId: run.runId,
    generatedAt: run.generatedAt,
    query: { niche: run.query?.niche ?? '', window: run.query?.window, contentType: run.query?.contentType },
    // Counts only: stats also carries token usage and search plumbing.
    stats: {
      videosFound: st.videosFound, videosAnalyzed: st.videosAnalyzed, videosWithComments: st.videosWithComments,
      commentsFetched: st.commentsFetched, commentsAnalyzed: st.commentsAnalyzed,
      topicsFound: st.topicsFound, gapsFound: st.gapsFound,
    },
    gaps,
    topics,
    videoTitles,
  };
}

/**
 * The report shown on the homepage, trimmed: FEATURED_RUN_ID when it is still
 * stored and inside the retention window, else the best candidate that can still
 * be read. null when there is nothing to show.
 */
export async function featuredReport({ now = Date.now() } = {}) {
  const cutoff = now - config.store.maxDataDays * DAY_MS;
  const fresh = (run) => run && new Date(run.generatedAt).getTime() >= cutoff;
  if (config.featured.runId) {
    const run = await readRun(config.featured.runId);
    if (fresh(run)) return trimFeatured(run);
  }
  for (const row of featuredCandidates(await listRuns({ limit: 500 }), { now, niche: config.featured.niche })) {
    const run = await readRun(row.runId);
    if (fresh(run)) return trimFeatured(run);
  }
  return null;
}

/**
 * Keeps the newest `config.store.maxRuns` reports and drops the rest. An
 * unbounded collection is still a slow leak on a long-lived database, and the
 * per-niche gap history (below) is the part that needs to survive long-term:
 * it is far smaller.
 */
async function pruneRuns() {
  const max = config.store.maxRuns;
  if ((await col('runs').estimatedDocumentCount()) <= max) return;
  // A report a watch points to is its latest digest; deleting it left the
  // watch saying "no completed run".
  const pinned = new Set((await col('watches').find({ lastRunId: { $ne: null } }, { projection: { lastRunId: 1 } }).toArray()).map((w) => w.lastRunId));
  const rows = await col('runs').find({}, { projection: { _id: 1 } }).sort({ generatedAt: -1 }).skip(max).toArray();
  const drop = rows.map((r) => r._id).filter((id) => !pinned.has(id));
  if (!drop.length) return;
  await col('runs').deleteMany({ _id: { $in: drop } });
  // A brief is meaningless without the report it was drafted from.
  await col('briefs').deleteMany({ runId: { $in: drop } });
}

// ------------------------------------------------------------- retention ---

// YouTube's Developer Policies (III.E.4) allow API data -- titles, channel
// names, comment text, and statistics -- to be stored for at most 30 days.
// A report and its briefs are made of exactly that, so they expire whole,
// watches or not: a watch's next run refreshes the data anyway.

/** Splits rows into [keep, drop] by a date field against a cutoff (ms). */
export function partitionByAge(rows, cutoffMs, field = 'generatedAt') {
  const keep = [];
  const drop = [];
  for (const r of rows) {
    const t = new Date(r?.[field]).getTime();
    (Number.isFinite(t) && t < cutoffMs ? drop : keep).push(r);
  }
  return [keep, drop];
}

/**
 * Deletes every report, brief and gap-history row past its retention limit.
 * Returns counts for the log line.
 */
export async function sweepExpired({ now = Date.now(), maxDays = config.store.maxDataDays } = {}) {
  const cutoff = now - maxDays * DAY_MS;
  const cutoffIso = new Date(cutoff).toISOString();
  const old = await col('runs').find({ generatedAt: { $lt: cutoffIso } }, { projection: { _id: 1 } }).toArray();
  const ids = old.map((r) => r._id);
  if (ids.length) {
    // Only ids and dates: enough to tell "expired" from "never existed".
    const at = new Date(now);
    await col('expired_runs').bulkWrite(ids.map((id) => ({ updateOne: { filter: { _id: id }, update: { $setOnInsert: { expiredAt: at } }, upsert: true } })));
    await col('runs').deleteMany({ _id: { $in: ids } });
  }
  // Briefs quote titles and comments and are never younger than their report.
  const briefs = (await col('briefs').deleteMany({ $or: [{ runId: { $in: ids } }, { createdAt: { $lt: new Date(cutoff) } }] })).deletedCount;
  const historyCutoff = new Date(now - HISTORY_MAX_DAYS * DAY_MS).toISOString();
  const historyRows = (await col('niche_history').deleteMany({ generatedAt: { $lt: historyCutoff } })).deletedCount;
  return { runs: ids.length, briefs, historyRows };
}

/** Whether a run id was deleted by the retention sweep (vs. never existing). */
export async function wasExpired(runId) {
  if (!validId(runId)) return false;
  return (await col('expired_runs').countDocuments({ _id: runId }, { limit: 1 })) > 0;
}

// ---------------------------------------------------------------- briefs ---

/**
 * A "Make it" brief (hooks, script beats, SEO) for one gap of one report. Kept
 * by (runId, gap index) so a second click costs nothing: the DeepSeek call is
 * the only thing here that spends money, and a creator will re-open the same
 * gap several times while deciding.
 */
// The language is part of the key: the same gap drafted in English and in Tamil
// are two different, equally paid-for briefs. Hashed (not slugified) because a
// language can be typed in any script.
const languageSuffix = (language) => {
  const l = (language ?? '').trim().toLowerCase();
  return l ? `-l${crypto.createHash('sha1').update(l).digest('hex').slice(0, 8)}` : '';
};


const briefId = (runId, index, language) =>
  validId(runId) && Number.isInteger(index) && index >= 0 ? `${runId}-${index}${languageSuffix(language)}` : null;

export async function saveBrief(runId, index, brief, language = '') {
  const id = briefId(runId, index, language);
  if (!id) return;
  const createdAt = new Date();
  await col('briefs').replaceOne(
    { _id: id },
    { runId, index, brief: plain(brief), createdAt, expireAt: new Date(createdAt.getTime() + (config.store.maxDataDays + 1) * DAY_MS) },
    { upsert: true }
  );
}

export async function readBrief(runId, index, language = '') {
  const id = briefId(runId, index, language);
  if (!id) return null;
  return (await col('briefs').findOne({ _id: id }))?.brief ?? null;
}

// --------------------------------------------------- per-niche gap history ---

/**
 * Appends this run's gaps to the niche's history. Only the fields recurrence
 * needs are stored, not whole gap objects -- this history is meant to stay small
 * enough to keep for months, because the entire value of recurrence detection
 * comes from having a long baseline to compare against.
 */
export async function appendGapHistory(niche, runId, generatedAt, gaps, { filters = {}, comments = null } = {}) {
  const key = nicheKey(niche);
  // Every run leaves a row, even one with no gaps: a marker records that the
  // run happened and how many comments it mined, so a later run can tell
  // "nobody asked" from "nothing was read".
  const base = { runId, generatedAt, ...filters, comments };
  const rows = gaps.length
    ? gaps.map((g) => ({
      ...base,
      question: g.question,
      coverage: g.coverage,
      demandStrength: g.demandStrength,
      demandScore: g.demandScore,
      evidenceCount: g.evidenceCount,
      distinctVideos: g.distinctVideos,
    }))
    : [{ ...base, marker: true }];
  const when = new Date(generatedAt).getTime();
  const expireAt = new Date((Number.isFinite(when) ? when : Date.now()) + HISTORY_MAX_DAYS * DAY_MS);
  await col('niche_history').insertMany(rows.map((r) => ({ ...plain(r), nicheKey: key, expireAt })));
}

/** Every previously recorded gap for a niche, excluding the run being analysed. */
export async function readGapHistory(niche, { excludeRunId } = {}) {
  const filter = { nicheKey: nicheKey(niche) };
  if (excludeRunId) filter.runId = { $ne: excludeRunId };
  const rows = await col('niche_history').find(filter).sort({ _id: 1 }).toArray(); // insertion order, as the old file had
  return rows.map(({ _id, nicheKey: _k, expireAt, ...row }) => row);
}

export async function stats() {
  const [runs, niches] = await Promise.all([col('runs').estimatedDocumentCount(), col('niche_history').distinct('nicheKey')]);
  return { runs, niches: niches.length };
}
