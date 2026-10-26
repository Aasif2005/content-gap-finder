import crypto from 'node:crypto';

// In-process job registry. The pipeline takes 20-60s, so the HTTP request that
// starts it returns a job id immediately and the client polls for progress.
// For multi-instance deploys this is the seam to swap for BullMQ/Redis.
const jobs = new Map();
const TTL_MS = 30 * 60 * 1000;

export const PHASES = [
  { key: 'searching',  label: 'Finding videos' },
  { key: 'stats',      label: 'Pulling stats' },
  { key: 'comments',   label: 'Reading comments' },
  { key: 'clustering', label: 'Clustering topics' },
  { key: 'gaps',       label: 'Mining gaps' },
  { key: 'done',       label: 'Done' },
];

export function create(input) {
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    input,
    status: 'running',
    phase: 'searching',
    detail: 'Starting…',
    progress: 0,
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return id;
}

export function update(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

/** Progress reporter handed to the pipeline so it doesn't import the job store. */
export function reporter(id) {
  return (phase, detail, progress) => update(id, { phase, detail, progress });
}

export function get(id) {
  return jobs.get(id) ?? null;
}

// Callbacks waiting for a job to settle, by job id. Account bookkeeping hangs off
// these (link the finished run to its owner, give an allowance back on failure)
// because it must happen even when the browser never polls again.
const waiting = new Map();

/**
 * Calls `cb(error, result)` once the job finishes or fails -- immediately if it
 * already has. A callback that throws must not turn a finished run into a failed
 * one, so it is caught here, as the runner does for the scheduler's hook.
 */
export function whenSettled(id, cb) {
  const job = jobs.get(id);
  if (!job) return cb(Object.assign(new Error('Job not found.'), { code: 'JOB_NOT_FOUND' }), null);
  if (job.status === 'done') return safely(cb, null, job.result);
  if (job.status === 'error') return safely(cb, job.error, null);
  waiting.set(id, [...(waiting.get(id) ?? []), cb]);
}

function safely(cb, err, result) {
  try { cb(err, result); } catch (e) { console.error('[jobs] settle callback failed:', e.message); }
}

function settle(id, err, result) {
  const cbs = waiting.get(id) ?? [];
  waiting.delete(id);
  for (const cb of cbs) safely(cb, err, result);
}

export function finish(id, result) {
  update(id, { status: 'done', phase: 'done', detail: 'Complete', progress: 100, result });
  settle(id, null, result);
}

export function fail(id, error) {
  update(id, {
    status: 'error',
    detail: 'Failed',
    error: { message: error.message, code: error.code ?? null },
  });
  settle(id, jobs.get(id)?.error ?? { message: error.message, code: error.code ?? null }, null);
}

// Keep the map from growing without bound in a long-lived process.
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, job] of jobs) if (job.updatedAt < cutoff) { jobs.delete(id); waiting.delete(id); }
}, 60_000).unref();
