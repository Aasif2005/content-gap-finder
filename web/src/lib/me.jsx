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
  const seq = useRef(0); // an older response must not overwrite a newer one
  const signedIn = Boolean(user);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    if (!signedIn) { setMe(null); setError(null); return null; }
    // A slow or dropped first call gets one more try before we show an error.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const next = await getMe();
        if (mine === seq.current) { setMe(next); setError(null); }
        return next;
      } catch (err) {
        const again = attempt === 0 && (err.code === 'TIMEOUT' || err.code === 'NETWORK' || err.code === 'SERVER_DOWN');
        if (again && mine === seq.current) continue;
        if (mine === seq.current) setError(err);
        return null;
      }
    }
    return null;
  }, [signedIn]);

  // A different account must not briefly see the last one's numbers.
  useEffect(() => { setMe(null); setError(null); }, [user?.uid]);

  useEffect(() => {
    load();
    return () => { seq.current++; };
  }, [load, user?.uid, user?.emailVerified]);

  const value = useMemo(() => ({
    me,
    error,
    // Only the first load counts: a refresh keeps showing the numbers it has.
    loading: authLoading || (signedIn && !me && !error),
    refresh: load,
  }), [me, error, authLoading, signedIn, load]);

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}
