import { normalizePath } from '../../lib/routes.js';

/**
 * Pure helpers for the log in, sign up and reset pages. No React, no DOM, so
 * they can be unit tested from the server's test suite.
 */

const FALLBACK_NEXT = '/dashboard';
// Sending someone back to a sign-in page after signing in would loop.
const AUTH_PATHS = new Set(['/login', '/signup', '/reset-password', '/auth/action', '/accept-terms']);
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
  // URL() resolves dot segments, so "/.//evil.com" comes out as "//evil.com":
  // the checks above passed, but navigating there leaves the site. Check again.
  if (/^\/[/\\]/.test(url.pathname)) return fallback;
  if (AUTH_PATHS.has(normalizePath(url.pathname))) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `?next=...` to carry onto a link between the sign-in pages, or ''. Only a safe value is carried. */
export function nextSuffix(next) {
  const safe = safeNext(next, null);
  return safe ? `?next=${encodeURIComponent(safe)}` : '';
}

/** An email-and-password account that has not proved the address: it stays out of the app until it does. */
export const needsVerification = (user) => Boolean(user) && user.provider === 'password' && !user.emailVerified;

/** A forgiving shape check, so an obvious typo gets a plain message before a round trip. */
export const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s ?? '').trim());

/** Edits between two words, with two swapped neighbours counted as one slip. */
function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

// Each provider with how many slips still clearly mean it: short names get fewer.
const PROVIDERS = [['gmail', 2], ['hotmail', 2], ['outlook', 2], ['yahoo', 1], ['icloud', 1]];
const COM_TYPOS = new Set(['co', 'con', 'cm', 'om', 'cmo', 'ocm', 'comm', 'vom', 'xom', 'cim']);
// Real domains a slip or two from a provider. Blocking these would shut real people out.
const REAL_NAMES = new Set(['mail', 'email', 'ymail', 'gmx', 'me', 'mac', 'cloud', 'googlemail', 'goal', 'gain', 'gala', 'grail']);
// Too far from `gmail` to be caught by distance.
const NAMED_TYPOS = { 'gm.com': 'gmail.com', 'gml.com': 'gmail.com' };

/**
 * The address someone most likely meant when its domain is a misspelt big
 * provider (`gmai.com`), else null. Firebase accepts any well-formed address and
 * the verification email then goes nowhere, so this is the only place to catch
 * it. Only `.com` forms are judged: `yahoo.de` and `yahoo.co.in` are real, and
 * so is any domain that is not near a provider's name.
 */
export function emailTypoFix(raw) {
  const email = String(raw ?? '').trim();
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  const withDomain = (d) => `${email.slice(0, at)}@${d}`;
  if (NAMED_TYPOS[domain]) return withDomain(NAMED_TYPOS[domain]);

  const dot = domain.indexOf('.');
  if (dot < 1) return null;
  const name = domain.slice(0, dot);
  const ending = domain.slice(dot + 1);
  if ((ending !== 'com' && !COM_TYPOS.has(ending)) || REAL_NAMES.has(name)) return null;

  for (const [provider, reach] of PROVIDERS) {
    const distance = editDistance(name, provider);
    if (distance === 0) return ending === 'com' ? null : withDomain(`${provider}.com`);
    // Two slips must keep the first letter: `rail.com` and `mall.com` are real sites, not bad gmails.
    if (distance === 1 || (distance <= reach && name[0] === provider[0])) return withDomain(`${provider}.com`);
  }
  return null;
}

/** Firebase rejects anything shorter than this. */
export const MIN_PASSWORD = 6;
/** What a new account must use. Logging in keeps Firebase's own floor, so older accounts still work. */
export const MIN_NEW_PASSWORD = 8;

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
    tip = `Use at least ${MIN_NEW_PASSWORD} characters.`; // the hint is for new passwords: never suggest less than sign-up accepts
  } else if (obvious) {
    score = 1;
    tip = 'That is easy to guess. Try a few unrelated words.';
  } else if (len >= 16) {
    score = 3; // a long phrase is strong whatever it is made of
    tip = 'Good length.';
  } else if (len < 8) {
    score = 1;
    tip = `Use at least ${MIN_NEW_PASSWORD} characters.`;
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
