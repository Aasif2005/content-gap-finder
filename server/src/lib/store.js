import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { withLock } from './fileLock.js';

/**
 * Durable storage for finished reports, and for the per-niche gap history that
 * recurrence detection reads.
 *
 * Deliberately flat files, for the same reason lib/cache.js is: a few KB per
 * run, and no extra service to run. The difference from lib/cache.js is what
 * the key MEANS. The cache is keyed by a hash of the query, so it answers
 * "have we run exactly this recently?" and expires in hours. This is keyed by
 * runId and lives for the 30 days YouTube's policies allow (see sweepExpired),
 * so it answers "show me that report again" -- which is what makes a report
 * linkable at all. Before this, a
 * finished report lived only in React state and a 3-hour query-hash cache:
 * reloading the page lost it, and there was no way to send one to anyone.
 *
 * Swap both for Postgres at these same call sites if this ever outgrows a
 * single box.
 */
const STATE_DIR = path.resolve(fileURLToPath(new URL('../../.state', import.meta.url)));
const RUNS_DIR = path.join(STATE_DIR, 'runs');
const NICHES_DIR = path.join(STATE_DIR, 'niches');
const BRIEFS_DIR = path.join(STATE_DIR, 'briefs');
const RUN_INDEX = path.join(STATE_DIR, 'runs-index.jsonl');

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

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
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

export function saveRun(result) {
  if (!result?.runId) return null;
  writeAtomic(path.join(RUNS_DIR, `${result.runId}.json`), JSON.stringify(result));

  const summary = summarize(result);
  // Append under a lock: two runs finishing at once could otherwise interleave
  // partial lines and corrupt the index for every later read.
  withLock(RUN_INDEX, () => {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(RUN_INDEX, `${JSON.stringify(summary)}\n`);
  });

  pruneRuns();
  return summary;
}

export function readRun(runId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId ?? '')) return null; // path traversal guard, same rule as the audit log
  try {
    return JSON.parse(fs.readFileSync(path.join(RUNS_DIR, `${runId}.json`), 'utf8'));
  } catch {
    return null;
  }
}

function readIndex() {
  try {
    return fs
      .readFileSync(RUN_INDEX, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Newest first. `nicheKey` narrows to one niche's history, which is what the
 * recurrence pass and the "previous runs of this niche" UI both want.
 */
export function listRuns({ limit = 30, nicheKey: key, channelId, channelMode } = {}) {
  let rows = readIndex();
  if (key) rows = rows.filter((r) => r.nicheKey === key);
  if (channelId) rows = rows.filter((r) => r.channelId === channelId);
  // Lets the two separate pages (niche explorer / channel analyzer) each show
  // only their own history, instead of one mixed list.
  if (channelMode !== undefined) rows = rows.filter((r) => r.channelMode === channelMode);
  return rows.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt)).slice(0, limit);
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
 * Index rows that could be the homepage sample, best first: the newest niche
 * run matching `niche` with at least 2 gaps, then the newest of any niche run
 * with at least 3. Nothing older than `maxDays` is ever offered -- a sample is
 * still YouTube data, on the same 30-day clock as every other report.
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
  const matching = key ? fresh.filter((r) => r.nicheKey === key && (r.gapsFound ?? 0) >= 2) : [];
  const anyRich = fresh.filter((r) => (r.gapsFound ?? 0) >= 3 && !matching.includes(r));
  return [...matching, ...anyRich];
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
 * on disk and inside the retention window, else the best candidate that can
 * still be read. null when there is nothing to show.
 */
export function featuredReport({ now = Date.now() } = {}) {
  const cutoff = now - config.store.maxDataDays * DAY_MS;
  const fresh = (run) => run && new Date(run.generatedAt).getTime() >= cutoff;
  if (config.featured.runId) {
    const run = readRun(config.featured.runId);
    if (fresh(run)) return trimFeatured(run);
  }
  for (const row of featuredCandidates(readIndex(), { now, niche: config.featured.niche })) {
    const run = readRun(row.runId);
    if (fresh(run)) return trimFeatured(run);
  }
  return null;
}

/**
 * Keeps the newest `config.store.maxRuns` reports on disk and drops the rest.
 * Reports are a few KB each, but an unbounded directory is still a slow leak on
 * a long-lived box, and the per-niche gap history (below) is the part that
 * actually needs to survive long-term -- it is far smaller.
 */
function pruneRuns() {
  // Read, filter and rewrite under ONE lock: reading outside it lost any index
  // line another writer appended in between.
  let drop = [];
  withLock(RUN_INDEX, () => {
    const rows = readIndex();
    const max = config.store.maxRuns;
    if (rows.length <= max) return;
    // A report a watch points to is its latest digest; deleting it left the
    // watch saying "no completed run".
    const pinned = pinnedRunIds();
    const sorted = rows.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    const keep = [];
    for (const [i, r] of sorted.entries()) (i < max || pinned.has(r.runId) ? keep : drop).push(r);
    writeAtomic(RUN_INDEX, keep.map((r) => `${JSON.stringify(r)}\n`).join(''));
  });
  for (const r of drop) {
    try { fs.unlinkSync(path.join(RUNS_DIR, `${r.runId}.json`)); } catch { /* already gone */ }
    // A brief is meaningless without the report it was drafted from.
    try {
      for (const f of fs.readdirSync(BRIEFS_DIR)) if (f.startsWith(`${r.runId}-`)) fs.unlinkSync(path.join(BRIEFS_DIR, f));
    } catch { /* no briefs directory yet */ }
  }
}

// Read straight from watches.json rather than importing lib/watches.js, which
// keeps the store free of a dependency on the scheduler's data model.
function pinnedRunIds() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'watches.json'), 'utf8'));
    const list = Array.isArray(data) ? data : data.watches ?? [];
    return new Set(list.map((w) => w.lastRunId).filter(Boolean));
  } catch {
    return new Set();
  }
}

