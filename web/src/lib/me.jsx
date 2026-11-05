import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getMe } from './api.js';
import { useAuth } from './auth.jsx';

/**
 * `/api/me` for the signed-in person: profile, today's usage, limits, reset
 * time and watch count. `me` is null when logged out. It refetches when the
 * account changes (or its email gets verified) and after `refresh()`, which
 * resolves to the fresh value.
 */

const MeContext = createContext(null);

// The last answer, kept per account, so the numbers paint with the page and update when the fresh answer lands.
const CACHE_KEY = 'gs:me';
const readCache = (uid) => {
  try {
    const hit = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    // Usage from before the daily reset would be wrong: it is only shown until `resetsAt`.
    return hit && hit.uid === uid && hit.me?.resetsAt && Date.parse(hit.me.resetsAt) > Date.now() ? hit.me : null;
  } catch { return null; }
};
const writeCache = (uid, me) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid, me })); } catch { /* private mode */ } };
const clearCache = () => { try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ } };

export const useMe = () => {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('useMe must be used inside <MeProvider>');
  return ctx;
};

export function MeProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const signedIn = Boolean(user);
  const uid = user?.uid;

  // `refresh` is often called from a callback created before sign-in finished
  // (the sign-up page awaits sign-in, then refreshes). So `load` reads the
  // account from refs, never from its closure: a stale closure once ran the
  // signed-out branch and threw away the real answer, leaving the skeleton up.
  const uidRef = useRef(uid);
  uidRef.current = uid;
  const seq = useRef(0); // numbers each request
  const applied = useRef(0); // newest request whose answer is on screen: an older one must not overwrite it
  const inFlight = useRef(0);
  const [pending, setPending] = useState(0); // mirrors inFlight so the self-heal below re-checks when calls finish

  const load = useCallback(async () => {
    const owner = uidRef.current;
    if (!owner) return null; // signed out (or not yet known): the uid effect below handles clearing
    const mine = ++seq.current;
    inFlight.current++;
    setPending((n) => n + 1);
    const current = () => uidRef.current === owner && mine > applied.current;
    try {
      // A slow or dropped first call gets one more try before we show an error.
      for (let attempt = 0; attempt < 2; attempt++) {
        let timer;
        try {
          // Never wait forever: a body that stalls after the headers would otherwise leave the skeleton up.
          const next = await Promise.race([
            getMe(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Gapstronaut is taking too long to answer. Try again.'), { code: 'TIMEOUT' })), 15_000); }),
          ]);
          if (current()) { applied.current = mine; setMe(next); setError(null); writeCache(owner, next); }
          return next;
        } catch (err) {
          const again = attempt === 0 && (err.code === 'TIMEOUT' || err.code === 'NETWORK' || err.code === 'SERVER_DOWN');
          if (again) continue;
          if (current()) setError(err);
          return null;
        } finally {
          clearTimeout(timer);
        }
      }
      return null;
    } finally {
      inFlight.current--;
      setPending((n) => n - 1);
    }
  }, []);

  // A different account must not briefly see the last one's numbers. Signed
  // out for real (auth settled, no user): forget the saved copy, it holds an email.
  // A layout effect, so the saved numbers are in the very first frame after sign-in is known.
  useLayoutEffect(() => {
    setMe(uid ? readCache(uid) : null);
    setError(null);
    if (!uid && !authLoading) clearCache();
  }, [uid, authLoading]);

  useEffect(() => { if (uid) load(); }, [load, uid, user?.emailVerified]);

  // Self-heal: signed in with nothing to show, no error and nothing on the way means an
  // answer went missing. Ask again rather than leave the skeleton up.
  useEffect(() => {
    if (uid && !me && !error && inFlight.current === 0) load();
  }, [uid, me, error, pending, load]);

  const value = useMemo(() => ({
    me,
    error,
    // Only the first load counts: a refresh keeps showing the numbers it has.
    loading: authLoading || (signedIn && !me && !error),
    refresh: load,
  }), [me, error, authLoading, signedIn, load]);

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}
