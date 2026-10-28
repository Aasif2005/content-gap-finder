import { config } from '../config.js';
import * as store from '../lib/store.js';
import * as cache from '../lib/cache.js';
import { sweepLogs } from '../lib/auditLog.js';

// YouTube API data may be stored for 30 days at most (Developer Policies
// III.E.4). Reports, briefs, the query cache and run logs all hold it, so one
// sweep covers all four: on boot, then every few hours.
const EVERY_MS = 6 * 3600 * 1000;
let timer = null;

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
}
