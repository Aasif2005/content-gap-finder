import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchForm } from './components/SearchForm.jsx';
import { ProgressRail } from './components/ProgressRail.jsx';
import { TopicCard } from './components/TopicCard.jsx';
import { GapCard } from './components/GapCard.jsx';
import { AvoidCard } from './components/AvoidCard.jsx';
import { EmptyState, StatRow, Badge } from './components/Bits.jsx';
import { startAnalysis, pollJob, getQuota } from './lib/api.js';

const TABS = [
  { key: 'topics', label: 'Trending now', hint: 'What is working in this niche right now' },
  { key: 'gaps', label: 'Content gaps', hint: 'What the audience keeps asking for and nobody has answered well' },
  { key: 'avoid', label: 'Avoid', hint: 'Angles with plenty of views but an audience that did not care' },
];

export default function App() {
  const [phase, setPhase] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('topics');
  const [quota, setQuota] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);
  const lastInput = useRef(null);

  const refreshQuota = useCallback(() => {
    getQuota().then(setQuota).catch(() => {});
  }, []);
  useEffect(refreshQuota, [refreshQuota]);

  const run = useCallback(async (input, { force = false } = {}) => {
    lastInput.current = input;
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
        return;
      }

      const final = await pollJob(started.jobId, (job) =>
        setPhase({ phase: job.phase, detail: job.detail, progress: job.progress, elapsedMs: job.elapsedMs })
      );
      setResult(final);
      setPhase(null);
      refreshQuota();
    } catch (err) {
      setError(err.message);
      setPhase(null);
      refreshQuota();
    }
  }, [refreshQuota]);

  const busy = Boolean(phase);
  const counts = result
    ? { topics: result.topics.length, gaps: result.gaps.length, avoid: result.avoid.length }
    : {};

  return (
    <div className="mx-auto min-h-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl dark:text-white">
              Content Gap Finder
            </h1>
            <p className="mt-1 max-w-xl text-sm text-ink-500 dark:text-ink-400">
              Enter a niche. Get what's trending on YouTube right now, what viewers keep
              asking for that nobody has made, and what to avoid.
            </p>
          </div>

          {quota && (
            <div
              className="nums shrink-0 rounded-lg border border-ink-200 px-3 py-2 text-right dark:border-ink-800"
              title={`YouTube Data API units used today (resets midnight US Pacific). One analysis costs about ${100 + 27} units.`}
            >
              <div className="text-xs font-semibold text-ink-700 dark:text-ink-200">
                {quota.searchesLeft} analyses left today
              </div>
              <div className="text-[11px] text-ink-400">
                {quota.used.toLocaleString()} / {quota.budget.toLocaleString()} API units
              </div>
            </div>
          )}
        </div>
      </header>

      <SearchForm onSubmit={run} busy={busy} />

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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
              <StatRow stats={result.stats} />
              <div className="flex items-center gap-2">
                {cacheInfo?.cached && (
                  <Badge tone="cool" title="Served from cache, so it cost no API quota.">
                    cached {Math.round(cacheInfo.ageSeconds / 60)}m ago
                  </Badge>
                )}
                <button
                  onClick={() => run(lastInput.current, { force: true })}
                  className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
                  title="Re-run against live data. Spends YouTube quota."
                >
                  Refresh
                </button>
              </div>
            </div>

            {result.warnings?.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-amber-800 dark:text-amber-300">{w}</p>
                ))}
              </div>
            )}

            <div>
              <div className="flex gap-1 border-b border-ink-200 dark:border-ink-800">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    title={t.hint}
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
                {TABS.find((t) => t.key === tab).hint}
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
            </footer>
          </div>
        )}

        {!busy && !result && !error && (
          <EmptyState title="Start with a niche">
            Try something specific — “cast iron restoration” beats “cooking”. Narrow niches produce
            sharper gaps because the comments are all about the same subject.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
