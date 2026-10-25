import { config } from '../config.js';

/** True for same-origin/non-browser requests (no Origin header) and for origins listed in CORS_ORIGINS. */
export function corsOriginAllowed(origin, allowed = config.corsOrigins) {
  if (!origin) return true;
  return allowed.includes(origin);
}

/** A few headers that cost nothing: no MIME sniffing, no framing, no referrer leaking report ids. */
export function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
}
