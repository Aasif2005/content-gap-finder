import * as jobs from '../lib/jobs.js';
import * as cache from '../lib/cache.js';
import * as store from '../lib/store.js';
import { runPipeline } from './pipeline.js';

/**
 * Starts an analysis and wires up everything that has to happen when it lands:
 * cache it, persist it, finish the job.
 *
 * Extracted from the HTTP route because the scheduler needs the identical
 * sequence. Two copies of this drifted apart would be a quiet, nasty class of
 * bug -- a scheduled run that populated the cache but not the report store, say,
 * would leave a watch whose digests referenced reports nobody could open.
 */
export function startAnalysis(input, { force = false, onFinish } = {}) {
  const key = cache.cacheKey(input);

  if (!force) {
    const hit = cache.get(key);
    if (hit) return { status: 'done', cached: true, cacheAgeSeconds: hit.ageSeconds, result: hit.value };
  }

  const id = jobs.create(input);

  runPipeline(input, jobs.reporter(id), id)
    .then((result) => {
      cache.set(key, result);
      // The cache expires in hours; this is what keeps the report addressable.
      // Guarded so a storage failure can never lose someone a run they paid
      // quota for -- the in-memory job still holds it either way.
      try {
        store.saveRun(result);
      } catch (err) {
        console.error(`[job ${id}] could not persist report:`, err.message);
      }
      jobs.finish(id, result);
      onFinish?.(null, result);
    })
    .catch((err) => {
      console.error(`[job ${id}] failed:`, err.message);
      jobs.fail(id, err);
      onFinish?.(err, null);
    });

  return { status: 'running', jobId: id, cached: false };
}
