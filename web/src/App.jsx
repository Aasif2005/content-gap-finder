import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchForm } from './components/SearchForm.jsx';
import { ProgressRail } from './components/ProgressRail.jsx';
import { TopicCard } from './components/TopicCard.jsx';
import { GapCard } from './components/GapCard.jsx';
import { AvoidCard } from './components/AvoidCard.jsx';
import { ObjectionCard } from './components/ObjectionCard.jsx';
import { EmptyState, StatRow, Badge } from './components/Bits.jsx';
import { ThinPoolNotice } from './components/ThinPoolNotice.jsx';
import { ExportMenu } from './components/ExportMenu.jsx';
import { HistoryPanel } from './components/HistoryPanel.jsx';
import { WatchPanel } from './components/WatchPanel.jsx';
import { startAnalysis, pollJob, getQuota, getRun } from './lib/api.js';
import { compact } from './lib/format.js';
import {
  runIdFromPath,
  queryFromUrl,
  pushReportUrl,
  pushQueryUrl,
  modeFromPath,
  basePathFor,
} from './lib/urlState.js';

// Niche search is exploratory (broad discovery across many creators, content
// ideas for something you don't own yet); channel analysis is diagnostic (one
// creator's own catalogue and own audience -- what to improve, what's already
// working, what viewers keep asking for). Different intent, so they are two
// separate top-level pages under one app shell, not a toggle buried in the
// search form -- the page you're on now IS the mode.
const PAGES = {
  niche: {
    label: 'Niche Explorer',
    navLabel: 'Explore a niche',
    subtitle: "Enter a niche. Get what's trending on YouTube right now, what viewers keep "
      + 'asking for that nobody has made, and what to avoid.',
    emptyTitle: 'Start with a niche',
    emptyBody: 'Try something specific — “cast iron restoration” beats “cooking”. Narrow niches produce '
      + 'sharper gaps because the comments are all about the same subject.',
  },
  channel: {
    label: 'Channel Analyzer',
    navLabel: 'Analyze my channel',
    subtitle: 'Paste a channel. See which of its own videos are working, what its own viewers keep '
      + 'asking for and have not gotten, and what they complain about.',
    emptyTitle: 'Start with a channel',
    emptyBody: 'Paste a channel URL, @handle, or channel id. Every result is scoped to that channel’s own '
      + 'uploads and its own viewers’ comments — nothing else.',
  },
};

// Channel mode reports on one creator's own catalogue and own audience, so the
// niche wording is simply wrong there ("what is working in this niche" on a
// report about a single channel). Hints take the mode rather than papering over
// it with subject-neutral phrasing that says less in both cases.
const TABS = [
  {
    key: 'topics',
    label: 'Trending now',
    hint: (ch) => (ch ? 'Which of this channel\u2019s angles are working right now' : 'What is working in this niche right now'),
  },
  {
    key: 'gaps',
    label: 'Content gaps',
    hint: (ch) =>
      ch
        ? 'What this channel\u2019s own viewers keep asking for and have not been given'
        : 'What the audience keeps asking for and nobody has answered well',
  },
  // Gaps are a production decision ("film this"); complaints are an execution
  // note ("stop doing this"). Same comments, different action, so a separate tab.
  {
    key: 'objections',
    label: 'Complaints',
    hint: (ch) => (ch ? 'What this channel\u2019s viewers dislike about its existing videos' : 'What viewers dislike about the videos that already exist'),
  },
  {
    key: 'avoid',
    label: 'Avoid',
    hint: (ch) => (ch ? 'This channel\u2019s angles with plenty of views but an audience that did not care' : 'Angles with plenty of views but an audience that did not care'),
  },
];

const relFrac = (r) => (r ? `${r.relevant}/${r.total}` : '—');

