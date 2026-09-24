/**
 * The search form's state, mirrored into the URL.
 *
 * Two separate jobs, both previously missing: a finished report gets a
 * `/r/<runId>` path so it can be bookmarked or sent to someone, and a query
 * gets ?niche=...&window=... so a reload or a shared link reopens the same
 * search instead of an empty form.
 *
 * A shared query link deliberately does NOT auto-run. A run spends real
 * YouTube quota, and a link that silently bills the person who opens it is a
 * trap -- the form is prefilled and they press the button.
 */

const FIELDS = {
  niche: { parse: (v) => v, serialize: (v) => v || undefined },
  window: { parse: (v) => v, serialize: (v) => (v && v !== '7d' ? v : undefined) },
  customAfter: { parse: (v) => v, serialize: (v) => v || undefined },
  contentType: { parse: (v) => v, serialize: (v) => (v && v !== 'both' ? v : undefined) },
  gapMode: { parse: (v) => v, serialize: (v) => (v && v !== 'inclusive' ? v : undefined) },
  regionCode: { parse: (v) => v, serialize: (v) => v || undefined },
  relevanceLanguage: { parse: (v) => v, serialize: (v) => v || undefined },
  channelId: { parse: (v) => v, serialize: (v) => v || undefined },
  minViews: { parse: (v) => Number(v) || 0, serialize: (v) => (v > 0 ? String(v) : undefined) },
  deepScan: { parse: (v) => v === 'true', serialize: (v) => (v ? 'true' : undefined) },
};

/** `/r/<runId>` -> that run id, else null. */
export function runIdFromPath(pathname = window.location.pathname) {
  const m = /^\/r\/([a-zA-Z0-9_-]+)\/?$/.exec(pathname);
  return m ? m[1] : null;
}

/** Query params -> a partial search input, omitting anything absent. */
export function queryFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const out = {};
  for (const [key, { parse }] of Object.entries(FIELDS)) {
    if (params.has(key)) out[key] = parse(params.get(key));
  }
  return out;
}

/** A search input -> `?a=b`, omitting defaults so a plain query stays a clean URL. */
export function queryToSearch(input = {}) {
  const params = new URLSearchParams();
  for (const [key, { serialize }] of Object.entries(FIELDS)) {
    const v = serialize(input[key]);
    if (v !== undefined) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Replaces the URL without a navigation, so a report becomes linkable in place. */
export function pushReportUrl(runId) {
  if (!runId) return;
  window.history.pushState({ runId }, '', `/r/${runId}`);
}

export function pushQueryUrl(input) {
  window.history.replaceState({}, '', `/${queryToSearch(input)}`);
}
