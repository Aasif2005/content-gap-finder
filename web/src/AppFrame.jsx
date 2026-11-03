import { Suspense, useEffect } from 'react';
import AppShell from './components/shell/AppShell.jsx';
import MarketingShell from './components/shell/MarketingShell.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import CookieNotice from './components/CookieNotice.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import { useRoute } from './lib/router.jsx';
import { pageView } from './lib/analytics.js';

const SHELLS = { app: AppShell, marketing: MarketingShell };

/** Picks the frame for the matched route (see routes.jsx) and the auth guard around it. */
export default function AppFrame() {
  const ctx = useRoute();
  // One analytics page view per route change; a no-op until the visitor has accepted.
  useEffect(() => { pageView(ctx.path); }, [ctx.path]);
  const { route } = ctx;
  if (!route) return null;

  const page = typeof route.element === 'function' ? route.element(ctx) : route.element;
  const Shell = SHELLS[route.shell];
  // The frame stays up while a page's code arrives; a failed download lands in the boundary, whose Reload fixes it.
  const ready = <Suspense fallback={<div role="status" aria-label="Loading" className="min-h-[60vh]" />}>{page}</Suspense>;
  const framed = Shell ? <Shell {...route.shellProps}>{ready}</Shell> : ready;
  return (
    <ErrorBoundary resetKey={ctx.path}>
      <RequireAuth required={route.auth === 'required'}>{framed}</RequireAuth>
      <OfflineBanner />
      <CookieNotice />
    </ErrorBoundary>
  );
}
