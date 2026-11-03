import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  const seq = useRef(0); // numbers each request
  const applied = useRef(0); // the newest request whose answer is on screen: an older one must not overwrite it
  const epoch = useRef(0); // bumped when the account changes: answers from the old account are dropped
  const signedIn = Boolean(user);
  const uid = user?.uid;
  const authLoadingRef = useRef(authLoading);
  authLoadingRef.current = authLoading;

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const era = epoch.current;
    if (!signedIn) { applied.current = mine; setMe(null); setError(null); if (!authLoadingRef.current) clearCache(); return null; } // signed out: the saved copy holds an email
    const current = () => era === epoch.current && mine > applied.current;
    // A slow or dropped first call gets one more try before we show an error.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Never wait forever: a body that stalls after the headers would otherwise leave the skeleton up.
        const next = await Promise.race([
          getMe(),
          new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Gapstronaut is taking too long to answer. Try again.'), { code: 'TIMEOUT' })), 15_000)),
        ]);
        // A newer request that finished first wins; a slower older one is not thrown away if nothing newer landed.
        if (current()) { applied.current = mine; setMe(next); setError(null); if (uid) writeCache(uid, next); }
        return next;
      } catch (err) {
        const again = attempt === 0 && (err.code === 'TIMEOUT' || err.code === 'NETWORK' || err.code === 'SERVER_DOWN');
        if (again) continue;
        if (current()) setError(err);
        return null;
      }
    }
    return null;
  }, [signedIn, uid]);

  // A different account must not briefly see the last one's numbers.
  useEffect(() => { epoch.current++; applied.current = seq.current; setMe(uid ? readCache(uid) : null); setError(null); }, [uid]);

  useEffect(() => { load(); }, [load, user?.uid, user?.emailVerified]);

  const value = useMemo(() => ({
    me,
    error,
    // Only the first load counts: a refresh keeps showing the numbers it has.
    loading: authLoading || (signedIn && !me && !error),
    refresh: load,
  }), [me, error, authLoading, signedIn, load]);

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}
