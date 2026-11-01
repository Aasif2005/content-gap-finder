import { compact } from '../lib/format.js';
import { cx } from '../lib/cx.js';
import { Derived, DERIVED_NOTE } from './ui/Derived.jsx';

// Badge, Derived and Skeleton live in the UI kit; re-exported so the report
// components keep importing them from here.
export { Badge } from './ui/Badge.jsx';
export { Derived, DERIVED_NOTE } from './ui/Derived.jsx';
export { Skeleton } from './ui/Skeleton.jsx';

/**
 * A relative 0-100 rank within the result set. One neutral ink bar: the number
 * says how much buzz, the colour does not (a traffic-light ramp over-claims, and
 * amber is reserved for viewer evidence).
 */
export function HeatBar({ value, label = 'Buzz' }) {
  return (
    <div className="flex items-center gap-2" title={`${label} ${value}/100, relative to this result set. ${DERIVED_NOTE}`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-focus transition-[width] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none"
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
      <span className="nums font-mono text-[13px] font-medium text-fg">{value}</span>
      <Derived className="text-[13px] text-fg-3" />
    </div>
  );
}

export function Stat({ label, value, hint, sub }) {
  return (
    <div title={hint} className="min-w-0">
      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-fg-3">{label}</div>
      <div className="nums mt-1.5 text-[28px] font-semibold leading-none tracking-[-0.03em] text-fg">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-fg-2">{sub}</div>}
    </div>
  );
}

/** A quiet ordinal that sits before a card's heading. */
export function Rank({ n }) {
  return (
    <span className="nums shrink-0 font-mono text-[13px] font-medium text-fg-3">
      {n}
    </span>
  );
}

/**
 * The one level of container for a report item: a white surface on the cream
 * page, no stroke, a faint ambient shadow. Never nest one in another.
 */
export function Card({ children, className = '' }) {
  return <div className={cx('min-w-0 rounded-panel bg-surface p-5 shadow-card sm:px-8 sm:py-7', className)}>{children}</div>;
}

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-panel border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-[17px] font-semibold tracking-[-0.01em] text-fg">{title}</p>
      <p className="mx-auto mt-2 max-w-[60ch] text-[15px] leading-relaxed text-fg-2">{children}</p>
    </div>
  );
}

export function StatRow({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-5 [&>*]:sm:border-l [&>*]:sm:border-line [&>*]:sm:pl-5 [&>*:first-child]:sm:border-l-0 [&>*:first-child]:sm:pl-0">
      <Stat label="Videos" value={compact(stats.videosAnalyzed)} sub="Scored uploads" hint="Videos that passed your filters and were scored" />
      <Stat label="Comments" value={compact(stats.commentsAnalyzed)} sub="Highest-signal" hint={`${compact(stats.commentsFetched)} fetched, filtered down to the highest-signal ones`} />
      <Stat label="Topics" value={stats.topicsFound} sub="Distinct clusters" />
      <Stat label="Gaps" value={stats.gapsFound} sub="Unmet requests" />
      <Stat label="Avoid" value={stats.avoidFound} sub="Oversaturated" />
    </div>
  );
}
