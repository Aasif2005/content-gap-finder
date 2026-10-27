import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button } from '../components/ui/index.js';
import { QuickSearch } from '../components/dashboard/QuickSearch.jsx';
import { RecentReports, RecentReportsSkeleton } from '../components/dashboard/RecentReports.jsx';
import { FirstRun } from '../components/dashboard/FirstRun.jsx';
import { AllowancePanel } from '../components/dashboard/AllowancePanel.jsx';
import { WatchesSummary } from '../components/dashboard/WatchesSummary.jsx';
import { getRuns, getWatches } from '../lib/api.js';
import { useMe } from '../lib/me.jsx';
import { navigate } from '../lib/router.jsx';
import { toRunRow, toWatchRow } from '../lib/runRows.js';

const loadRecentRuns = () => getRuns({ limit: 8 });

/** `load` must be a stable function. Returns `[{ status, data, error }, reload]`. */
function useLoad(load) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const seq = useRef(0); // an older answer must not overwrite a newer one

  const reload = useCallback(() => {
    const mine = ++seq.current;
    setState({ status: 'loading', data: null, error: null });
    load().then(
      (data) => { if (mine === seq.current) setState({ status: 'ready', data, error: null }); },
      (error) => { if (mine === seq.current) setState({ status: 'error', data: null, error }); }
    );
  }, [load]);

  useEffect(() => {
    reload();
    return () => { seq.current++; };
  }, [reload]);

  return [state, reload];
}

/**
 * /dashboard: search, the latest reports, today's allowance and the watches.
 * It reads; running and managing happen in the Explorer.
 */
export default function Dashboard() {
  const { me, error: meError, loading: meLoading, refresh: refreshMe } = useMe();
  const [runs, reloadRuns] = useLoad(loadRecentRuns);
  const [watches, reloadWatches] = useLoad(getWatches);

  const [niche, setNiche] = useState('');
  const [searchError, setSearchError] = useState(null);
  const inputRef = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    const q = niche.trim();
    if (q.length < 2) {
      setSearchError(q ? 'Use at least 2 characters.' : 'Enter a niche to search, for example “cast iron restoration”.');
      inputRef.current?.focus();
      return;
    }
    navigate(`/explore?niche=${encodeURIComponent(q)}`);
  };

  const pick = (example) => {
    setNiche(example);
    setSearchError(null);
    inputRef.current?.focus();
  };

  const runRows = useMemo(() => (runs.data?.runs ?? []).map((r) => toRunRow(r)), [runs.data]);
  const watchRows = useMemo(() => (watches.data?.watches ?? []).map((w) => toWatchRow(w)), [watches.data]);

  return (
    <div className="fade-in">
      <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">Welcome back.</h1>
      <p className="mt-2.5 text-[17px] text-fg-2">Search a niche, or pick up where you left off.</p>

      <QuickSearch
        value={niche}
        onChange={(v) => { setNiche(v); if (searchError) setSearchError(null); }}
        onSubmit={submit}
        error={searchError}
        inputRef={inputRef}
      />

      <div className="mt-10 flex flex-wrap items-start gap-8">
        <div className="min-w-0 flex-[2_1_560px]">
          {runs.status === 'loading' && <RecentReportsSkeleton />}
          {runs.status === 'error' && (
            <Alert
              tone="bad"
              title="Could not load your reports"
              action={<Button variant="secondary" onClick={reloadRuns}>Retry</Button>}
            >
              {runs.error?.message}
            </Alert>
          )}
          {runs.status === 'ready' && (runRows.length ? <RecentReports rows={runRows} /> : <FirstRun onPick={pick} />)}
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-8">
          <AllowancePanel me={me} error={meError} loading={meLoading} onRetry={refreshMe} />
          <WatchesSummary
            status={watches.status}
            rows={watchRows}
            max={watches.data?.maxWatches ?? me?.limits?.watches ?? null}
            error={watches.error}
            onRetry={reloadWatches}
          />
        </div>
      </div>
    </div>
  );
}
