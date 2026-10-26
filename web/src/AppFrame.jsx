import AppShell from './components/shell/AppShell.jsx';
import MarketingShell from './components/shell/MarketingShell.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import { useRoute } from './lib/router.jsx';

const SHELLS = { app: AppShell, marketing: MarketingShell };

/** Picks the frame for the matched route (see routes.jsx) and the auth guard around it. */
export default function AppFrame() {
  const ctx = useRoute();
  const { route } = ctx;
  if (!route) return null;

  const page = typeof route.element === 'function' ? route.element(ctx) : route.element;
  const Shell = SHELLS[route.shell];
  const framed = Shell ? <Shell {...route.shellProps}>{page}</Shell> : page;
  return <RequireAuth required={route.auth === 'required'}>{framed}</RequireAuth>;
}
