import { Check } from 'lucide-react';
import { cx } from '../lib/cx.js';
import { Panel } from './ui/Panel.jsx';
import { Skeleton } from './Bits.jsx';

export const PHASES = [
  { key: 'searching', label: 'Finding videos' },
  { key: 'stats', label: 'Pulling stats' },
  { key: 'comments', label: 'Reading comments' },
  { key: 'clustering', label: 'Clustering topics' },
  { key: 'gaps', label: 'Mining gaps' },
];

/**
 * A run takes a minute or two. This shows where it is: the current step in a
 * polite live region (so a screen reader hears each step once, not every
 * second), a bar that only ever moves forward, and quiet placeholders for the
 * cards about to land.
 */
export function ProgressRail({ phase, detail, progress, elapsedMs }) {
  const activeIndex = Math.max(0, PHASES.findIndex((p) => p.key === phase));
  const seconds = Math.round((elapsedMs ?? 0) / 1000);
  const pct = Math.round(Math.max(3, Math.min(100, progress ?? 0)));

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-baseline justify-between gap-4">
          <p aria-live="polite" className="min-w-0 text-base font-medium text-fg">{detail || 'Starting…'}</p>
          <p className="nums shrink-0 font-mono text-[13px] text-fg-3">{seconds}s</p>
        </div>

        <div
          role="progressbar"
          aria-label="Analysis progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-3 h-1.5 overflow-hidden rounded-[3px] bg-line"
        >
          <div
            className="h-full rounded-[3px] bg-ink transition-[width] duration-500 ease-[var(--ease-out)] motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>

        <ol className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
          {PHASES.map((p, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            return (
              <li
                key={p.key}
                aria-current={active ? 'step' : undefined}
                className={cx(
                  'flex items-center gap-2 text-sm',
                  active ? 'font-semibold text-fg' : done ? 'text-fg-2' : 'text-fg-3'
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    'grid h-[18px] w-[18px] place-items-center rounded-full',
                    done ? 'bg-good-bg text-good-fg' : active ? 'bg-ink text-on-ink' : 'border border-line-strong'
                  )}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} /> : active ? <span className="h-1.5 w-1.5 rounded-full bg-on-ink" /> : null}
                </span>
                {p.label}
                <span className="sr-only">{done ? ' (done)' : active ? ' (current)' : ' (waiting)'}</span>
              </li>
            );
          })}
        </ol>
      </Panel>

      {/* Placeholders for the cards that are about to land. */}
      <div className="space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <Panel key={i}>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-3 h-3.5 w-3/4" />
            <Skeleton className="mt-2 h-3.5 w-1/2" />
          </Panel>
        ))}
      </div>
    </div>
  );
}
