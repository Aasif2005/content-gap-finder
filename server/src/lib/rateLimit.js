import { config } from '../config.js';

// Per-IP sliding window. Stops one user burning the whole daily YouTube quota
// (open design decision #4). Cache hits are exempt -- see routes/api.js.
//
// A factory so different spends get independent allowances: an analysis costs
// YouTube quota, a brief costs only a DeepSeek call, and one shouldn't eat the
// other's budget.
const WINDOW_MS = 60 * 60 * 1000;

// Signed-in people are limited as themselves, not by address: a shared office or
// phone-carrier IP would otherwise pool strangers into one allowance, and a
// person on a changing IP would get a fresh one every time.
export const userOrIp = (req) => (req.user?.uid ? `u:${req.user.uid}` : req.ip || req.socket?.remoteAddress || 'unknown');

export function createRateLimit({ perHour, noun, keyFn = userOrIp }) {
  const hits = new Map();
  let lastSweep = Date.now();
  // Entries for IPs with nothing in the last hour are dead weight; without this
  // the map only ever grew.
  const sweep = (now = Date.now()) => {
    for (const [ip, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(ip);
    lastSweep = now;
  };
  function rateLimit(req, res, next) {
    const ip = keyFn(req);
    const now = Date.now();
    if (now - lastSweep > 10 * 60 * 1000) sweep(now);
    const windowMs = WINDOW_MS;
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);

    if (recent.length >= perHour) {
      const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Rate limit reached (${perHour} ${noun}/hour). Try again in ${Math.ceil(retryAfter / 60)} min.`,
        code: 'RATE_LIMITED',
      });
    }

    recent.push(now);
    hits.set(ip, recent);
    next();
  }
  rateLimit.sweep = sweep;
  rateLimit.size = () => hits.size;
  rateLimit.record = (ip, t) => hits.set(ip, [...(hits.get(ip) ?? []), t]);
  return rateLimit;
}

export const rateLimit = createRateLimit({ perHour: config.rateLimit.perHour, noun: 'analyses' });
export const briefRateLimit = createRateLimit({ perHour: config.rateLimit.briefsPerHour, noun: 'briefs' });
