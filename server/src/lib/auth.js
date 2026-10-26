import { verifyIdToken, authConfigured } from './firebaseToken.js';
import { upsertUser } from './db.js';

/**
 * Who is calling, from `Authorization: Bearer <Firebase ID token>`.
 *
 * Credentials travel only in that header; the server sets no cookies. A request
 * a malicious page forces the browser to send therefore carries no credentials,
 * so there is no CSRF to defend against (and CORS stays closed by default).
 */

/** Pulls the bearer token out of the header, or null. */
export function bearerToken(req) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.get?.('authorization') ?? req.headers?.authorization ?? '');
  return m ? m[1] : null;
}

// Writing last_seen_at on every request would make every poll a database write.
// Once a minute per uid is plenty for "when did they last come back".
const TOUCH_MS = 60_000;
const touched = new Map();
let lastSweep = Date.now();

/** True when this uid's row is due a refresh. Pure over its inputs, so it is testable. */
export const shouldTouch = (lastMs, now = Date.now()) => lastMs === undefined || now - lastMs >= TOUCH_MS;

/** Forget the cache for a uid (account deleted: the next request must re-create nothing stale). */
export const forgetUser = (uid) => touched.delete(uid);

// Throttled: a Google key-endpoint outage logs everyone out, which must be
// visible in the log without writing a line per request.
let lastKeyWarn = 0;
function warnIfKeyTrouble(err) {
  const cause = err.cause;
  // Anything that is not "this token is bad" -- the JWKS fetch timing out or
  // failing -- is our problem, not the caller's.
  const code = String(cause?.code ?? '');
  const keyTrouble = cause && (code === 'ERR_JWKS_TIMEOUT' || code === 'ERR_JOSE_GENERIC' || !code.startsWith('ERR_J'));
  if (keyTrouble && Date.now() - lastKeyWarn > 60_000) {
    lastKeyWarn = Date.now();
    console.warn(`[auth] could not verify a token because the signing keys were unavailable: ${cause.message}`);
  }
}

/**
 * Sets `req.user` to the signed-in person, or null. A missing, malformed,
 * expired or forged token is "logged out", never an error: public routes must
 * keep working for someone whose token just expired.
 */
export async function loadUser(req, _res, next) {
  req.user = null;
  const token = bearerToken(req);
  if (!token || !authConfigured()) return next();
  try {
    const user = await verifyIdToken(token);
    const now = Date.now();
    if (now - lastSweep > 10 * 60_000) {
      for (const [uid, t] of touched) if (now - t >= TOUCH_MS) touched.delete(uid);
      lastSweep = now;
    }
    if (shouldTouch(touched.get(user.uid), now)) {
      upsertUser(user);
      touched.set(user.uid, now);
    }
    req.user = user;
  } catch (err) {
    warnIfKeyTrouble(err);
  }
  next();
}

/** For routes that need an account. 503 (not 401) when the server has no Firebase project, so a developer sees why. */
export function requireUser(req, res, next) {
  if (!authConfigured()) {
    return res.status(503).json({
      error: 'Accounts are not set up on this server yet. Set FIREBASE_PROJECT_ID (see .env.example).',
      code: 'AUTH_NOT_CONFIGURED',
    });
  }
  if (!req.user) return res.status(401).json({ error: 'Sign in to do that.', code: 'AUTH_REQUIRED' });
  next();
}

/**
 * Email/password accounts must prove they own the address before they spend
 * quota. Without this, anyone can mint a fresh daily allowance per made-up
 * address and drain the project's shared YouTube budget. Google accounts arrive
 * verified, so only the password provider can trip it.
 */
export const needsVerification = (user) => Boolean(user) && user.provider === 'password' && !user.emailVerified;

export function requireVerified(req, res, next) {
  if (needsVerification(req.user)) {
    return res.status(403).json({
      error: 'Verify your email first: we sent you a link when you signed up.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
  next();
}
