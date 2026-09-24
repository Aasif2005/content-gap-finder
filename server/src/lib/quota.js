import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { withLock } from './fileLock.js';
import { searchPlan } from './searchPlan.js';

const STATE_DIR = path.resolve(fileURLToPath(new URL('../../.state', import.meta.url)));
const LEDGER = path.join(STATE_DIR, 'quota.json');

// YouTube resets project quota at midnight Pacific, not UTC.
function quotaDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function read() {
  try {
    const raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    if (raw.day === quotaDay()) return raw;
    // A different day: the ledger is genuinely stale, so starting at 0 is correct.
  } catch (err) {
    // A missing ledger is just the first run of the day. Anything else means the
    // file exists but could not be read or parsed -- and silently resetting to 0
    // there is the dangerous case, not a harmless one: the app would believe it
    // has a full 9,000 units and keep hammering YouTube until YouTube itself
    // starts returning 403 quotaExceeded. Atomic writes (below) make a torn file
    // essentially impossible, but if it happens anyway, say so loudly.
    if (err.code !== 'ENOENT') {
      console.error(`[quota] ledger at ${LEDGER} is unreadable (${err.message}); today's spend is being recounted from 0. If YouTube starts returning quotaExceeded, this is why.`);
    }
  }
  return { day: quotaDay(), used: 0, calls: {} };
}

function write(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // tmp + rename, the same trick lib/cache.js uses. A bare writeFileSync can be
  // interrupted (crash, full disk, container SIGKILL) partway through and leave
  // truncated JSON behind; rename(2) is atomic, so a reader sees either the old
  // ledger or the new one and never a half-written one.
  const tmp = `${LEDGER}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, LEDGER);
}

/**
 * Reserve units before an API call. Throws if it would exceed the daily budget.
 *
 * The read-check-write runs under a cross-process lock. Within one process it
 * never needed one -- there is no await between the read and the write, and
 * Node does not interleave JS across synchronous statements -- but two server
 * processes sharing this directory could both read the same `used`, both decide
 * they had room, and both write, losing one increment and drifting the ledger
 * below real spend. See lib/fileLock.js.
 */
export function spend(kind, times = 1) {
  const cost = (config.youtube.cost[kind] ?? 1) * times;

  return withLock(LEDGER, () => {
    const state = read();
    if (state.used + cost > config.youtube.dailyUnitBudget) {
      const err = new Error(
        `YouTube daily quota budget exhausted (${state.used}/${config.youtube.dailyUnitBudget} units used). ` +
        `Resets at midnight America/Los_Angeles. Cached results still work.`
      );
      err.code = 'QUOTA_EXHAUSTED';
      err.status = 429;
      throw err;
    }
    state.used += cost;
    state.calls[kind] = (state.calls[kind] ?? 0) + times;
    write(state);
    return state.used;
  });
}

/**
 * What one analysis costs, for the request actually being made. Not a constant:
 * the number of 100-unit search.list slices depends on contentType and deep
 * scan (see lib/searchPlan.js), so long-form and deep-scan runs genuinely cost
 * more than the old flat 127. Pricing them as 127 anyway would have the UI
 * promise analyses the budget cannot pay for.
 */
export function unitsPerAnalysis({ contentType = 'both', deepScan = false, channelMode = false } = {}) {
  const { cost, maxCommentVideos } = config.youtube;
  // Channel mode walks the uploads playlist instead of searching: playlistItems
  // is 1 unit against search.list's 100, which is most of why it is so much
  // cheaper per run.
  const discovery = channelMode
    ? cost.playlistItems + cost.channels // resolve the channel, then list uploads
    : searchPlan({ contentType, deepScan }).length * cost.search;
  return discovery + cost.videos + cost.channels + cost.commentThreads * maxCommentVideos;
}

export function quotaStatus(shape = {}) {
  const state = read();
  const remaining = Math.max(0, config.youtube.dailyUnitBudget - state.used);
  const perAnalysis = unitsPerAnalysis(shape);
  return {
    day: state.day,
    used: state.used,
    budget: config.youtube.dailyUnitBudget,
    remaining,
    unitsPerAnalysis: perAnalysis,
    // The number that actually matters to a user. Counting whole searches would
    // overstate it by ~20%, since the search is only 100 of the ~127 units.
    analysesLeft: Math.floor(remaining / perAnalysis),
    // What each run shape costs, so the UI can price a toggle before it is used
    // rather than surprising someone with a halved budget after the fact.
    costs: {
      both: unitsPerAnalysis({ contentType: 'both' }),
      shorts: unitsPerAnalysis({ contentType: 'shorts' }),
      long: unitsPerAnalysis({ contentType: 'long' }),
      deepScan: unitsPerAnalysis({ contentType: 'both', deepScan: true }),
      channel: unitsPerAnalysis({ channelMode: true }),
    },
    byCall: state.calls,
  };
}
