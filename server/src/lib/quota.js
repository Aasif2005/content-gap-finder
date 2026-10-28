import { config } from '../config.js';
import { col } from './mongo.js';
import { searchPlan } from './searchPlan.js';

// The shared YouTube budget ledger is one document in MongoDB (collection quota).
const LEDGER_ID = 'youtube';

// YouTube resets project quota at midnight Pacific, not UTC. Per-account
// allowances (lib/db.js) use the same day so they reset together.
const QUOTA_TZ = 'America/Los_Angeles';

export function quotaDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: QUOTA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Wall-clock parts of an instant in the quota time zone. */
function pacificParts(d) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: QUOTA_TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  return { y: +parts.year, mo: +parts.month, d: +parts.day, h: +parts.hour, mi: +parts.minute };
}

/**
 * The next midnight in America/Los_Angeles after `now`, as an ISO instant: when
 * the YouTube quota and every daily allowance reset.
 *
 * Not "now + hours until 24:00": Pacific is UTC-8 or UTC-7 and the offset
 * changes on the clock-change weekends, so a day is 23 or 25 hours long twice a
 * year. Instead build tomorrow's calendar date and find the instant whose
 * Pacific wall clock reads exactly 00:00 on it (midnight itself is never
 * skipped or repeated; the US changes clocks at 02:00).
 */
export function nextQuotaReset(now = new Date()) {
  const { y, mo, d } = pacificParts(now);
  const target = Date.UTC(y, mo - 1, d + 1); // tomorrow's date, read as if it were UTC
  for (const offsetH of [8, 7]) { // PST, PDT
    const candidate = new Date(target + offsetH * 3600_000);
    const p = pacificParts(candidate);
    const t = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getTime();
    if (t === target && p.h === 0 && p.mi === 0) return candidate.toISOString();
  }
  /* c8 ignore next */
  throw new Error('Could not resolve the next Pacific midnight.');
}

const fresh = () => ({ day: quotaDay(), used: 0, searchCalls: 0, calls: {} });

/** The ledger document as stored, or null. */
const readDoc = () => col('quota').findOne({ _id: LEDGER_ID });

/** Today's ledger: the stored one when it is for today, else a new day starting at 0. */
async function read() {
  const doc = await readDoc();
  return doc && doc.day === quotaDay() ? doc : fresh();
}

// Since 2026-06-01 search.list has its own bucket: a cap on CALLS (1 unit
// each), separate from the 10,000 units every other method shares. Charging
// it as 100 units of the shared budget, as before, both blocked runs the
// project could afford and ignored the cap that actually runs out first.
const isSearch = (kind) => kind === 'search';

/**
 * Reserve units before an API call. Throws if it would exceed the daily budget.
 *
 * Read, check, write back with a revision guard (`rev`): if another request or
 * another server instance changed the ledger in between, the write matches
 * nothing and this retries on the fresh state. Two callers can therefore never
 * both spend the same remaining unit, and none is lost, even with several
 * server processes sharing the one database.
 */
export async function spend(kind, times = 1) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const doc = await readDoc();
    const base = doc && doc.day === quotaDay() ? doc : fresh();
    const next = charge(base, kind, times); // throws QUOTA_EXHAUSTED
    const fields = { day: next.day, used: next.used, searchCalls: next.searchCalls, calls: next.calls };
    if (doc) {
      const r = await col('quota').updateOne({ _id: LEDGER_ID, rev: doc.rev ?? 0 }, { $set: { ...fields, rev: (doc.rev ?? 0) + 1 } });
      if (r.matchedCount) return next.used;
    } else {
      try {
        await col('quota').insertOne({ _id: LEDGER_ID, ...fields, rev: 1 });
        return next.used;
      } catch (err) {
        if (err?.code !== 11000) throw err; // someone created it first: retry against theirs
      }
    }
  }
  throw Object.assign(new Error('Could not update the YouTube quota ledger (too much contention). Try again.'), { status: 503, code: 'QUOTA_BUSY' });
}

