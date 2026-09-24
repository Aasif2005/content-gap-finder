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
 * runId and never expires on a timer, so it answers "show me that report
 * again" -- which is what makes a report linkable at all. Before this, a
 * finished report lived only in React state and a 3-hour query-hash cache:
 * reloading the page lost it, and there was no way to send one to anyone.
 *
 * Swap both for Postgres at these same call sites if this ever outgrows a
 * single box.
 */
const STATE_DIR = path.resolve(fileURLToPath(new URL('../../.state', import.meta.url)));
const RUNS_DIR = path.join(STATE_DIR, 'runs');
const NICHES_DIR = path.join(STATE_DIR, 'niches');
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
export function listRuns({ limit = 30, nicheKey: key, channelId } = {}) {
  let rows = readIndex();
  if (key) rows = rows.filter((r) => r.nicheKey === key);
  if (channelId) rows = rows.filter((r) => r.channelId === channelId);
  return rows.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt)).slice(0, limit);
}

/**
 * Keeps the newest `config.store.maxRuns` reports on disk and drops the rest.
 * Reports are a few KB each, but an unbounded directory is still a slow leak on
 * a long-lived box, and the per-niche gap history (below) is the part that
 * actually needs to survive long-term -- it is far smaller.
 */
function pruneRuns() {
  const rows = readIndex();
  const max = config.store.maxRuns;
  if (rows.length <= max) return;

  const sorted = rows.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  const keep = sorted.slice(0, max);
  const drop = sorted.slice(max);

  withLock(RUN_INDEX, () => {
    writeAtomic(RUN_INDEX, keep.map((r) => `${JSON.stringify(r)}\n`).join(''));
  });
  for (const r of drop) {
    try { fs.unlinkSync(path.join(RUNS_DIR, `${r.runId}.json`)); } catch { /* already gone */ }
  }
}

// --------------------------------------------------- per-niche gap history ---

/**
 * Appends this run's gaps to the niche's history. Only the fields recurrence
 * needs are stored, not whole gap objects -- this file is meant to stay small
 * enough to keep for months, because the entire value of recurrence detection
 * comes from having a long baseline to compare against.
 */
export function appendGapHistory(niche, runId, generatedAt, gaps) {
  const key = nicheKey(niche);
  const file = path.join(NICHES_DIR, `${key}.jsonl`);
  const lines = gaps.map((g) => JSON.stringify({
    runId,
    generatedAt,
    question: g.question,
    coverage: g.coverage,
    demandStrength: g.demandStrength,
    demandScore: g.demandScore,
    evidenceCount: g.evidenceCount,
    distinctVideos: g.distinctVideos,
  }));
  if (!lines.length) return;

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
