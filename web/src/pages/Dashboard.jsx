import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button } from '../components/ui/index.js';
import { QuickSearch } from '../components/dashboard/QuickSearch.jsx';
import { RecentReports, RecentReportsSkeleton } from '../components/dashboard/RecentReports.jsx';
import { FirstRun } from '../components/dashboard/FirstRun.jsx';
import { AllowancePanel } from '../components/dashboard/AllowancePanel.jsx';
import { WATCHES } from '../lib/features.js';
import { WatchesSummary } from '../components/dashboard/WatchesSummary.jsx';
import { EntryCards, LatestReport, StatStrip, Tips } from '../components/dashboard/Overview.jsx';
import { getRuns, getWatches } from '../lib/api.js';
import { useMe } from '../lib/me.jsx';
import { navigate } from '../lib/router.jsx';
import { toRunRow, toWatchRow } from '../lib/runRows.js';

const loadRecentRuns = () => getRuns({ limit: 30 });

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

// Watches are held back until the quota audit (lib/features.js): nothing to load.
const noWatches = () => Promise.resolve({ watches: [] });

/**
 * /dashboard: the one place for the workspace overview: search, numbers about
 * the reports kept, the latest report, the recent ones, watches and today's
 * allowance. It reads; running happens in the Explorer.
 */
export default function Dashboard() {
  const { me, error: meError, loading: meLoading, refresh: refreshMe } = useMe();
  const [runs, reloadRuns] = useLoad(loadRecentRuns);
  const [watches, reloadWatches] = useLoad(WATCHES ? getWatches : noWatches);

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

  const runList = runs.data?.runs ?? [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';

  return (
    <div className="pb-8">
      <div className="relative pt-4 sm:pt-8">
        <span aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[min(900px,100%)] -translate-x-1/2 rounded-full bg-focus/10 blur-3xl" />
        <h1 className="relative text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[60px]">{greeting}</h1>
        <p className="relative mt-3 text-[18px] text-fg-2">Search a niche, or pick up where you left off.</p>
        <div className="relative">
          <QuickSearch
            value={niche}
            onChange={(v) => { setNiche(v); if (searchError) setSearchError(null); }}
            onSubmit={submit}
            error={searchError}
            inputRef={inputRef}
          />
        </div>
      </div>

      {runs.status === 'ready' && <StatStrip runs={runList} />}

      <EntryCards />

      {runs.status === 'ready' && runRows[0] && <LatestReport row={runRows[0]} summary={runList[0]} />}

      <div className="mt-12">
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
        {runs.status === 'ready' && (runRows.length ? <RecentReports rows={runRows.slice(0, 6)} /> : <FirstRun onPick={pick} />)}
      </div>

      <div className={WATCHES ? 'mt-12 grid items-start gap-5 lg:grid-cols-[3fr_2fr]' : 'mt-12'}>
        {WATCHES && (
          <WatchesSummary
            status={watches.status}
            rows={watchRows}
            max={watches.data?.maxWatches ?? me?.limits?.watches ?? null}
            error={watches.error}
            onRetry={reloadWatches}
          />
        )}
        <AllowancePanel me={me} error={meError} loading={meLoading} onRetry={refreshMe} />
      </div>

      <Tips />
    </div>
  );
}
