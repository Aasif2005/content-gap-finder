import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { matchRoute, normalizePath } from './routes.js';
import { NAVIGATE_EVENT, navigate } from './navigation.js';

export { navigate, goBackOr, canGoBack, currentPathAndSearch } from './navigation.js';

/**
 * A small router: no library, the table lives in src/routes.jsx.
 *
 * `useRoute()` gives `{ path, params, query, search, route }` where `route` is
 * the matched table entry. `query` is a plain object of the first value of each
 * parameter.
 */

const RouteContext = createContext(null);

const readLocation = () => `${window.location.pathname}${window.location.search}`;

const queryObject = (search) => {
  const out = {};
  for (const [k, v] of new URLSearchParams(search)) if (!(k in out)) out[k] = v;
  return out;
};

export const SITE_NAME = 'Gapstronaut';
const titleFor = (route) => (route?.title ? `${route.title} · ${SITE_NAME}` : SITE_NAME);
const descriptionTag = () => document.querySelector('meta[name="description"]');
const DEFAULT_DESCRIPTION = descriptionTag()?.content ?? '';

export function RouterProvider({ routes, children }) {
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const sync = () => setLoc(readLocation());
    window.addEventListener('popstate', sync);
    window.addEventListener(NAVIGATE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(NAVIGATE_EVENT, sync);
    };
  }, []);

  const value = useMemo(() => {
    const [pathname, ...rest] = loc.split('?');
    const search = rest.length ? `?${rest.join('?')}` : '';
    const path = normalizePath(pathname);
    const hit = matchRoute(path, routes);
    return { path, search, query: queryObject(search), params: hit?.params ?? {}, route: hit?.route ?? null };
  }, [loc, routes]);

  // Titles follow the route, not the query string: a page that sets its own
  // (a report named after its niche) is not overwritten by a ?niche= change.
  useEffect(() => {
    document.title = titleFor(value.route);
    descriptionTag()?.setAttribute('content', value.route?.description ?? DEFAULT_DESCRIPTION);
  }, [value.route]);

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRoute() {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRoute must be used inside <RouterProvider>');
  return ctx;
}

const isExternal = (href) => {
  try { return new URL(href, window.location.href).origin !== window.location.origin; } catch { return false; }
};

/**
 * An `<a>` that navigates without a page load on a plain left click, and leaves
 * modified clicks (new tab, download) and `target="_blank"` to the browser.
 */
export const Link = forwardRef(function Link({ href, replace = false, scroll, onClick, target, rel, children, ...rest }, ref) {
  const handle = useCallback((e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (target && target !== '_self') return;
    if (rest.download !== undefined || !href || isExternal(href)) return;
    e.preventDefault();
    navigate(href, { replace, scroll });
  }, [href, replace, scroll, onClick, target, rest.download]);

  return (
    <a
      ref={ref}
      href={href}
      target={target}
      rel={target === '_blank' ? rel ?? 'noreferrer noopener' : rel}
      onClick={handle}
      {...rest}
    >
      {children}
    </a>
  );
});
