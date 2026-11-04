import { config } from '../config.js';
import { safeHost } from './site.js';

/** True for same-origin/non-browser requests (no Origin header) and for origins listed in CORS_ORIGINS. */
export function corsOriginAllowed(origin, allowed = config.corsOrigins) {
  if (!origin) return true;
  return allowed.includes(origin);
}

/**
 * A few headers that cost nothing: no MIME sniffing, no framing, no full URL leaking cross-site (report ids), and in production HSTS -- YouTube's policies (III.E.5)
 * require industry-standard transport encryption for API data.
 */
export function makeSecurityHeaders({ isProd = config.isProd } = {}) {
  return (req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Never on plain-http localhost: a browser would then refuse it for months.
    if (isProd) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}

export const securityHeaders = makeSecurityHeaders();

/**
 * Where a plain-http request should go instead, or null. It only applies behind
 * a proxy (TRUST_PROXY), the one place `req.secure` means anything: without one
 * the server is speaking plain http by design. Uptime checks stay on http.
 */
export function httpsRedirectFor(req, { isProd = config.isProd, trustProxy = config.trustProxy, siteUrl = config.site.url } = {}) {
  if (!isProd || !trustProxy || req.secure || req.path === '/api/health') return null;
  const origin = siteUrl ? siteUrl.replace(/\/+$/, '') : `https://${safeHost(req)}`;
  return `${origin}${req.originalUrl}`;
}
