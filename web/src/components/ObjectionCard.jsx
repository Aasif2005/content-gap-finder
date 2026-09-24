import { compact } from '../lib/format.js';
import { Card, Rank, Badge } from './Bits.jsx';

const SEVERITY = { high: 'bad', medium: 'warm', low: 'neutral' };

/**
 * A complaint about the videos that already exist, rather than a request for
 * one that doesn't.
 *
 * The distinction is the point: a gap is a production decision ("film this"),
 * an objection is an execution note ("stop doing this"). The second is usually
 * cheaper to act on, and it comes out of the same comments the gap pass already
 * paid to fetch and read.
 */
export function ObjectionCard({ objection, rank }) {
  return (
    <Card className="rise">
      <div className="flex items-start gap-3">
        <Rank n={rank} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold leading-tight text-ink-900 dark:text-ink-50">
              {objection.label}
            </h3>
            <Badge tone={SEVERITY[objection.severity] ?? 'neutral'}>{objection.severity} severity</Badge>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge title="Distinct comments raising this, across how many different videos">
              {objection.evidenceCount} comments · {objection.distinctVideos} video
              {objection.distinctVideos === 1 ? '' : 's'}
            </Badge>
          </div>

          {objection.detail && (
            <p className="mt-2.5 text-sm text-ink-600 dark:text-ink-300">{objection.detail}</p>
          )}

          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              What viewers actually said
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {objection.evidence.slice(0, 4).map((e, i) => (
                <li
                  key={i}
                  className="rounded-lg border-l-2 border-rose-300 bg-rose-50/60 py-1.5 pl-3 pr-2 text-sm text-ink-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-ink-200"
                >
                  <span className="italic">“{e.text}”</span>
                  <span className="nums ml-2 whitespace-nowrap text-xs text-ink-400">♥ {compact(e.likes)}</span>
                </li>
              ))}
            </ul>
            {objection.evidence.length > 4 && (
              <p className="mt-1 pl-1 text-xs text-ink-400">+{objection.evidence.length - 4} more comments</p>
            )}
          </div>

          {objection.fix && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Do this instead
              </p>
              <p className="mt-0.5 text-sm font-medium text-ink-800 dark:text-ink-100">{objection.fix}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
