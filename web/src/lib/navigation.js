/**
 * Client-side navigation without React, so plain modules (urlState, the old
 * explorer's helpers) can navigate too. The router listens for NAVIGATE_EVENT
 * as well as `popstate` and re-reads the URL.
 *
 * `pushState` on its own tells nobody, which is why this wraps it. A history
 * change made by calling pushState directly (the explorer does this for report
 * URLs) is picked up the next time the user presses Back.
 */
export const NAVIGATE_EVENT = 'gapstronaut:navigate';

const sameOrigin = (url) => url.origin === window.location.origin;

/**
 * Goes to `href`. `replace` swaps the current history entry instead of adding
 * one. Scrolls to the top on a push (not on a replace, which is usually a URL
 * tidy-up) unless `scroll` says otherwise. A link to another site is a normal
 * page load.
 */
export function navigate(href, { replace = false, scroll } = {}) {
  const url = new URL(href, window.location.href);
  if (!sameOrigin(url)) { window.location.assign(url.href); return; }

  const next = `${url.pathname}${url.search}${url.hash}`;
  // `inApp` lets a page tell that Back will stay on this site, as opposed to a
  // visit that landed here directly, where history.back() would leave it. A
  // replace keeps whatever the entry already said.
  const state = replace ? { ...(window.history.state ?? {}) } : { inApp: true };
  window.history[replace ? 'replaceState' : 'pushState'](state, '', next);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  if (scroll ?? !replace) window.scrollTo(0, 0);
}

/** True when history.back() will stay inside the app. */
export const canGoBack = () => Boolean(window.history.state?.inApp);

/** Back if that stays on this site, otherwise `fallback`. */
export function goBackOr(fallback = '/') {
  if (canGoBack()) window.history.back();
  else navigate(fallback);
}

/** The current path plus query, for a `?next=` that returns the person here. */
export const currentPathAndSearch = () => `${window.location.pathname}${window.location.search}`;
