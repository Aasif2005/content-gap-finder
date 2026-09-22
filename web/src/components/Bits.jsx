import { heatColor, compact } from '../lib/format.js';

export function Badge({ children, tone = 'neutral', title }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
    hot: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    warm: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    cool: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    bad: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function HeatBar({ value, label = 'Heat' }) {
  return (
    <div className="flex items-center gap-2" title={`${label} ${value}/100 — relative to this result set`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: heatColor(value) }}
        />
      </div>
      <span className="nums text-xs font-semibold tabular-nums" style={{ color: heatColor(value) }}>
        {value}
      </span>
    </div>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div title={hint}>
      <div className="nums text-sm font-semibold text-ink-900 dark:text-ink-100">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-ink-400">{label}</div>
    </div>
  );
}

export function Rank({ n }) {
  return (
    <span className="nums grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-900 text-xs font-bold text-white dark:bg-ink-100 dark:text-ink-900">
      {n}
    </span>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 ${className}`}>
      {children}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`shimmer relative overflow-hidden rounded bg-ink-200/70 dark:bg-ink-800 ${className}`} />;
}

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 p-8 text-center dark:border-ink-700">
      <p className="font-medium text-ink-700 dark:text-ink-200">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-500 dark:text-ink-400">{children}</p>
    </div>
  );
}

export function StatRow({ stats }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <Stat label="Videos" value={compact(stats.videosAnalyzed)} hint="Videos that passed your filters and were scored" />
      <Stat label="Comments" value={compact(stats.commentsAnalyzed)} hint={`${compact(stats.commentsFetched)} fetched, filtered down to the highest-signal ones`} />
      <Stat label="Topics" value={stats.topicsFound} />
      <Stat label="Gaps" value={stats.gapsFound} />
      <Stat label="Avoid" value={stats.avoidFound} />
    </div>
  );
}
