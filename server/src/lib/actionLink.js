import { SignJWT, importPKCS8 } from 'jose';
import { config } from '../config.js';

/**
 * Mints Firebase email-action codes (password reset, email verification) on the
 * server, so Gapstronaut can email the link itself, in its own design, pointing
 * at its own /auth/action page instead of firebaseapp.com.
 *
 * It does what the Admin SDK's generatePasswordResetLink does, without the SDK:
 * sign a service-account JWT, trade it for an access token, and call the Identity
 * Toolkit with returnOobLink. The secret is FIREBASE_SERVICE_ACCOUNT (the key's
 * JSON, raw or base64) and exists only on the server.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

/** The service-account JSON from the env value, which may be raw JSON or base64 of it. */
export function parseServiceAccount(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
  try {
    const key = JSON.parse(json);
    return key.client_email && key.private_key ? key : null;
  } catch {
    return null;
  }
}

export const actionLinksConfigured = () => Boolean(parseServiceAccount(config.firebase.serviceAccount));

let cached = { token: null, until: 0 };

async function accessToken(fetchFn = fetch) {
  if (cached.token && Date.now() < cached.until - 60_000) return cached.token;
  const key = parseServiceAccount(config.firebase.serviceAccount);
  if (!key) throw Object.assign(new Error('Email links are not set up on this server.'), { status: 503, code: 'MAIL_NOT_CONFIGURED' });
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(key.client_email)
    .setSubject(key.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(key.private_key, 'RS256'));
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Google token request failed (${res.status})`);
  cached = { token: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/**
 * Our own link for the code in Firebase's: `${origin}/auth/action?mode=...&oobCode=...`.
 * Pure, so it is testable. Returns null when Firebase's link has no code.
 */
export function ourActionLink(oobLink, origin) {
  let url;
  try { url = new URL(oobLink); } catch { return null; }
  const mode = url.searchParams.get('mode');
  const code = url.searchParams.get('oobCode');
  if (!mode || !code) return null;
  return `${origin.replace(/\/+$/, '')}/auth/action?${new URLSearchParams({ mode, oobCode: code })}`;
}

/**
 * `kind`: 'PASSWORD_RESET' | 'VERIFY_EMAIL'. Resolves to our link, or null when the
 * address has no account (the caller must not reveal which).
 */
export async function createActionLink(kind, email, origin, fetchFn = fetch) {
  const projectId = config.firebase.projectId;
  const token = await accessToken(fetchFn);
  const res = await fetchFn(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:sendOobCode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ requestType: kind, email, returnOobLink: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(body?.error?.message ?? '');
    if (msg.startsWith('EMAIL_NOT_FOUND') || msg.startsWith('USER_NOT_FOUND')) return null;
    throw new Error(`Identity Toolkit failed (${res.status}) ${msg}`.trim());
  }
  return ourActionLink(body.oobLink, origin);
}
