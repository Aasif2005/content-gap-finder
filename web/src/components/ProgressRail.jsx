import { Skeleton } from './Bits.jsx';

const PHASES = [
  { key: 'searching', label: 'Finding videos' },
  { key: 'stats', label: 'Pulling stats' },
  { key: 'comments', label: 'Reading comments' },
  { key: 'clustering', label: 'Clustering topics' },
  { key: 'gaps', label: 'Mining gaps' },
];

export function ProgressRail({ phase, detail, progress, elapsedMs }) {
  const activeIndex = Math.max(0, PHASES.findIndex((p) => p.key === phase));
  const seconds = Math.round((elapsedMs ?? 0) / 1000);

  return (
    <div className="rise space-y-5">
      <div className="rounded-xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{detail || 'Starting…'}</p>
          <p className="nums text-xs text-ink-400">{seconds}s</p>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
          <div
            className="h-full rounded-full bg-ink-900 transition-[width] duration-500 ease-out dark:bg-white"
            style={{ width: `${Math.max(3, progress ?? 0)}%` }}
          />
        </div>

        <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {PHASES.map((p, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            return (
              <li
                key={p.key}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  active ? 'font-semibold text-ink-900 dark:text-white'
                    : done ? 'text-ink-500 dark:text-ink-400'
                    : 'text-ink-300 dark:text-ink-600'
                }`}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${
                    done ? 'bg-emerald-500 text-white'
                      : active ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
                      : 'bg-ink-200 dark:bg-ink-700'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                {p.label}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Skeletons stand in for the cards that are about to land. */}
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex gap-3">
              <Skeleton className="h-6 w-6 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
