import { config } from '../config.js';

// Per-IP sliding window. Stops one user burning the whole daily YouTube quota
// (open design decision #4). Cache hits are exempt -- see routes/api.js.
//
// A factory so different spends get independent allowances: an analysis costs
// YouTube quota, a brief costs only a DeepSeek call, and one shouldn't eat the
// other's budget.
export function createRateLimit({ perHour, noun }) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
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
  };
}

export const rateLimit = createRateLimit({ perHour: config.rateLimit.perHour, noun: 'analyses' });
export const briefRateLimit = createRateLimit({ perHour: config.rateLimit.briefsPerHour, noun: 'briefs' });
