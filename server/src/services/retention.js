import { config } from '../config.js';
import * as store from '../lib/store.js';
import * as cache from '../lib/cache.js';
import * as watches from '../lib/watches.js';
import { sweepLogs } from '../lib/auditLog.js';

// YouTube API data may be stored for 30 days at most (Developer Policies
// III.E.4). Reports, briefs, the query cache and run logs all hold it, so one
// sweep covers all four: on boot, then every few hours.
const EVERY_MS = 6 * 3600 * 1000;
const ORPHAN_EVERY_MS = 15 * 60 * 1000;
let timer = null;
let orphanTimer = null;

/** Reports nobody holds any more go 6 hours after the last removal; featured samples and a watch's latest run stay. */
export async function purgeOrphans(now = Date.now()) {
  const protectedIds = [...config.featured.runIds, ...(await watches.list()).map((w) => w.lastRunId).filter(Boolean)];
  const counts = await store.purgeOrphans({ now, protectedIds });
  if (counts.runs) console.log('[retention] removed reports no account holds:', counts);
  return counts;
}

export async function sweepAll(now = Date.now()) {
  const cutoff = now - config.store.maxDataDays * 24 * 3600 * 1000;
  const counts = { ...(await store.sweepExpired({ now })), cache: await cache.sweep(cutoff), logs: await sweepLogs(cutoff) };
  const total = counts.runs + counts.briefs + counts.historyRows + counts.cache + counts.logs;
  if (total) console.log(`[retention] removed data older than ${config.store.maxDataDays} days:`, counts);
  return counts;
}

export function start() {
  if (timer) return;
  const run = () => sweepAll().catch((err) => console.error('[retention] sweep failed:', err.message));
  run();
  timer = setInterval(run, EVERY_MS);
  timer.unref();
  const orphans = () => purgeOrphans().catch((err) => console.error('[retention] orphan purge failed:', err.message));
  orphanTimer = setInterval(orphans, ORPHAN_EVERY_MS);
  orphanTimer.unref();
}
