/**
 * Every call to our server goes through `request`. It adds the signed-in
 * person's Firebase ID token (so protected routes accept the call), encodes
 * JSON bodies, and turns a failed response into an Error carrying `code`,
 * `status` and, for a used-up daily allowance, `resetsAt`.
 *
 * It never navigates. A 401 (AUTH_REQUIRED) is for the caller to act on; the
 * route guard sends logged-out visitors to the login page.
 */

// The auth module registers how to fetch a token. Importing it here instead
// would make api.js and auth.jsx import each other.
let tokenGetter = async () => null;
export const setTokenGetter = (fn) => { tokenGetter = fn; };

// No call waits forever: a hung request used to leave skeletons on screen with
// no way out. Reading the token and the call itself each get a bound; analyses
// run in the background, so the longest foreground read is short.
const TOKEN_TIMEOUT_MS = 8_000;
const REQUEST_TIMEOUT_MS = 10_000; // reads only: a "Make it" draft is a POST and can legitimately take a minute

const timeoutError = (what) => {
  console.warn(`[api] ${what} timed out`);
  return Object.assign(new Error('Gapstronaut is taking too long to answer. Try again.'), { code: 'TIMEOUT' });
};

/** Rejects with a TIMEOUT error if `promise` has not settled within `ms`. */
const within = (promise, ms, what) => {
  let timer;
  const clock = new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError(what)), ms); });
  return Promise.race([promise, clock]).finally(() => clearTimeout(timer));
};

async function request(path, { method = 'GET', body, headers } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  try {
    const token = await within(tokenGetter(), TOKEN_TIMEOUT_MS, `reading the sign-in token for ${path}`);
    if (token) h.Authorization = `Bearer ${token}`;
  } catch (err) {
    // A token that cannot be read in time is the same as being logged out; the
    // call below then fails with a clear 401 instead of hanging.
    if (err.code === 'TIMEOUT') console.warn('[api] continuing without a token');
  }

  const controller = new AbortController();
  const abort = method === 'GET' ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(path, { method, headers: h, signal: controller.signal, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    if (err?.name === 'AbortError') throw timeoutError(`${method} ${path}`);
    throw Object.assign(new Error('Could not reach Gapstronaut. Check your connection and try again.'), { code: 'NETWORK' });
  } finally {
    if (abort) clearTimeout(abort);
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  // A 5xx with no JSON body did not come from our API: it is the dev proxy or a
  // gateway answering for a server that is not running.
  if (!res.ok && !data && res.status >= 500) {
    throw Object.assign(new Error("Gapstronaut's server isn't reachable. Make sure it is running and try again."), { code: 'SERVER_DOWN', status: res.status });
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.code = data?.code;
    err.status = res.status;
    if (data?.resetsAt) err.resetsAt = data.resetsAt;
    throw err;
  }
  return data ?? {};
}

// --- accounts ---------------------------------------------------------------

/** The signed-in person: profile, today's usage, their limits, when they reset, and their watch count. */
export const getMe = () => request('/api/me');

/** Records that they accepted the Terms and Privacy Policy. Returns `{ ok, termsAcceptedAt }`. */
export const acceptConsent = () => request('/api/me/consent', { method: 'POST' });

/** Deletes everything held about the account on our server. The Firebase user is deleted by the browser. */
export const deleteMe = () => request('/api/me', { method: 'DELETE' });

/** The sample report shown on the homepage, or null when there is none yet. Public. */
export const getFeatured = () => request('/api/featured').then((b) => b.featured ?? null);

// --- analysis ----------------------------------------------------------------

export const getQuota = () => request('/api/quota');
export const getSite = () => request('/api/site');

export const startAnalysis = (input) => request('/api/analyze', { method: 'POST', body: input });

export const getJob = (id) => request(`/api/jobs/${id}`);

/** Polls a job to completion, reporting progress along the way. */
// Thrown when the caller stopped caring (another report opened, page switched,
// component unmounted). Callers ignore it rather than showing an error.
export class Cancelled extends Error {
  constructor() { super('cancelled'); this.cancelled = true; }
}

export function pollJob(jobId, onTick, { intervalMs = 1500, timeoutMs = 300_000, isCancelled = () => false } = {}) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (isCancelled()) return reject(new Cancelled());
      try {
        const job = await getJob(jobId);
        if (isCancelled()) return reject(new Cancelled());
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
export const getRun = (runId) => request(`/api/runs/${runId}`);

/**
 * Report history, newest first. `niche` narrows to one niche's runs; `mode`
 * ('niche' | 'channel') narrows to one page's runs when no single subject is given.
 */
export const getRuns = ({ limit = 30, niche, mode } = {}) => {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (niche) qs.set('niche', niche);
  if (mode) qs.set('mode', mode);
  return request(`/api/runs?${qs}`);
};

// --- saved watches ---------------------------------------------------------

export const getWatches = () => request('/api/watches');

export const createWatch = (input, intervalHours, label) =>
  request('/api/watches', { method: 'POST', body: { ...input, intervalHours, label } });

export const updateWatch = (id, patch) => request(`/api/watches/${id}`, { method: 'PATCH', body: patch });

export const deleteWatch = (id) => request(`/api/watches/${id}`, { method: 'DELETE' }).then(() => true);

/** What a watch's newest run found that the previous one did not. Costs nothing. */
export const getDigest = (id) => request(`/api/watches/${id}/digest`);

// --- "Make it" briefs --------------------------------------------------------

/** A previously drafted brief (in this language), or null. Costs nothing. */
export const getBrief = (runId, index, language = '') =>
  request(`/api/runs/${runId}/gaps/${index}/brief?language=${encodeURIComponent(language)}`).then((b) => b.brief);

/** Drafts (or returns the saved) brief for one gap. Generating is one DeepSeek call, polled like a run. */
export async function makeBrief(runId, index, { force = false, language = '', format = '', style = '', targetMinutes = null, core = false, planFrom = null, isCancelled } = {}) {
  const started = await request(`/api/runs/${runId}/gaps/${index}/brief`, {
    method: 'POST',
    body: { force, language, format, style, targetMinutes, core, planFrom },
  });
  if (started.status === 'done') return started.brief;
  return pollJob(started.jobId, null, { timeoutMs: 240_000, isCancelled });
}
