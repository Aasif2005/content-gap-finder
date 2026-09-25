const json = async (res) => {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { code: body.code });
  return body;
};

export const getQuota = () => fetch('/api/quota').then(json);

export const startAnalysis = (input) =>
  fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then(json);

export const getJob = (id) => fetch(`/api/jobs/${id}`).then(json);

/** Polls a job to completion, reporting progress along the way. */
export function pollJob(jobId, onTick, { intervalMs = 1500, timeoutMs = 300_000 } = {}) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const job = await getJob(jobId);
        onTick?.(job);

        if (job.status === 'done') return resolve(job.result);
        if (job.status === 'error') {
          return reject(Object.assign(new Error(job.error?.message ?? 'Analysis failed'), { code: job.error?.code }));
        }
        if (Date.now() - startedAt > timeoutMs) {
          return reject(new Error('Analysis timed out. The niche may be too broad — try narrowing it.'));
        }
        setTimeout(tick, intervalMs);
      } catch (err) {
        reject(err);
      }
    };
    tick();
  });
}

/** A persisted report by run id. Costs no quota -- a disk read of a paid-for run. */
export const getRun = (runId) => fetch(`/api/runs/${runId}`).then(json);

/**
 * Report history, newest first. `niche` narrows to one niche's runs; `mode`
 * ('niche' | 'channel') narrows to one page's runs when no single subject is given.
 */
export const getRuns = ({ limit = 30, niche, mode } = {}) => {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (niche) qs.set('niche', niche);
  if (mode) qs.set('mode', mode);
  return fetch(`/api/runs?${qs}`).then(json);
};

// --- saved watches ---------------------------------------------------------

export const getWatches = () => fetch('/api/watches').then(json);

export const createWatch = (input, intervalHours, label) =>
  fetch('/api/watches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, intervalHours, label }),
  }).then(json);

export const updateWatch = (id, patch) =>
  fetch(`/api/watches/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then(json);

export const deleteWatch = (id) =>
  fetch(`/api/watches/${id}`, { method: 'DELETE' }).then((res) => {
    if (!res.ok && res.status !== 204) throw new Error('Could not delete that watch.');
    return true;
  });

/** What a watch's newest run found that the previous one did not. Costs nothing. */
export const getDigest = (id) => fetch(`/api/watches/${id}/digest`).then(json);
