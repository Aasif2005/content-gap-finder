/**
 * Route matching, kept free of React and the DOM so it can be unit tested.
 *
 * A table is an array of `{ path, ... }`. `path` is a pattern of `/`-separated
 * segments: a plain segment must match exactly, `:name` matches any one
 * segment and is returned in `params`, and a trailing `*` matches whatever is
 * left (including nothing), returned as `params['*']`. The first entry that
 * matches wins, so put the catch-all last.
 */

/** `/a/b/` -> `/a/b`. Drops any query or hash and guarantees a leading slash. */
export function normalizePath(pathname) {
  let p = String(pathname ?? '/').split(/[?#]/)[0];
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

const segments = (path) => normalizePath(path).split('/').filter(Boolean);

// A malformed escape (a stray %) must not take the whole app down.
const decode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

function matchOne(pattern, parts) {
  // The bare pattern `*` is the catch-all; segments() would otherwise see ['*'] anyway.
  const want = segments(pattern);
  const params = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i];
    if (w === '*' && i === want.length - 1) {
      params['*'] = parts.slice(i).map(decode).join('/');
      return params;
    }
    if (i >= parts.length) return null;
    if (w.startsWith(':')) params[w.slice(1)] = decode(parts[i]);
    else if (w !== parts[i]) return null;
  }
  return parts.length === want.length ? params : null;
}

/** The first route in `table` that matches `pathname`, with its params, or null. */
export function matchRoute(pathname, table) {
  const parts = segments(pathname);
  for (const route of table) {
    const params = matchOne(route.path, parts);
    if (params) return { route, params };
  }
  return null;
}
