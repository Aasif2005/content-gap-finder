import crypto from 'node:crypto';
import { publicMessage, RUN_FAILED } from './publicError.js';

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

export function create(input, { owner = null } = {}) {
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    input,
    // Who is waiting on this run (the person who started it, and anyone who joined it). It is only
    // stopped once nobody is left; a scheduled run has no owner and cannot be stopped from the app.
    owners: new Set(owner ? [owner] : []),
    controller: new AbortController(),
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
  if (job.status === 'error' || job.status === 'cancelled') return safely(cb, job.error, null);
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
    // Polled by the browser, so it holds only what a visitor may read. The runner has logged the rest.
    error: { message: publicMessage(error, RUN_FAILED), code: error?.code ?? null },
  });
  settle(id, jobs.get(id)?.error ?? { message: publicMessage(error, RUN_FAILED), code: error?.code ?? null }, null);
}

/** Someone joined a run already in flight: stopping it now needs them to agree too. */
export function addOwner(id, uid) {
  const job = jobs.get(id);
  if (job && uid && job.status === 'running') job.owners.add(uid);
}

/**
 * Stops a run on behalf of `uid`. Returns 'cancelled' (it was aborted), 'detached' (others still wait
 * on it, so it carries on), 'finished' (nothing left to stop), or null (no such run, or not theirs).
 */
export function cancel(id, uid) {
  const job = jobs.get(id);
  if (!job || !job.owners.has(uid)) return null;
  if (job.status !== 'running') return 'finished';
  job.owners.delete(uid);
  if (job.owners.size) return 'detached';
  job.controller.abort();
  return 'cancelled';
}

/** The run ended because it was stopped: no report, nothing cached, and not an error. */
export function markCancelled(id) {
  const error = { message: 'Stopped.', code: 'CANCELLED' };
  update(id, { status: 'cancelled', detail: 'Cancelled', error });
  settle(id, error, null);
}

/**
 * For shutdown: waits up to `ms` for running jobs to land, then fails any still
 * running, so their settle callbacks (refunds) fire before the process goes and
 * nobody is left charged for a run a redeploy killed. Resolves to how many it failed.
 */
export async function drain(ms) {
  const deadline = Date.now() + ms;
  const running = () => [...jobs.values()].filter((j) => j.status === 'running');
  while (running().length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
  const left = running();
  for (const job of left) {
    job.controller.abort();
    fail(job.id, new Error('The server restarted during this run.'));
  }
  return left.length;
}

// Keep the map from growing without bound in a long-lived process.
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, job] of jobs) if (job.updatedAt < cutoff) { jobs.delete(id); waiting.delete(id); }
}, 60_000).unref();
