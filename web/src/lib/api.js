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