export default function App() {
  const [mode, setMode] = useState(() => modeFromPath());
  const [phase, setPhase] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('topics');
  const [quota, setQuota] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  // A query in the URL prefills the form but deliberately does not auto-run --
  // a run spends real quota, and a link that bills whoever opens it is a trap.
  const [initialQuery] = useState(() => queryFromUrl());
  const lastInput = useRef(null);

  const refreshQuota = useCallback(() => {
    getQuota().then(setQuota).catch(() => {});
  }, []);
  useEffect(refreshQuota, [refreshQuota]);

  /** Opens a persisted report by id. Free -- a disk read of an already-paid run. */
  const openRun = useCallback(async (runId, { push = true } = {}) => {
    setError(null);
    setResult(null);
    setCacheInfo(null);
    setPhase({ phase: 'searching', detail: 'Loading saved report…', progress: 50, elapsedMs: 0 });
    try {
      const { result: saved } = await getRun(runId);
      const savedMode = saved.channelMode ? 'channel' : 'niche';
      setResult(saved);
      setMode(savedMode);
      lastInput.current = saved.query;
      setPhase(null);
      if (push) pushReportUrl(runId, savedMode);
    } catch (err) {
      setError(`Could not load that report: ${err.message}`);
      setPhase(null);
    }
  }, []);

  // A /r/<runId> or /channel/r/<runId> URL, on first load and on back/forward.
  useEffect(() => {
    const fromPath = runIdFromPath();
    if (fromPath) openRun(fromPath, { push: false });
    else setMode(modeFromPath());

    const onPop = () => {
      const id = runIdFromPath();
      if (id) openRun(id, { push: false });
      else {
        setResult(null);
        setError(null);
        setMode(modeFromPath());
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Switches page (nav click). Leaves the other page's in-progress report alone -- it just isn't shown. */
  const switchMode = useCallback((next) => {
    if (next === mode) return;
    setMode(next);
    setResult(null);
    setError(null);
    setPhase(null);
    lastInput.current = null;
    window.history.pushState({}, '', basePathFor(next) || '/');
  }, [mode]);

  const run = useCallback(async (input, { force = false } = {}) => {
    lastInput.current = input;
    pushQueryUrl(input, mode); // so a reload or a shared link reopens the same search
    setError(null);
    setResult(null);
    setCacheInfo(null);
    setPhase({ phase: 'searching', detail: 'Starting…', progress: 0, elapsedMs: 0 });

    try {
      const started = await startAnalysis({ ...input, force });

      if (started.status === 'done') {
        // Served straight from cache -- no quota spent, no waiting.
        setCacheInfo({ cached: true, ageSeconds: started.cacheAgeSeconds });
        setResult(started.result);
        setPhase(null);
        if (started.result?.runId) pushReportUrl(started.result.runId, mode);
        return;
      }

      const final = await pollJob(started.jobId, (job) =>
        setPhase({ phase: job.phase, detail: job.detail, progress: job.progress, elapsedMs: job.elapsedMs })
      );
      setResult(final);
      setPhase(null);
      // Now the report has an id, so give it a URL worth sharing.
      pushReportUrl(final.runId, mode);
      refreshQuota();
    } catch (err) {
      setError(err.message);
      setPhase(null);
      refreshQuota();
    }
  }, [refreshQuota, mode]);

  const busy = Boolean(phase);
  const counts = result
    ? {
        topics: result.topics.length,
        gaps: result.gaps.length,
        objections: result.objections?.length ?? 0,
        avoid: result.avoid.length,
      }
    : {};

  const page = PAGES[mode];

  return (
    <div className="mx-auto min-h-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <nav className="mb-6 inline-flex rounded-lg bg-ink-100 p-0.5 dark:bg-ink-800">
        {Object.entries(PAGES).map(([key, p]) => (
          <a
            key={key}
            href={basePathFor(key) || '/'}
            onClick={(e) => { e.preventDefault(); switchMode(key); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              mode === key
                ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-600 dark:text-white'
                : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
            }`}
          >
            {p.navLabel}
          </a>
        ))}
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl dark:text-white">
              Content Gap Finder <span className="font-normal text-ink-400 dark:text-ink-500">· {page.label}</span>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-ink-500 dark:text-ink-400">
              {page.subtitle}
            </p>
          </div>

          {quota && (
            <div
              className="nums shrink-0 rounded-lg border border-ink-200 px-3 py-2 text-right dark:border-ink-800"
              title={`YouTube Data API units used today, resetting at midnight US Pacific. One fresh analysis costs ${quota.unitsPerAnalysis} units; cached results cost nothing.`}
            >
              <div className="text-xs font-semibold text-ink-700 dark:text-ink-200">
                {quota.analysesLeft} analyses left today
              </div>
              <div className="text-[11px] text-ink-400">
                {quota.used.toLocaleString()} / {quota.budget.toLocaleString()} API units
              </div>
            </div>
          )}
        </div>
      </header>

      <SearchForm onSubmit={run} busy={busy} initial={initialQuery} mode={mode} />

      <div className="mt-4 flex flex-wrap items-start gap-x-6">
        <HistoryPanel onOpen={openRun} currentRunId={result?.runId} mode={mode} />
        <WatchPanel currentQuery={result?.query ?? lastInput.current} onOpenRun={openRun} mode={mode} />
      </div>

      <div className="mt-8">
        {busy && <ProgressRail {...phase} />}

        {error && (
          <div className="rise rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="font-medium text-rose-800 dark:text-rose-300">Analysis failed</p>
            <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">{error}</p>
          </div>
        )}

        {result && (
          <div className="rise space-y-6">
            {/* Channel mode reports on a specific channel, so name it -- otherwise
                the report reads as if it were about a niche. */}
            {result.channel && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                <a
                  href={result.channel.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-semibold text-sky-900 underline-offset-2 hover:underline dark:text-sky-200"
                >
                  {result.channel.title}
                </a>
                <span className="nums text-xs text-sky-800 dark:text-sky-300">
                  {compact(result.channel.subscribers)} subscribers · {compact(result.channel.videoCount)} videos total
                </span>
                <span className="text-xs text-sky-700 dark:text-sky-400">
                  its own uploads and its own viewers' comments
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
              <StatRow stats={result.stats} />
              <div className="flex items-center gap-2">
                {cacheInfo?.cached && (
                  <Badge tone="cool" title="Served from cache, so it cost no API quota.">
                    cached {Math.round(cacheInfo.ageSeconds / 60)}m ago
                  </Badge>
                )}
                {result.runId && (
                  <button
                    onClick={async () => {
                      const url = `${window.location.origin}/r/${result.runId}`;
                      try { await navigator.clipboard.writeText(url); } catch { /* insecure context -- the URL bar still has it */ }
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 1600);
                    }}
                    className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
                    title="Copies a link to this saved report. Opening it costs no quota."
                  >
                    {copiedLink ? 'Link copied' : 'Share'}
                  </button>
                )}
                <ExportMenu result={result} />
                <button
                  onClick={() => run(lastInput.current, { force: true })}
                  className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
                  title="Re-run against live data. Spends YouTube quota."
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* A thin pool is not a warning among warnings -- it undermines every
                number below it, so it gets its own callout with one-click ways
                out rather than a line buried in a list. */}
            {result.thinPool && (
              <ThinPoolNotice
                thinPool={result.thinPool}
                query={result.query}
                busy={busy}
                onRerun={(patch) => run({ ...lastInput.current, ...patch }, { force: true })}
              />
            )}

            {/* The thin-pool warning is already the callout above, verbatim.
                Filtered by identity against the value the server sent, not by
                matching on its wording. */}
            {(() => {
              const warnings = (result.warnings ?? []).filter((w) => w !== result.thinPool?.warning);
              if (!warnings.length) return null;
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-sm text-amber-800 dark:text-amber-300">{w}</p>
                  ))}
                </div>
              );
            })()}

            <div>
              <div className="flex gap-1 border-b border-ink-200 dark:border-ink-800">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    title={t.hint(Boolean(result?.channelMode))}
                    className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      tab === t.key
                        ? 'border-ink-900 text-ink-900 dark:border-white dark:text-white'
                        : 'border-transparent text-ink-400 hover:text-ink-700 dark:hover:text-ink-200'
                    }`}
                  >
                    {t.label}
                    <span className="nums ml-1.5 text-xs text-ink-400">{counts[t.key]}</span>
                  </button>
                ))}
              </div>

              <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
                {TABS.find((t) => t.key === tab).hint(Boolean(result.channelMode))}
              </p>

              <div className="mt-4 space-y-3">
                {tab === 'topics' &&
                  (result.topics.length ? (
                    result.topics.map((t, i) => <TopicCard key={t.label + i} topic={t} rank={i + 1} />)
                  ) : (
                    <EmptyState title="No clear topics">
                      The videos in this window were too scattered to cluster. Try a broader niche or a longer window.
                    </EmptyState>
                  ))}

                {tab === 'gaps' &&
                  (result.gaps.length ? (
                    result.gaps.map((g, i) => <GapCard key={g.question + i} gap={g} rank={i + 1} />)
                  ) : (
                    <EmptyState title="No unmet demand found">
                      Every recurring request in these comments is already answered by a strong video — a sign
                      this niche is well served. Try a narrower niche, a shorter window, or the looser
                      “Uncovered + weak” gap setting.
                    </EmptyState>
                  ))}

                {tab === 'gaps' && result.resolvedGaps?.length > 0 && (
                  <details className="rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
                    <summary className="cursor-pointer list-none text-sm font-medium text-ink-600 dark:text-ink-300">
                      {result.resolvedGaps.length} gap{result.resolvedGaps.length === 1 ? '' : 's'} closed since the last run ▾
                    </summary>
                    <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
                      These were open the last time this subject was analysed and no longer show up.
                      Usually that means somebody made the video — the window has closed.
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {result.resolvedGaps.map((r, i) => (
                        <li key={i} className="text-sm text-ink-600 line-through decoration-ink-400 dark:text-ink-400">
                          {r.question}
                          <span className="nums ml-2 text-xs no-underline">
                            (score was {r.previousDemandScore}, last seen {(r.lastSeen ?? '').slice(0, 10)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {tab === 'objections' &&
                  (result.objections?.length ? (
                    result.objections.map((o, i) => (
                      <ObjectionCard key={o.label + i} objection={o} rank={i + 1} />
                    ))
                  ) : (
                    <EmptyState title="No recurring complaints">
                      No criticism of the existing videos was raised by at least two separate
                      commenters. Either the execution is landing, or the comments here are mostly
                      praise and requests rather than critique.
                    </EmptyState>
                  ))}

                {tab === 'avoid' &&
                  (result.avoid.length ? (
                    result.avoid.map((a, i) => <AvoidCard key={a.label + i} item={a} rank={i + 1} />)
                  ) : (
                    <EmptyState title="Nothing to avoid">
                      No angle in this set showed the high-views / low-engagement pattern. That is a good sign
                      for the niche.
                    </EmptyState>
                  ))}
              </div>
            </div>

            <footer className="nums border-t border-ink-200 pt-4 text-xs text-ink-400 dark:border-ink-800">
              Analyzed {result.stats.videosAnalyzed} videos and {result.stats.commentsAnalyzed} comments ·{' '}
              {result.stats.llmUsage.totalTokens.toLocaleString()} LLM tokens ·{' '}
              {new Date(result.generatedAt).toLocaleString()}
              <br />
              Heat is scored relative to this result set only — it blends view velocity, views per
              subscriber, and engagement rate, so a small channel breaking out outranks a large channel coasting.
              {result.stats.runsCompared > 0 ? (
                <>
                  {' '}Gaps are compared against {result.stats.runsCompared} earlier run
                  {result.stats.runsCompared === 1 ? '' : 's'} of this subject to mark them recurring or new.
                </>
              ) : (
                <>
                  {' '}This is the first stored run of this subject, so no gap can be marked recurring yet —
                  run it again later and repeat demand becomes visible.
                </>
              )}
              {result.runId && result.stats.relevance && (
                <>
                  <br />
                  Niche relevance check — topics {relFrac(result.stats.relevance.topicRelevance)}, gaps{' '}
                  {relFrac(result.stats.relevance.gapRelevance)}, avoid {relFrac(result.stats.relevance.avoidRelevance)} ·{' '}
                  <a
                    href={`/api/logs/${result.runId}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-ink-600 underline-offset-2 hover:underline dark:text-ink-300"
                    title="Opens the full audit log: every video the search returned, every topic/gap the model extracted, and whether it actually mentions the niche."
                  >
                    view full audit log ↗
                  </a>
                </>
              )}
            </footer>
          </div>
        )}

        {!busy && !result && !error && (
          <EmptyState title={page.emptyTitle}>{page.emptyBody}</EmptyState>
        )}
      </div>
    </div>
  );
}
