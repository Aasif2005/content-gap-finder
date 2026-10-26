import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';

/**
 * Verifies a Firebase Authentication ID token on the server, with no Firebase
 * Admin SDK and no secret: ID tokens are RS256 JWTs signed with Google's public
 * keys, so checking the signature and the claims is all there is to it.
 *
 * The browser signs in with the Firebase web SDK and sends the ID token as
 * `Authorization: Bearer <token>`. This file is the only place that decides
 * whether such a token is real.
 */
const JWKS_URL = new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');

// Firebase tokens last an hour and the browser SDK refreshes them early, so a
// token a moment past `exp` is a clock-skew artefact, not an attack. Likewise a
// client whose clock runs a little fast must not be locked out by `auth_time`.
export const CLOCK_TOLERANCE_S = 30;

// createRemoteJWKSet fetches lazily and caches the keys (honouring Google's
// cache headers) and refetches on an unknown `kid`, which is how key rotation
// is picked up. One instance for the process, created on first use so merely
// importing this file never touches the network.
let remote;
const defaultKeySet = () => (remote ??= createRemoteJWKSet(JWKS_URL));

const invalid = (message, cause) =>
  Object.assign(new Error(message), { status: 401, code: 'INVALID_TOKEN', ...(cause ? { cause } : {}) });

/** Whether Firebase accounts are set up on this server at all. */
export const authConfigured = (projectId = config.firebase.projectId) => Boolean(projectId);

/**
 * A verified token's claims as the app's own user shape. Pure, so it is testable.
 * `provider` is Firebase's sign_in_provider: `google.com` or `password` for the
 * methods the app offers.
 */
export function normalizeUser(payload) {
  const provider = String(payload.firebase?.sign_in_provider ?? 'unknown');
  // An anonymous account is a free, unlimited supply of fresh uids, each with its
  // own daily allowance. The app never offers it, so a token for one is not ours.
  if (provider === 'anonymous') throw invalid('Anonymous sign-in is not supported.');
  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    provider,
  };
}

/**
 * Throws a 401 INVALID_TOKEN unless `token` is a genuine, current Firebase ID
 * token for this project; otherwise resolves to the normalised user.
 *
 * `keySet` and `now` are injectable so tests sign tokens with a local key.
 */
export async function verifyIdToken(token, { projectId = config.firebase.projectId, keySet, now = new Date() } = {}) {
  if (!projectId) {
    throw Object.assign(new Error('Accounts are not configured on this server.'), { status: 503, code: 'AUTH_NOT_CONFIGURED' });
  }
  if (typeof token !== 'string' || !token) throw invalid('No token.');

  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySet ?? defaultKeySet(), {
      // Pinning the algorithm stops a token claiming `alg: none` or HS256
      // (signed with the public key as the "secret") from being accepted.
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: CLOCK_TOLERANCE_S,
      currentDate: now,
      // jose only checks exp when it is present; a token with none never expires.
      requiredClaims: ['exp', 'iat', 'sub', 'auth_time'],
    }));
  } catch (err) {
    // Key-fetch trouble is not the caller's fault; let the middleware tell it
    // apart from a bad token (and log it) by keeping the original error code.
    throw invalid(`Invalid ID token (${err.code ?? err.name}).`, err);
  }

  if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 128) {
    throw invalid('Token has no usable subject.');
  }
  // A login cannot have happened in the future.
  if (typeof payload.auth_time !== 'number' || payload.auth_time > Math.floor(now.getTime() / 1000) + CLOCK_TOLERANCE_S) {
    throw invalid('Token auth_time is in the future.');
  }
  return normalizeUser(payload);
}
