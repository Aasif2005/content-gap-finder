import { ArrowDown, ArrowUp, ChevronDown, Repeat, Sparkles, TriangleAlert } from 'lucide-react';
import { CommentQuote } from './CommentQuote.jsx';
import { Card, Rank, Badge, Derived, DERIVED_NOTE } from './Bits.jsx';
import { VideoStrip } from './VideoStrip.jsx';
import { BriefPanel } from './BriefPanel.jsx';

const SUMMARY =
  'group flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control text-sm font-medium text-fg-2 transition-colors hover:text-fg [&::-webkit-details-marker]:hidden';

/**
 * One content gap: the question viewers keep asking, the comments that prove
 * it, what to film, and (when `canMake`) the Make it brief. Logged-out visitors
 * pass `canMake={false}`: they can read everything and a saved brief, but
 * nothing here can start a draft.
 */
export function GapCard({ gap, rank, runId, index, canMake = true }) {
  return (
    <Card>
      <div className="flex items-baseline gap-3">
        <Rank n={rank} />
        <h3 className="min-w-0 text-xl font-semibold leading-tight tracking-[-0.02em] text-fg [text-wrap:balance] sm:text-2xl">
          {gap.question}
        </h3>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Badge
          tone={gap.coverage === 'none' ? 'good' : 'warn'}
          title={
            gap.coverage === 'none'
              ? 'No video in this result set addresses it at all.'
              : 'Only mid or low performing videos address it, so the demand is not being met well.'
          }
        >
          {gap.coverage === 'none' ? 'nobody covers this' : 'weakly covered'}
        </Badge>
        {gap.nicheRelevant === false && (
          <Badge
            tone="bad"
            title="No niche keyword appears in this gap's question or evidence comments, and the comments were not all written under videos about the niche. Check the evidence below before trusting it."
          >
            <TriangleAlert aria-hidden className="h-3.5 w-3.5" /> check relevance
          </Badge>
        )}
        {gap.relevance?.verdict === 'niche-videos' && (
          <Badge title="The question does not name the niche, but every comment behind it was written under a video about the niche: this audience asked it. It may be adjacent to the niche rather than inside it.">
            asked under niche videos
          </Badge>
        )}
        {/* Recurrence is the strongest single signal on this card. A gap
            asked for four runs running is proven, durable demand; one that
            surfaced once may just be which videos got sampled this time. */}
        {gap.recurrence?.status === 'recurring' && (
          <Badge
            tone="info"
            title={`Asked for in ${gap.recurrence.timesSeen} separate runs of this subject, first on ${(gap.recurrence.firstSeen ?? '').slice(0, 10)}. Demand voiced repeatedly over time is far more reliable than demand seen once.`}
          >
            <Repeat aria-hidden className="h-3.5 w-3.5" /> recurring · <span className="nums font-mono text-xs">{gap.recurrence.timesSeen} runs</span>
          </Badge>
        )}
        {gap.recurrence?.status === 'new' && (
          <Badge
            tone="good"
            title={`Did not appear in the ${gap.recurrence.runsCompared} earlier run(s) of this subject. Either genuinely emerging demand, or a one-off from this run's comment sample -- re-run later to tell which.`}
          >
            <Sparkles aria-hidden className="h-3.5 w-3.5" /> new
          </Badge>
        )}
        {gap.recurrence?.trend === 'rising' && (
          <Badge
            tone="info"
            title={`Demand score ${gap.demandScore} now, against ${gap.recurrence.previousDemandScore} last run. More people are asking than before.`}
          >
            <ArrowUp aria-hidden className="h-3.5 w-3.5" /> rising
          </Badge>
        )}
        {gap.recurrence?.trend === 'falling' && (
          <Badge
            tone="neutral"
            title={`Demand score ${gap.demandScore} now, against ${gap.recurrence.previousDemandScore} last run. Fewer people are asking than before.`}
          >
            <ArrowDown aria-hidden className="h-3.5 w-3.5" /> cooling
          </Badge>
        )}
      </div>

      <p className="nums mt-2.5 font-mono text-[13px] text-fg-3">
        <span title="How strongly viewers are asking, from comment count, spread across videos and likes">{gap.demandStrength} demand</span>
        {' · '}
        <span title="Distinct comments citing this, across how many different videos">
          {gap.evidenceCount} comments · {gap.distinctVideos} video{gap.distinctVideos === 1 ? '' : 's'}
        </span>
        {' · '}
        <span title={`Demand score: comment count, spread across videos, and how many likes those comments got. ${DERIVED_NOTE}`}>
          demand score {gap.demandScore} <Derived />
        </span>
      </p>

      {gap.explanation && (
        <p className="mt-4 max-w-[68ch] text-base leading-relaxed text-fg-2">{gap.explanation}</p>
      )}

      {/* The evidence is the product. A creator should be able to check every
          claim against the actual comments rather than trusting the model. */}
      <div className="mt-6">
        <h4 className="sr-only">What viewers actually said</h4>
        <ul className="mt-3 space-y-4">
          {gap.evidence.slice(0, 4).map((e, i) => (
            <CommentQuote key={i} comment={e} lead={i === 0} sweep={i === 0} marked={i === 0} />
          ))}
        </ul>
        {gap.evidence.length > 4 && (
          <p className="nums mt-3 text-[13px] text-fg-3">+{gap.evidence.length - 4} more comments</p>
        )}
      </div>

      {gap.suggestedTitle && (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-x-8 gap-y-5 border-t border-line pt-5">
          <div className="min-w-0 flex-1 basis-72">
            <p className="text-[19px] font-semibold leading-snug tracking-[-0.01em] text-fg">
              <span className="sr-only">Film this: </span>{gap.suggestedTitle}
            </p>
            {(gap.suggestedFormat || gap.thumbnailText) && (
              <p className="mt-1.5 text-sm text-fg-2">
                {gap.suggestedFormat && <>Suggested format: {gap.suggestedFormat}</>}
                {gap.suggestedFormat && gap.thumbnailText && ' · '}
                {gap.thumbnailText && <>Thumbnail text: <span className="font-semibold text-fg">{gap.thumbnailText}</span></>}
              </p>
            )}
            {gap.titleLint && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Badge
                  mono
                  tone={gap.titleLint.score >= 70 ? 'good' : gap.titleLint.score >= 50 ? 'warn' : 'bad'}
                  title={`Deterministic title lint (length, shouting, vague words, figures, thumbnail overlap). A checklist, not a click prediction. ${DERIVED_NOTE}`}
                >
                  title check {gap.titleLint.score}/100 <Derived />
                </Badge>
                {gap.titleLint.issues.map(([kind, msg]) => (
                  <Badge key={kind} tone={kind === 'ungrounded-number' ? 'bad' : kind === 'no-number' ? 'neutral' : 'warn'} title={msg}>
                    {kind}
                  </Badge>
                ))}
              </div>
            )}
            {gap.titleOptions?.length > 1 && (
              <details className="group mt-1">
                <summary className={SUMMARY}>
                  {gap.titleOptions.length - 1} other title{gap.titleOptions.length === 2 ? '' : 's'}
                  <ChevronDown aria-hidden className="h-4 w-4 group-open:rotate-180" />
                </summary>
                <ul className="mb-1 space-y-1.5">
                  {gap.titleOptions.slice(1).map((o) => (
                    <li key={o.title} className="text-sm text-fg-2">
                      {o.title} <span className="nums font-mono text-xs text-fg-3">· {o.score}/100</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* Idle, the brief's controls sit at the right of this row; once a
              brief exists it takes the full row below. */}
          <BriefPanel runId={runId} index={index} sensitive={gap.sensitive} gap={gap} canMake={canMake} />
        </div>
      )}

      {gap.coveringVideos?.length > 0 && (
        <details className="group mt-3">
          <summary className={SUMMARY}>
            <span className="group-open:hidden">
              Partly covered by {gap.coveringVideos.length} video{gap.coveringVideos.length === 1 ? '' : 's'}
            </span>
            <span className="hidden group-open:inline">Hide</span>
            <ChevronDown aria-hidden className="h-4 w-4 group-open:rotate-180" />
          </summary>
          <div className="mb-1 mt-1">
            <VideoStrip videos={gap.coveringVideos} limit={4} />
          </div>
        </details>
      )}
    </Card>
  );
}
