import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchForm } from '../components/SearchForm.jsx';
import { ProgressRail } from '../components/ProgressRail.jsx';
import { WatchPanel } from '../components/WatchPanel.jsx';
import { ReportView } from '../components/explorer/ReportView.jsx';
import { ReportSkeleton } from '../components/explorer/ReportSkeleton.jsx';
import { RunError } from '../components/explorer/RunError.jsx';
import { PublicBanner } from '../components/explorer/PublicBanner.jsx';
import { ThinkingOrb } from '../components/orb/ThinkingOrb.jsx';
import { startAnalysis, pollJob, getRun } from '../lib/api.js';
import {
  queryFromUrl,
  pushReportUrl,
  pushQueryUrl,
  reportPathFor,
  correctReportPath,
} from '../lib/urlState.js';
import { describeLoadError, describeRunError, formatLabel, reportName, windowLabel } from '../lib/runRows.js';
import { useConsent } from '../lib/consent.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useMe } from '../lib/me.jsx';
import { SITE_NAME, currentPathAndSearch, navigate, useRoute } from '../lib/router.jsx';

// Niche search is exploratory (broad discovery across many creators, content
// ideas for something you don't own yet); channel analysis is diagnostic (one
// creator's own catalogue and own audience -- what to improve, what's already
// working, what viewers keep asking for). Different intent, so they are two
// separate top-level pages under one app shell, not a toggle buried in the
// search form -- the page you're on now IS the mode.
const PAGES = {
  niche: {
    label: 'Niche Explorer',
    eyebrow: 'Niche explorer',
    tagline: 'What viewers keep asking for that nobody has made.',
    navLabel: 'Explore a niche',
    subtitle: "Enter a niche. Get what's trending on YouTube right now, what viewers keep "
      + 'asking for that nobody has made, and what to avoid.',
    emptyTitle: 'Start with a niche',
    emptyBody: 'Try something specific — “cast iron restoration” beats “cooking”. Narrow niches produce '
      + 'sharper gaps because the comments are all about the same subject.',
  },
  channel: {
    label: 'Channel Analyzer',
    eyebrow: 'Channel analyzer',
    tagline: 'What’s working, what its viewers ask for, and what they complain about.',
    navLabel: 'Analyze a channel',
    subtitle: 'Paste a channel. See which of its own videos are working, what its own viewers keep '
      + 'asking for and have not gotten, and what they complain about.',
    emptyTitle: 'Start with a channel',
    emptyBody: 'Paste a channel URL, @handle, or channel id. Every result is scoped to that channel’s own '
      + 'uploads and its own viewers’ comments — nothing else.',
  },
};

// A report that was just opened under the wrong page's URL is fetched, then the
// URL is corrected and the other page's Explorer mounts and asks for it again.
// Handing it the copy we already hold saves the second round trip.
let recentRun = null;
const RECENT_MS = 15_000;
async function fetchRun(runId) {
  if (recentRun && recentRun.runId === runId && Date.now() - recentRun.at < RECENT_MS) return recentRun.saved;
  const { result } = await getRun(runId);
  recentRun = { runId, saved: result, at: Date.now() };
  return result;
}

/**
 * The Niche Explorer (/explore), the Channel Analyzer (/channel) and any saved
 * report (/r/:id, /channel/r/:id). The route table gives `mode`
 * ('niche' | 'channel') and, on a report URL, `routeRunId`.
 *
 * The URL is the source of truth for which report is open: a run finishing
 * navigates to its /r/<id>, Back and Forward change `routeRunId`, and an effect
 * below loads whatever it names. A logged-out visitor can open a shared report
 * (read-only); only an account can run, refresh, watch or make a brief.
 */
