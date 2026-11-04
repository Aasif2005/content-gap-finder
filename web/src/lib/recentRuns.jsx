import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getRuns } from './api.js';
import { useAuth } from './auth.jsx';

/**
 * The signed-in person's newest reports (`GET /api/runs`), for the Dashboard.
 *
 * Fetched as soon as the account is known, on whatever page they are on, so the
 * answer is usually in by the time they open the Dashboard. The last answer is
 * also kept per account in localStorage and painted in the very first frame of
 * a visit; the fresh one replaces it when it lands. A failed refresh never
 * blanks a list that is already showing. Same idea as `gs:me` in me.jsx.
 *
 * `status` is 'loading' only when there is nothing at all to show yet.
 */

const RunsContext = createContext(null);

const CACHE_KEY = 'gs:runs';
const LIMIT = 30;

const readCache = (uid) => {
  try {
    const hit = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return hit && hit.uid === uid && Array.isArray(hit.runs) ? hit.runs : null;
  } catch { return null; }
};
const writeCache = (uid, runs) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid, runs })); } catch { /* private mode, or full */ } };
const clearCache = () => { try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem('gs:top'); } catch { /* ignore */ } };

/** What a visit starts from for this account: the saved list if there is one. */
const initial = (uid) => {
  const saved = uid ? readCache(uid) : null;
  return saved
    ? { uid, runs: saved, status: 'ready', error: null }
    : { uid: uid ?? null, runs: null, status: 'loading', error: null };
};

export const useRecentRuns = () => {
  const ctx = useContext(RunsContext);
  if (!ctx) throw new Error('useRecentRuns must be used inside <RecentRunsProvider>');
  return ctx;
};

export function RecentRunsProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState(() => initial(uid));

  // A different account starts from its own saved list (or nothing), decided while
  // rendering so the first frame is already right and never shows the last account's reports.
  let view = state;
  if (state.uid !== uid) {
    view = initial(uid);
    setState(view);
  }

  const uidRef = useRef(uid);
  uidRef.current = uid;
  const seq = useRef(0); // numbers each request
  const applied = useRef(0); // newest request on screen: an older answer must not overwrite it

  const load = useCallback(async () => {
    const owner = uidRef.current;
    if (!owner) return;
    const mine = ++seq.current;
    const current = () => uidRef.current === owner && mine > applied.current;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const body = await getRuns({ limit: LIMIT });
        if (!current()) return;
        applied.current = mine;
        const runs = Array.isArray(body?.runs) ? body.runs : [];
        writeCache(owner, runs);
        setState({ uid: owner, runs, status: 'ready', error: null });
        return;
      } catch (err) {
        const again = attempt === 0 && (err.code === 'TIMEOUT' || err.code === 'NETWORK' || err.code === 'SERVER_DOWN');
        if (again) continue;
        if (!current()) return;
        // Keep whatever is showing: an old list beats an error box. Only a first-ever load shows the error.
        setState((s) => (s.uid === owner && s.runs ? s : { uid: owner, runs: null, status: 'error', error: err }));
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (uid) load();
    else if (!authLoading) clearCache(); // really signed out: the saved list belongs to someone who left
  }, [uid, authLoading, load]);

  const reload = useCallback(() => {
    setState((s) => (s.uid === uidRef.current && s.runs ? s : { ...s, status: 'loading', error: null }));
    return load();
  }, [load]);

  const value = useMemo(
    () => ({ runs: view.runs, status: view.status, error: view.error, reload, refresh: load }),
    [view.runs, view.status, view.error, reload, load],
  );
  return <RunsContext.Provider value={value}>{children}</RunsContext.Provider>;
}
