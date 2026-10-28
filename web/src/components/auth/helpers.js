import { normalizePath } from '../../lib/routes.js';

/**
 * Pure helpers for the log in, sign up and reset pages. No React, no DOM, so
 * they can be unit tested from the server's test suite.
 */

const FALLBACK_NEXT = '/dashboard';
// Sending someone back to a sign-in page after signing in would loop.
const AUTH_PATHS = new Set(['/login', '/signup', '/reset-password']);
const PROBE_ORIGIN = 'https://gapstronaut.invalid';

/**
 * Where to go after signing in. `next` comes from the query string, so it is
 * untrusted: only a same-site path is returned. `//evil.com`, `/\evil.com`,
 * absolute URLs, `javascript:` and paths with control characters all fall back.
 */
export function safeNext(next, fallback = FALLBACK_NEXT) {
  if (typeof next !== 'string') return fallback;
  if (!/^\/(?![/\\])/.test(next)) return fallback; // one leading slash, then not another slash or backslash
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback; // control characters and backslashes
  let url;
  try { url = new URL(next, PROBE_ORIGIN); } catch { return fallback; }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  if (AUTH_PATHS.has(normalizePath(url.pathname))) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Where to go right after signing in or up. Someone headed somewhere specific (a report link, a
 * page that sent them to log in) goes straight there. Otherwise they pass through the welcome
 * page, which hands on to the dashboard.
 */
export function welcomeNext(next) {
  return safeNext(next, null) ?? '/welcome';
}

/** `?next=...` to carry onto a link between the sign-in pages, or ''. Only a safe value is carried. */
export function nextSuffix(next) {
  const safe = safeNext(next, null);
  return safe ? `?next=${encodeURIComponent(safe)}` : '';
}

/** A forgiving shape check, so an obvious typo gets a plain message before a round trip. */
export const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s ?? '').trim());

/** Firebase rejects anything shorter than this. */
export const MIN_PASSWORD = 6;

const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', '12345678', '123456789', '1234567890', '123456',
  'qwerty', 'qwertyui', 'qwerty123', 'abcdefgh', 'abc12345', 'iloveyou', 'letmein', 'welcome1', 'admin123',
  '11111111', '00000000', 'asdfghjk', 'passw0rd',
]);

const LABELS = ['Too short', 'Weak', 'Okay', 'Strong'];

/**
 * A rough, client-side read on a password, for a hint only. It looks at length
 * and variety and a short list of obvious choices; it is not a security check
 * and never blocks anything beyond Firebase's own minimum (`ok`).
 *
 * Returns null for an empty password, else `{ score: 0-3, label, tip, ok }`.
 */
export function passwordStrength(pw) {
  const s = String(pw ?? '');
  if (!s) return null;
  const len = [...s].length;
  const kinds = [/[\p{Ll}\p{Lo}]/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((re) => re.test(s)).length;
  const lower = s.toLowerCase();
  const obvious = COMMON.has(lower) || new Set(lower).size <= 3 || /^(?:0123456789|1234567890|abcdefghij)/.test(lower);

  let score;
  let tip;
  if (len < MIN_PASSWORD) {
    score = 0;
    tip = `Use at least ${MIN_PASSWORD} characters.`;
  } else if (obvious) {
    score = 1;
    tip = 'That is easy to guess. Try a few unrelated words.';
  } else if (len >= 16) {
    score = 3; // a long phrase is strong whatever it is made of
    tip = 'Good length.';
  } else if (len < 8) {
    score = 1;
    tip = 'Add a few more characters. Eight or more is better.';
  } else if (kinds < 2) {
    score = 1;
    tip = 'Mix in numbers, capitals or symbols, or make it longer.';
  } else if (len >= 12 || (len >= 10 && kinds >= 3)) {
    score = 3;
    tip = 'Good mix and length.';
  } else {
    score = 2;
    tip = 'Longer is stronger.';
  }
  return { score, label: LABELS[score], tip, ok: len >= MIN_PASSWORD };
}
