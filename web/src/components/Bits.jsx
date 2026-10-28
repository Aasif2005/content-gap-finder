import { compact } from '../lib/format.js';
import { cx } from '../lib/cx.js';
import { Derived, DERIVED_NOTE } from './ui/Derived.jsx';
import { Panel } from './ui/Panel.jsx';

// Badge, Derived and Skeleton live in the UI kit; re-exported so the report
// components keep importing them from here.
export { Badge } from './ui/Badge.jsx';
export { Derived, DERIVED_NOTE } from './ui/Derived.jsx';
export { Skeleton } from './ui/Skeleton.jsx';

/**
 * A relative 0-100 rank within the result set. One neutral ink bar: the number
 * says how hot, the colour does not (a traffic-light ramp over-claims, and
 * amber is reserved for viewer evidence).
 */
export function HeatBar({ value, label = 'Heat' }) {
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

export function Stat({ label, value, hint }) {
  return (
    <div title={hint}>
      <div className="nums font-mono text-base font-medium text-fg">{value}</div>
      <div className="text-[13px] text-fg-3">{label}</div>
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

/** The one level of container for a report item. Never nest one in another. */
export function Card({ children, className = '' }) {
  return <Panel padding="none" className={cx('p-5 sm:px-8 sm:py-7', className)}>{children}</Panel>;
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
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      <Stat label="Videos" value={compact(stats.videosAnalyzed)} hint="Videos that passed your filters and were scored" />
      <Stat label="Comments" value={compact(stats.commentsAnalyzed)} hint={`${compact(stats.commentsFetched)} fetched, filtered down to the highest-signal ones`} />
      <Stat label="Topics" value={stats.topicsFound} />
      <Stat label="Gaps" value={stats.gapsFound} />
      <Stat label="Avoid" value={stats.avoidFound} />
    </div>
  );
}
