import { config } from '../config.js';

// Per-IP sliding window. Stops one user burning the whole daily YouTube quota
// (open design decision #4). Cache hits are exempt -- see routes/api.js.
const hits = new Map();

export function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= config.rateLimit.perHour) {
    const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: `Rate limit reached (${config.rateLimit.perHour} analyses/hour). Try again in ${Math.ceil(retryAfter / 60)} min.`,
      code: 'RATE_LIMITED',
    });
  }

  recent.push(now);
  hits.set(ip, recent);
  next();
}