/** The ledger after one charge, or a QUOTA_EXHAUSTED throw. Pure, so it is testable. */
export function charge(state, kind, times = 1) {
  const next = { ...state, searchCalls: state.searchCalls ?? 0, calls: { ...state.calls } };
  const exhausted = (message) => Object.assign(new Error(message), { code: 'QUOTA_EXHAUSTED', status: 429 });
  if (isSearch(kind)) {
    if (next.searchCalls + times > config.youtube.searchDailyCalls) {
      throw exhausted(
        `YouTube daily search budget exhausted (${next.searchCalls}/${config.youtube.searchDailyCalls} search calls used). ` +
        `Resets at midnight America/Los_Angeles. Cached results and channel analyses still work.`
      );
    }
    next.searchCalls += times;
  } else {
    const cost = (config.youtube.cost[kind] ?? 1) * times;
    if (next.used + cost > config.youtube.dailyUnitBudget) {
      throw exhausted(
        `YouTube daily quota budget exhausted (${next.used}/${config.youtube.dailyUnitBudget} units used). ` +
        `Resets at midnight America/Los_Angeles. Cached results still work.`
      );
    }
    next.used += cost;
  }
  next.calls[kind] = (next.calls[kind] ?? 0) + times;
  return next;
}

/**
 * Units one analysis takes from the shared bucket, for the request actually
 * being made. Search calls come from their own bucket and are counted by
 * searchCallsPerAnalysis(), whose slice count depends on contentType and deep
 * scan (see lib/searchPlan.js).
 */
export function unitsPerAnalysis({ contentType = 'both', deepScan = false, channelMode = false } = {}) {
  const { cost, maxCommentVideos } = config.youtube;
  // Channel mode walks the uploads playlist instead of searching: playlistItems
  // is 1 unit against search.list's 100, which is most of why it is so much
  // cheaper per run.
  // Priced at the most a run can walk (getChannelUploads' page cap, and a
  // videos.list batch per page of 50): priced at one page, a prolific channel
  // over 90 days cost more than the scheduler budgeted and failed partway.
  const pages = config.youtube.channelUploadPages;
  // Search calls are a separate bucket (searchCallsPerAnalysis), so niche-mode
  // discovery costs nothing here.
  const discovery = channelMode
    ? pages * cost.playlistItems + cost.channels + (pages - 1) * cost.videos // resolve, list uploads, detail each page
    : 0;
  // Niche mode also reads the top channels' recent uploads as an outlier
  // baseline (services/youtube.js getChannelBaselines): a playlistItems page and
  // a videos.list batch per channel. Channel mode is already one channel's own
  // uploads, so it needs none.
  const baseline = channelMode ? 0 : config.outlier.channels * (cost.playlistItems + cost.videos);
  return discovery + cost.videos + cost.channels + cost.commentThreads * maxCommentVideos + baseline;
}

/** search.list calls one analysis makes: one per slice, none in channel mode. */
export function searchCallsPerAnalysis({ contentType = 'both', deepScan = false, channelMode = false } = {}) {
  return channelMode ? 0 : searchPlan({ contentType, deepScan }).length;
}

/** Whole analyses of this shape that both buckets can still pay for. */
export function analysesAffordable(state, shape = {}) {
  const units = unitsPerAnalysis(shape);
  const searches = searchCallsPerAnalysis(shape);
  const byUnits = Math.floor(Math.max(0, config.youtube.dailyUnitBudget - state.used) / units);
  const bySearch = searches ? Math.floor(Math.max(0, config.youtube.searchDailyCalls - (state.searchCalls ?? 0)) / searches) : Infinity;
  return Math.min(byUnits, bySearch);
}

export async function quotaStatus(shape = {}) {
  const state = await read();
  const remaining = Math.max(0, config.youtube.dailyUnitBudget - state.used);
  const searchCalls = state.searchCalls ?? 0;
  const cost = (s) => ({ units: unitsPerAnalysis(s), searchCalls: searchCallsPerAnalysis(s) });
  return {
    day: state.day,
    used: state.used,
    budget: config.youtube.dailyUnitBudget,
    remaining,
    searchUsed: searchCalls,
    searchBudget: config.youtube.searchDailyCalls,
    searchRemaining: Math.max(0, config.youtube.searchDailyCalls - searchCalls),
    unitsPerAnalysis: unitsPerAnalysis(shape),
    searchCallsPerAnalysis: searchCallsPerAnalysis(shape),
    // The number that actually matters to a user: whichever bucket runs out first.
    analysesLeft: analysesAffordable(state, shape),
    // What each run shape costs, so the UI can price a toggle before it is used
    // rather than surprising someone with a halved budget after the fact.
    costs: {
      both: cost({ contentType: 'both' }),
      shorts: cost({ contentType: 'shorts' }),
      long: cost({ contentType: 'long' }),
      deepScan: cost({ contentType: 'both', deepScan: true }),
      channel: cost({ channelMode: true }),
    },
    byCall: state.calls,
  };
}

/** Whether one more analysis of this shape fits in today's budgets. */
export const canAfford = async (shape = {}) => analysesAffordable(await read(), shape) >= 1;
