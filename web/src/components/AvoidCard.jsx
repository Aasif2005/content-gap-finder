import { Card, Rank, Badge } from './Bits.jsx';
import { VideoStrip } from './VideoStrip.jsx';

export function AvoidCard({ item, rank }) {
  return (
    <Card className="rise">
      <div className="flex items-start gap-3">
        <Rank n={rank} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold leading-tight text-ink-900 dark:text-ink-50">
              {item.label}
            </h3>
            {/* Separates "the model thinks so" from "our own numbers agree". */}
            <Badge
              tone={item.confirmedByStats ? 'bad' : 'neutral'}
              title={
                item.confirmedByStats
                  ? `${item.flaggedCount} of these videos have high view counts but bottom-tier engagement.`
                  : 'Flagged by the model, but our engagement stats do not independently confirm it. Treat as a soft signal.'
              }
            >
              {item.confirmedByStats ? `stats confirm (${item.flaggedCount})` : 'model signal only'}
            </Badge>
          </div>

          <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">{item.reason}</p>

          {item.counterEvidence && (
            <div className="mt-3 rounded-lg border-l-2 border-rose-400 bg-rose-50/60 py-2 pl-3 pr-2 dark:border-rose-500/60 dark:bg-rose-500/10">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                The numbers
              </p>
              <p className="mt-0.5 text-sm text-ink-700 dark:text-ink-200">{item.counterEvidence}</p>
              <p className="nums mt-1 text-xs text-ink-500 dark:text-ink-400">
                Median engagement across these videos: {(item.medianEngagementRate * 100).toFixed(2)}%
              </p>
            </div>
          )}

          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-xs font-medium text-ink-500 hover:text-ink-800 dark:hover:text-ink-200">
              <span className="group-open:hidden">See the {item.videos.length} video{item.videos.length === 1 ? '' : 's'} behind this ▾</span>
              <span className="hidden group-open:inline">Hide ▴</span>
            </summary>
            <div className="mt-2">
              <VideoStrip videos={item.videos} limit={6} showEngagement />
            </div>
          </details>
        </div>
      </div>
    </Card>
  );
}
