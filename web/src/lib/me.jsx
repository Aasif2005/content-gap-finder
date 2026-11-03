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

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const era = epoch.current;
    if (!signedIn) { applied.current = mine; setMe(null); setError(null); return null; }
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
        if (current()) { applied.current = mine; setMe(next); setError(null); }
        return next;
      } catch (err) {
        const again = attempt === 0 && (err.code === 'TIMEOUT' || err.code === 'NETWORK' || err.code === 'SERVER_DOWN');
        if (again) continue;
        if (current()) setError(err);
        return null;
      }
    }
    return null;
  }, [signedIn]);

  // A different account must not briefly see the last one's numbers.
  useEffect(() => { epoch.current++; applied.current = seq.current; setMe(null); setError(null); }, [user?.uid]);

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
