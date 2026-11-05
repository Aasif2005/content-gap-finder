import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState } from 'react';
import { setTokenGetter } from './api.js';

/**
 * Who is signed in, as `useAuth()` returns it: `{ user, loading, configured, ...actions }`.
 * See authImpl.jsx for the shape of `user` and the actions.
 *
 * Firebase (sign-in, App Check, reCAPTCHA) is most of the JavaScript a visitor downloads, and a visitor
 * reading the homepage needs none of it to see the page. So this file is small and loads
 * authImpl.jsx separately: at once on pages that need an account (or for someone who has signed in
 * before), and on a first tap, key or scroll (or after a long wait) on the homepage and legal pages. Until it arrives
 * `loading` is true, and an action called early simply waits for it.
 */

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

const env = import.meta.env;
const configured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);

// Pages that do not need an account: sign-in code can wait until they have loaded.
const CAN_WAIT = new Set(['/', '/privacy', '/terms']);
const returning = () => { try { return Boolean(localStorage.getItem('gs:me') || localStorage.getItem('gs:runs')); } catch { return false; } };

let started = false;
let begin = () => {};
let latest = null;
let resolveReady;
const ready = new Promise((resolve) => { resolveReady = resolve; });

const ACTIONS = [
  'signInWithGoogle', 'signUpWithEmail', 'signInWithEmail', 'sendReset', 'verifyResetCode', 'confirmReset',
  'applyVerification', 'signOutUser', 'resendVerification', 'deleteAccount', 'getIdToken', 'reloadUser',
  'checkVerified', 'discardNewAccount',
];
// Before the real thing arrives: calling an action starts the load and waits for it.
const waiting = Object.fromEntries(ACTIONS.map((name) => [name, (...args) => { begin(); return ready.then((v) => v[name](...args)); }]));

// api.js asks for a token through this. Registered at load, not in an effect: a child's first fetch runs before
// its parent's effects do. Nobody has been asked to sign in until `started`, so there is nothing to send.
setTokenGetter(async () => {
  if (!started) return null;
  const v = latest ?? (await ready);
  return v.getIdToken();
});

const AuthImpl = lazy(() => import('./authImpl.jsx'));

export function AuthProvider({ children }) {
  const [go, setGo] = useState(false);
  const [impl, setImpl] = useState(null);

  useEffect(() => {
    begin = () => { started = true; setGo(true); };
    if (started) { setGo(true); return undefined; }
    if (!CAN_WAIT.has(window.location.pathname) || returning()) { begin(); return undefined; }
    // Nobody on these pages needs an account to read them: wait for a sign that they want one (a tap, a key, a
    // scroll) or, failing that, a long while after load, so Firebase and reCAPTCHA never compete with the page itself.
    const early = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    const go = () => begin();
    early.forEach((e) => window.addEventListener(e, go, { once: true, passive: true }));
    const id = setTimeout(go, 8000);
    return () => { early.forEach((e) => window.removeEventListener(e, go)); clearTimeout(id); };
  }, []);

  const onValue = useMemo(() => (v) => { latest = v; resolveReady(v); setImpl(v); }, []);
  const value = useMemo(() => impl ?? { user: null, loading: configured, configured, ...waiting }, [impl]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {go && <Suspense fallback={null}><AuthImpl onValue={onValue} /></Suspense>}
    </AuthContext.Provider>
  );
}
