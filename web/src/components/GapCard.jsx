import { compact } from '../lib/format.js';
import { Card, Rank, Badge } from './Bits.jsx';
import { VideoStrip } from './VideoStrip.jsx';

const STRENGTH = { high: 'hot', medium: 'warm', low: 'neutral' };

export function GapCard({ gap, rank }) {
  return (
    <Card className="rise">
      <div className="flex items-start gap-3">
        <Rank n={rank} />

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-ink-900 dark:text-ink-50">
            {gap.question}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={STRENGTH[gap.demandStrength] ?? 'neutral'}>
              {gap.demandStrength} demand
            </Badge>
            <Badge
              tone={gap.coverage === 'none' ? 'good' : 'warm'}
              title={
                gap.coverage === 'none'
                  ? 'No video in this result set addresses it at all.'
                  : 'Only mid or low performing videos address it, so the demand is not being met well.'
              }
            >
              {gap.coverage === 'none' ? 'nobody covers this' : 'weakly covered'}
            </Badge>
            <Badge title="Distinct comments citing this, across how many different videos">
              {gap.evidenceCount} comments · {gap.distinctVideos} video{gap.distinctVideos === 1 ? '' : 's'}
            </Badge>
            <Badge title="Demand score: comment count, spread across videos, and how many likes those comments got">
              score {gap.demandScore}
            </Badge>
            {gap.nicheRelevant === false && (
              <Badge
                tone="bad"
                title="No niche keyword appears anywhere in this gap's question or evidence comments. Its source video may be about something else entirely -- check the evidence below before trusting it."
              >
                ⚠ check relevance
              </Badge>
            )}
            {/* Recurrence is the strongest single signal on this card. A gap
                asked for four runs running is proven, durable demand; one that
                surfaced once may just be which videos got sampled this time. */}
            {gap.recurrence?.status === 'recurring' && (
              <Badge
                tone="good"
                title={`Asked for in ${gap.recurrence.timesSeen} separate runs of this subject, first on ${(gap.recurrence.firstSeen ?? '').slice(0, 10)}. Demand voiced repeatedly over time is far more reliable than demand seen once.`}
              >
                ↻ recurring · {gap.recurrence.timesSeen} runs
              </Badge>
            )}
            {gap.recurrence?.status === 'new' && (
              <Badge
                tone="cool"
                title={`Did not appear in the ${gap.recurrence.runsCompared} earlier run(s) of this subject. Either genuinely emerging demand, or a one-off from this run's comment sample -- re-run later to tell which.`}
              >
                new
              </Badge>
            )}
            {gap.recurrence?.trend === 'rising' && (
              <Badge
                tone="hot"
                title={`Demand score ${gap.demandScore} now, against ${gap.recurrence.previousDemandScore} last run. More people are asking than before.`}
              >
                ↑ rising
              </Badge>
            )}
            {gap.recurrence?.trend === 'falling' && (
              <Badge
                tone="neutral"
                title={`Demand score ${gap.demandScore} now, against ${gap.recurrence.previousDemandScore} last run. Fewer people are asking than before.`}
              >
                ↓ cooling
              </Badge>
            )}
          </div>

          {gap.explanation && (
            <p className="mt-2.5 text-sm text-ink-600 dark:text-ink-300">{gap.explanation}</p>
          )}

          {/* The evidence is the product. A creator should be able to check every
              claim against the actual comments rather than trusting the model. */}
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              What viewers actually said
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {gap.evidence.slice(0, 4).map((e, i) => (
                <li
                  key={i}
                  className="rounded-lg border-l-2 border-ink-300 bg-ink-50 py-1.5 pl-3 pr-2 text-sm text-ink-700 dark:border-ink-600 dark:bg-ink-800/60 dark:text-ink-200"
                >
                  <span className="italic">“{e.text}”</span>
                  <span className="nums ml-2 whitespace-nowrap text-xs text-ink-400">
                    ♥ {compact(e.likes)}
                  </span>
                </li>
              ))}
            </ul>
            {gap.evidence.length > 4 && (
              <p className="mt-1 pl-1 text-xs text-ink-400">+{gap.evidence.length - 4} more comments</p>
            )}
          </div>

          {gap.suggestedTitle && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Film this
              </p>
              <p className="mt-0.5 text-sm font-medium text-ink-800 dark:text-ink-100">
                {gap.suggestedTitle}
              </p>
              {gap.suggestedFormat && (
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                  Suggested format: {gap.suggestedFormat}
                </p>
              )}
            </div>
          )}

          {gap.coveringVideos?.length > 0 && (
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-xs font-medium text-ink-500 hover:text-ink-800 dark:hover:text-ink-200">
                <span className="group-open:hidden">
                  Partly covered by {gap.coveringVideos.length} video{gap.coveringVideos.length === 1 ? '' : 's'} ▾
                </span>
                <span className="hidden group-open:inline">Hide ▴</span>
              </summary>
              <div className="mt-2">
                <VideoStrip videos={gap.coveringVideos} limit={4} />
              </div>
            </details>
          )}
        </div>
      </div>
    </Card>
  );
}