// ------------------------------------------------------------- retention ---

// YouTube's Developer Policies (III.E.4) allow API data -- titles, channel
// names, comment text, and statistics -- to be stored for at most 30 days.
// A report and its briefs are made of exactly that, so they expire whole,
// watches or not: a watch's next run refreshes the data anyway.
const EXPIRED_INDEX = path.join(STATE_DIR, 'expired-runs.jsonl');
const DAY_MS = 24 * 3600 * 1000;
// Gap history holds our own model-written questions and scores, never raw
// YouTube text; the derived-metrics amendment allows 36 months for those.
export const HISTORY_MAX_DAYS = 36 * 30;

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

const removeOlderFiles = (dir, cutoffMs, match = () => true) => {
  let n = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (!match(f)) continue;
      try {
        if (fs.statSync(p).mtimeMs < cutoffMs) { fs.unlinkSync(p); n += 1; }
      } catch { /* raced with another delete */ }
    }
  } catch { /* directory not created yet */ }
  return n;
};

/**
 * Deletes every report, brief and gap-history row past its retention limit.
 * Returns counts for the log line.
 */
export function sweepExpired({ now = Date.now(), maxDays = config.store.maxDataDays } = {}) {
  const cutoff = now - maxDays * DAY_MS;
  let dropped = [];
  withLock(RUN_INDEX, () => {
    const [keep, drop] = partitionByAge(readIndex(), cutoff);
    dropped = drop;
    if (drop.length) writeAtomic(RUN_INDEX, keep.map((r) => `${JSON.stringify(r)}\n`).join(''));
  });
  for (const r of dropped) {
    try { fs.unlinkSync(path.join(RUNS_DIR, `${r.runId}.json`)); } catch { /* already gone */ }
  }
  if (dropped.length) {
    // Only ids and dates: enough to tell "expired" from "never existed".
    const at = new Date(now).toISOString();
    withLock(EXPIRED_INDEX, () => {
      fs.appendFileSync(EXPIRED_INDEX, dropped.map((r) => `${JSON.stringify({ runId: r.runId, expiredAt: at })}\n`).join(''));
    });
  }
  // Run files the index lost track of, and briefs, by file age: a brief quotes
  // titles and comments, and is never younger than the report it came from.
  const runFiles = removeOlderFiles(RUNS_DIR, cutoff, (f) => f.endsWith('.json'));
  const briefs = removeOlderFiles(BRIEFS_DIR, cutoff, (f) => f.endsWith('.json'));
  const ids = new Set(dropped.map((r) => r.runId));
  try {
    for (const f of fs.readdirSync(BRIEFS_DIR)) {
      if ([...ids].some((id) => f.startsWith(`${id}-`))) fs.unlinkSync(path.join(BRIEFS_DIR, f));
    }
  } catch { /* no briefs directory yet */ }

  let historyRows = 0;
  const historyCutoff = now - HISTORY_MAX_DAYS * DAY_MS;
  try {
    for (const f of fs.readdirSync(NICHES_DIR)) {
      const file = path.join(NICHES_DIR, f);
      withLock(file, () => {
        const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        const [keep, drop] = partitionByAge(rows, historyCutoff);
        if (!drop.length) return;
        historyRows += drop.length;
        writeAtomic(file, keep.map((r) => `${JSON.stringify(r)}\n`).join(''));
      });
    }
  } catch { /* no history yet */ }

  return { runs: dropped.length + runFiles, briefs, historyRows };
}

