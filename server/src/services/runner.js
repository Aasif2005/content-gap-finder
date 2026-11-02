import * as jobs from '../lib/jobs.js';
import * as cache from '../lib/cache.js';
import * as store from '../lib/store.js';
import { runPipeline } from './pipeline.js';
import { withRun } from '../lib/runContext.js';
import { parseChannelInput } from './youtube.js';

/**
 * The cache and in-flight key for an analysis. Inputs that are the same search
 * share it: the niche ignores case and spacing ("Gym  Workout" = "gym workout"),
 * and a channel URL, its /channel/ path and its bare id are one key (a handle
 * ignores case). Without this, each spelling spent its own search quota.
 */
export function analysisKey(input) {
  const niche = String(input.niche ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const ref = input.channelId ? parseChannelInput(input.channelId) : null;
  const channelId = ref ? (ref.kind === 'handle' ? `handle:${ref.value.toLowerCase()}` : `id:${ref.value}`) : input.channelId;
  return cache.cacheKey({ ...input, niche, channelId });
}

/**
 * Starts an analysis and wires up everything that has to happen when it lands:
 * cache it, persist it, finish the job.
 *
 * Extracted from the HTTP route because the scheduler needs the identical
 * sequence. Two copies of this drifted apart would be a quiet, nasty class of
 * bug -- a scheduled run that populated the cache but not the report store, say,
 * would leave a watch whose digests referenced reports nobody could open.
 */
// Identical analyses already running, by cache key. A double-click or a second
// tab used to start a second full run: twice the quota, and two near-identical
// rows in the gap history that made every gap look like repeat demand.
const inFlight = new Map();

/**
 * The running job for this input, if there is one. A run already told to stop is
 * not one: it reads "running" until the pipeline's next checkpoint, and joining
 * it would hand the newcomer a run that quietly ends as cancelled.
 */
export function runningJobFor(key) {
  const id = inFlight.get(key);
  const job = id && jobs.get(id);
  return job && job.status === 'running' && !job.controller.signal.aborted ? id : null;
}

// onFinish is the scheduler's hook. If it throws, that must not turn a finished
// run into a failed one, or call it a second time with an error.
function notify(onFinish, err, result) {
  if (!onFinish) return;
  try { onFinish(err, result); } catch (e) { console.error('[runner] onFinish failed:', e.message); }
}

/** The cached result for this key, unless its report was pruned: that would hand out a dead link. */
export async function usableHit(key) {
  const hit = await cache.get(key);
  return hit && (!hit.value?.runId || await store.readRun(hit.value.runId)) ? hit : null;
}

export async function startAnalysis(input, { force = false, onFinish, owner } = {}) {
  const key = analysisKey(input);

  if (!force) {
    const hit = await usableHit(key);
    if (hit) return { status: 'done', cached: true, cacheAgeSeconds: hit.ageSeconds, result: hit.value };
  }

  // An interactive request joins an identical run already in progress. A
  // scheduled run (onFinish) needs its own completion, so it never joins.
  const running = !onFinish && runningJobFor(key);
  if (running) {
    jobs.addOwner(running, owner);
    return { status: 'running', jobId: running, cached: false, joined: true };
  }

  const id = jobs.create(input, { owner });
  inFlight.set(key, id);

  withRun({ signal: jobs.get(id).controller.signal, fresh: force }, () => runPipeline(input, jobs.reporter(id), id))
    .then(
      async (result) => {
        // Both writes are guarded so a storage failure can never lose someone a
        // run they paid quota for -- the in-memory job still holds it either way.
        try { await cache.set(key, result); } catch (err) { console.error(`[job ${id}] could not cache report:`, err.message); }
        // The cache expires in hours; this is what keeps the report addressable.
        try { await store.saveRun(result); } catch (err) { console.error(`[job ${id}] could not persist report:`, err.message); }
        jobs.finish(id, result);
        notify(onFinish, null, result);
      },
      (err) => {
        if (err?.code === 'CANCELLED') {
          console.log(`[job ${id}] cancelled by the person who started it`);
          jobs.markCancelled(id);
          notify(onFinish, jobs.get(id)?.error ?? err, null);
          return;
        }
        console.error(`[job ${id}] failed:`, err.message);
        jobs.fail(id, err);
        notify(onFinish, err, null);
      }
    )
    .finally(() => { if (inFlight.get(key) === id) inFlight.delete(key); });

  return { status: 'running', jobId: id, cached: false };
}