export function Explorer({ mode = 'niche', routeRunId = null }) {
  const { user, loading: authLoading } = useAuth();
  const { me, refresh: refreshMe } = useMe();
  const { search } = useRoute();
  const ensureConsent = useConsent();

  const [phase, setPhase] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loadingRun, setLoadingRun] = useState(Boolean(routeRunId));
  const [cacheInfo, setCacheInfo] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  // A query in the URL prefills the form but deliberately does not auto-run --
  // a run spends real quota, and a link that bills whoever opens it is a trap.
  // What the search form shows. Starts from the URL, and follows an opened
  // report's query so "Find gaps" runs the same search the report shows (it
  // used to keep the defaults, so Refresh and Find gaps ran different queries).
  const [formQuery, setFormQuery] = useState(() => (routeRunId ? {} : queryFromUrl(search)));
  const [formKey, setFormKey] = useState(0);
  // The thinking orb that plays while a run is in flight (see components/orb).
  const [orbJob, setOrbJob] = useState(null);
  const lastInput = useRef(null);
  // Bumped by every new run / report open / page leave; anything that resolves
  // under an older number is stale and must not touch the page.
  const requestSeq = useRef(0);
  // The report on screen, so the URL effect can tell "the run I just finished"
  // from "somewhere else".
  const loadedRunId = useRef(null);
  // The query string this page itself wrote, so it does not reset its own form.
  const ownSearch = useRef(search);

  const busy = Boolean(phase);
  const canRun = Boolean(user);
  const readOnly = !user && !authLoading;

  // Read by the URL effect below, which must not depend on them.
  const live = useRef({});
  useEffect(() => { live.current = { busy, shown: Boolean(result || error || loadingRun) }; });

  /** Opens a persisted report by id. Free -- a disk read of an already-paid run. */
  const openRun = useCallback(async (runId) => {
    const seq = ++requestSeq.current;
    loadedRunId.current = null;
    setError(null);
    setResult(null);
    setCacheInfo(null);
    setPhase(null);
    setFormOpen(false);
    setLoadingRun(true);
    try {
      const saved = await fetchRun(runId);
      if (seq !== requestSeq.current) return;
      // A report belongs to the page that made it. If this URL is the other
      // page's, move to the right one; that page mounts fresh and loads it.
      const fix = correctReportPath(mode, Boolean(saved.channelMode), runId);
      if (fix) { navigate(fix, { replace: true, scroll: false }); return; }
      loadedRunId.current = runId;
      lastInput.current = saved.query;
      setResult(saved);
      setFormQuery(saved.query ?? {});
      setFormKey((k) => k + 1);
      setLoadingRun(false);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(describeLoadError(err));
      setLoadingRun(false);
    }
  }, [mode]);

  // The URL decides what is open. A /r/<id> loads that report (first load, a
  // link, Back and Forward); coming back to a plain page from a report resets
  // to the form, and a different query string refills it.
  useEffect(() => {
    if (routeRunId) {
      if (loadedRunId.current !== routeRunId) openRun(routeRunId);
      return;
    }
    const { busy: running, shown } = live.current;
    if (running) return; // a run rewrites the URL itself
    if (shown) {
      requestSeq.current++;
      loadedRunId.current = null;
      setResult(null);
      setError(null);
      setCacheInfo(null);
      setLoadingRun(false);
      setFormOpen(false);
      ownSearch.current = search;
      setFormQuery(queryFromUrl(search));
      setFormKey((k) => k + 1);
    } else if (search !== ownSearch.current) {
      ownSearch.current = search;
      setFormQuery(queryFromUrl(search));
      setFormKey((k) => k + 1);
    }
  }, [routeRunId, search, openRun]);

  // Leaving the page cancels whatever is in flight.
  useEffect(() => () => { requestSeq.current++; }, []);

  // The route sets a generic tab title; a report is named after what it is about.
  // Deferred a tick so it lands after the router's own title update on a route change.
  useEffect(() => {
    if (!result) return undefined;
    const t = setTimeout(() => { document.title = `${reportName(result)} · ${SITE_NAME}`; }, 0);
    return () => clearTimeout(t);
  }, [result]);

  const run = useCallback(async (input, { force = false, origin } = {}) => {
    // A run reads YouTube data on the visitor's behalf; the Terms (which bind
    // them to YouTube's) and the Privacy Policy must be accepted first.
    if (!(await ensureConsent())) return;
    const seq = ++requestSeq.current;
    const stale = () => seq !== requestSeq.current;
    lastInput.current = input;
    loadedRunId.current = null;
    pushQueryUrl(input, mode); // so a reload or a shared link reopens the same search
    ownSearch.current = window.location.search;
    setError(null);
    setResult(null);
    setCacheInfo(null);
    setLoadingRun(false);
    setFormOpen(false);
    setPhase({ phase: 'searching', detail: 'Starting…', progress: 0, elapsedMs: 0 });

    // The orb waits on this: it settles with the line for the finished card when the run lands.
    const subject = (input.niche || input.channelId || '').toString();
    const summary = [subject, windowLabel(input.window), formatLabel(input.contentType)].filter(Boolean).join(' · ');
    let settle = null;
    const finished = new Promise((resolve) => { settle = resolve; });
    setOrbJob({ id: seq, text: subject, origin, onSubmit: () => finished, summary });
    const closeOrb = () => setOrbJob((j) => (j && j.id === seq ? null : j));

    try {
      const started = await startAnalysis({ ...input, force });
      if (stale()) return;

      if (started.status === 'done') {
        // Served straight from cache -- no quota spent, no waiting.
        setCacheInfo({ cached: true, ageSeconds: started.cacheAgeSeconds });
        loadedRunId.current = started.result?.runId ?? null;
        setResult(started.result);
        setPhase(null);
        settle(summary);
        if (started.result?.runId) pushReportUrl(started.result.runId, mode);
        return;
      }

      const final = await pollJob(
        started.jobId,
        (job) => setPhase({ phase: job.phase, detail: job.detail, progress: job.progress, elapsedMs: job.elapsedMs }),
        { isCancelled: stale }
      );
      if (stale()) return;
      loadedRunId.current = final.runId;
      setResult(final);
      setPhase(null);
      settle(summary);
      // Now the report has an id, so give it a URL worth sharing.
      pushReportUrl(final.runId, mode);
    } catch (err) {
      closeOrb();
      if (err.cancelled || stale()) return;
      const described = describeRunError(err, { limit: me?.limits?.analyses });
      setPhase(null);
      if (described.kind === 'auth') {
        navigate(`/login?next=${encodeURIComponent(currentPathAndSearch())}`);
        return;
      }
      setError(described);
    } finally {
      // The allowance chip in the top bar follows what the server just counted.
      refreshMe();
    }
  }, [mode, ensureConsent, refreshMe, me?.limits?.analyses]);

  /** Esc / Cancel on the orb: stop caring about the run in flight, like leaving the page does. */
  const onOrbDismiss = useCallback(({ cancelled }) => {
    setOrbJob(null);
    if (cancelled) { requestSeq.current++; setPhase(null); }
  }, []);

  /** The history and watch panels open a saved report by going to its URL. */
  const goToRun = useCallback((runId) => {
    if (runId && runId !== loadedRunId.current) navigate(reportPathFor(mode, runId));
  }, [mode]);

  const page = PAGES[mode];
  const reportRoute = Boolean(routeRunId);
  // The form is the page when there is no report. Over a report it opens on
  // request ("Edit search"); during a run it stays up with the progress under it.
  const showForm = canRun && (!reportRoute || busy || formOpen || (!result && !loadingRun));
  const rerun = (patch) => run({ ...lastInput.current, ...patch }, { force: true });

  // Recent reports live on the Dashboard. Watches are managed at the foot of a
  // report: only a query that actually produced a report can be watched (the raw
  // form input let a watch be saved for a channel that never resolved).
  const panels = canRun && result && (
    <WatchPanel currentQuery={result.query ?? null} onOpenRun={goToRun} mode={mode} />
  );

  const retry = error?.kind === 'load'
    ? () => openRun(routeRunId)
    : error?.kind === 'generic' && lastInput.current
      ? () => run(lastInput.current)
      : null;

  return (
    <div className="fade-in">
      {readOnly && <PublicBanner />}

      {/* While an analysis runs the orb takes the content area (the shell stays); the form and report return when it closes. */}
      {orbJob && <ThinkingOrb key={orbJob.id} job={orbJob} progress={phase} onDismiss={onOrbDismiss} />}

      {showForm && !orbJob && (
        <section aria-label={result ? 'Edit your search' : undefined} className={result ? 'mx-auto mb-8 max-w-[760px]' : undefined}>
          {!result ? (
            <div className="relative mx-auto max-w-[760px] pb-10 pt-8 text-center sm:pt-16">
              <span aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-72 w-[min(820px,120%)] -translate-x-1/2 rounded-full bg-focus/10 blur-3xl" />
              <p className="relative text-[13px] font-semibold uppercase tracking-[0.16em] text-fg-3">{page.eyebrow}</p>
              <h1 className="relative mt-4 text-[44px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[64px]">{page.navLabel}</h1>
              <p className="relative mx-auto mt-4 max-w-[46ch] text-[18px] leading-relaxed text-fg-2">{page.tagline}</p>
              <div className="relative mt-10 text-left">
                <SearchForm key={`${mode}:${formKey}`} onSubmit={run} busy={busy} initial={formQuery} mode={mode} />
              </div>
            </div>
          ) : (
            <SearchForm key={`${mode}:${formKey}`} onSubmit={run} busy={busy} initial={formQuery} mode={mode} />
          )}
        </section>
      )}

      {!orbJob && (
      <div className={showForm ? 'report-in mt-8' : 'report-in'}>
        {busy && <ProgressRail {...phase} />}

        {error && (
          <RunError
            error={error}
            signedIn={Boolean(user)}
            onRetry={retry}
            onDismiss={() => setError(null)}
          />
        )}

        {loadingRun && <ReportSkeleton />}

        {result && (
          <ReportView
            key={result.runId}
            result={result}
            cacheInfo={cacheInfo}
            busy={busy}
            canRun={canRun}
            canMake={Boolean(user)}
            formOpen={formOpen}
            onToggleForm={() => setFormOpen((v) => !v)}
            onRefresh={() => run(lastInput.current, { force: true })}
            onRerun={rerun}
            extras={panels}
          />
        )}

      </div>
      )}
    </div>
  );
}

export default Explorer;
