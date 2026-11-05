import { Suspense, useEffect } from 'react';
import MarketingShell from './components/shell/MarketingShell.jsx';
import RequireAuth, { PageSkeleton } from './components/RequireAuth.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import CookieNotice from './components/CookieNotice.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import { useRoute } from './lib/router.jsx';
import { pageView } from './lib/analytics.js';
import { AppShell, preloadAppRoutes } from './routes.jsx';

const SHELLS = { app: AppShell, marketing: MarketingShell };

/** Picks the frame for the matched route (see routes.jsx) and the auth guard around it. */
export default function AppFrame() {
  const ctx = useRoute();
  // One analytics page view per route change; a no-op until the visitor has accepted.
  useEffect(() => { pageView(ctx.path); }, [ctx.path]);
  // Someone who has signed in before is likely headed to the app: fetch its code once the page is idle.
  useEffect(() => {
    let returning = false;
    try { returning = Boolean(localStorage.getItem('gs:me') || localStorage.getItem('gs:runs')); } catch { /* private mode */ }
    if (!returning) return undefined;
    const run = () => preloadAppRoutes();
    return 'requestIdleCallback' in window ? (() => { const id = requestIdleCallback(run, { timeout: 3000 }); return () => cancelIdleCallback(id); })() : (() => { const id = setTimeout(run, 1500); return () => clearTimeout(id); })();
  }, []);
  const { route } = ctx;
  if (!route) return null;

  const page = typeof route.element === 'function' ? route.element(ctx) : route.element;
  const Shell = SHELLS[route.shell];
  // The frame stays up while a page's code arrives; a failed download lands in the boundary, whose Reload fixes it.
  const ready = <Suspense fallback={<PageSkeleton />}>{page}</Suspense>;
  const framed = Shell ? <Suspense fallback={<PageSkeleton />}><Shell {...route.shellProps}>{ready}</Shell></Suspense> : ready;
  return (
    <ErrorBoundary resetKey={ctx.path}>
      <RequireAuth required={route.auth === 'required'}>{framed}</RequireAuth>
      <OfflineBanner />
      <CookieNotice />
    </ErrorBoundary>
  );
}