/** Whether a run id was deleted by the retention sweep (vs. never existing). */
export function wasExpired(runId) {
  try {
    return fs.readFileSync(EXPIRED_INDEX, 'utf8').includes(`"runId":${JSON.stringify(runId)}`);
  } catch {
    return false;
  }
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

const briefPath = (runId, index, language) =>
  /^[a-zA-Z0-9_-]+$/.test(runId ?? '') && Number.isInteger(index) && index >= 0
    ? path.join(BRIEFS_DIR, `${runId}-${index}${languageSuffix(language)}.json`)
    : null;

export function saveBrief(runId, index, brief, language = '') {
  const file = briefPath(runId, index, language);
  if (file) writeAtomic(file, JSON.stringify(brief));
}

export function readBrief(runId, index, language = '') {
  const file = briefPath(runId, index, language);
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// --------------------------------------------------- per-niche gap history ---

/**
 * Appends this run's gaps to the niche's history. Only the fields recurrence
 * needs are stored, not whole gap objects -- this file is meant to stay small
 * enough to keep for months, because the entire value of recurrence detection
 * comes from having a long baseline to compare against.
 */
export function appendGapHistory(niche, runId, generatedAt, gaps, { filters = {}, comments = null } = {}) {
  const key = nicheKey(niche);
  const file = path.join(NICHES_DIR, `${key}.jsonl`);
  // Every run leaves a row, even one with no gaps: a marker records that the
  // run happened and how many comments it mined, so a later run can tell
  // "nobody asked" from "nothing was read".
  const base = { runId, generatedAt, ...filters, comments };
  const lines = gaps.length
    ? gaps.map((g) => JSON.stringify({
      ...base,
      question: g.question,
      coverage: g.coverage,
      demandStrength: g.demandStrength,
      demandScore: g.demandScore,
      evidenceCount: g.evidenceCount,
      distinctVideos: g.distinctVideos,
    }))
    : [JSON.stringify({ ...base, marker: true })];

  withLock(file, () => {
    fs.mkdirSync(NICHES_DIR, { recursive: true });
    fs.appendFileSync(file, `${lines.join('\n')}\n`);
  });
}

/** Every previously recorded gap for a niche, excluding the run being analysed. */
export function readGapHistory(niche, { excludeRunId } = {}) {
  const file = path.join(NICHES_DIR, `${nicheKey(niche)}.jsonl`);
  let rows;
  try {
    rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
  return rows
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((r) => r && r.runId !== excludeRunId);
}

export function stats() {
  try {
    return {
      runs: fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith('.json')).length,
      niches: fs.existsSync(NICHES_DIR) ? fs.readdirSync(NICHES_DIR).filter((f) => f.endsWith('.jsonl')).length : 0,
    };
  } catch {
    return { runs: 0, niches: 0 };
  }
}
