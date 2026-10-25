import { config } from '../config.js';

/** True for same-origin/non-browser requests (no Origin header) and for origins listed in CORS_ORIGINS. */
export function corsOriginAllowed(origin, allowed = config.corsOrigins) {
  if (!origin) return true;
  return allowed.includes(origin);
}

/**
 * A few headers that cost nothing: no MIME sniffing, no framing, no referrer
 * leaking report ids, and in production HSTS -- YouTube's policies (III.E.5)
 * require industry-standard transport encryption for API data.
 */
export function makeSecurityHeaders({ isProd = config.isProd } = {}) {
  return (req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    // Never on plain-http localhost: a browser would then refuse it for months.
    if (isProd) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}

export const securityHeaders = makeSecurityHeaders();
