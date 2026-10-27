/**
 * Pure helpers for the profile page: no React, no DOM, so the server's test
 * suite can cover them.
 */

export const NAME_MAX = 80;
export const DELETE_WORD = 'DELETE';

/** Collapses stray whitespace and caps the length. Returns '' for a blank name. */
export const normalizeName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

/** The word they must type to enable the delete button. Case matters on purpose. */
export const deleteConfirmed = (typed) => String(typed ?? '').trim() === DELETE_WORD;

/** "March 2026" from an ISO date, or null when it is missing or unreadable. */
export function memberSince(iso, { locale } = {}) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
}

/**
 * "Resets at midnight Pacific (12:30 PM GMT+5:30 tomorrow, your time)." The
 * server resets allowances at midnight Pacific; this also says when that is
 * where the visitor is. Without a readable `resetsAt` it says just the first part.
 * `now`, `locale` and `timeZone` are overridable for tests.
 */
export function resetsText(resetsAt, { now = new Date(), locale, timeZone } = {}) {
  const base = 'Resets at midnight Pacific';
  const at = new Date(resetsAt);
  if (!resetsAt || Number.isNaN(at.getTime())) return `${base}.`;
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone }).format(at);
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d); // YYYY-MM-DD in the visitor's zone
  const when = day(at) === day(now) ? '' : ' tomorrow';
  return `${base} (${time}${when}, your time).`;
}
