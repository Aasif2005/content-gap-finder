import { ArrowDown, ArrowUp, ChevronDown, Repeat, Sparkles, TriangleAlert } from 'lucide-react';
import { AskedUnder, CommentQuote } from './CommentQuote.jsx';
import { Card, Rank, Badge, Derived, DERIVED_NOTE } from './Bits.jsx';
import { VideoStrip } from './VideoStrip.jsx';
import { BriefPanel } from './BriefPanel.jsx';
import { cx } from '../lib/cx.js';
import { Disclosure } from './ui/Disclosure.jsx';

const SUMMARY =
  'flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control text-sm font-medium text-fg-2 transition-colors hover:text-fg';

/**
 * One content gap: the question viewers keep asking, the comments that prove
 * it, what to film, and (when `canMake`) the Make it brief. Logged-out visitors
 * pass `canMake={false}`: they can read everything and a saved brief, but
 * nothing here can start a draft.
 *
 * `summary` is the headline gap: the question, the numbers, the explanation
 * and the Make it row stay on show; the comments and the rest sit in one
 * "See the evidence" dropdown.
 */
export function GapCard({ gap, rank, runId, index, canMake = true, inRow = false, summary = false }) {
  // Badges the row does not already carry. Rank, question, coverage and the
  // numbers live on the row itself when this card is opened from one.
  const signals = (
    <>
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
    </>
  );
  const hasSignals =
    gap.nicheRelevant === false ||
    gap.relevance?.verdict === 'niche-videos' ||
    Boolean(gap.recurrence?.status === 'recurring' || gap.recurrence?.status === 'new' || gap.recurrence?.trend);

  const quotes = (
    <div className={summary ? undefined : 'mt-6'}>
      <h4 className="sr-only">What viewers actually said</h4>
      <ul className={cx('space-y-3', !summary && 'mt-3')}>
        {gap.evidence.slice(0, 4).map((e, i) => (
          <CommentQuote key={i} comment={e} lead={i === 0} block={i < 2} marked={i === 0} />
        ))}
      </ul>
      {gap.evidence.length > 4 && (
        <p className="nums mt-3 text-[13px] text-fg-3">+{gap.evidence.length - 4} more comments</p>
      )}
      <AskedUnder evidence={gap.evidence} />
    </div>
  );

  const lint = gap.titleLint && (
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
  );

  const titleOptions = gap.titleOptions?.length > 1 && (
    <Disclosure
      className="mt-1"
      summaryClassName={SUMMARY}
      summary={(
        <>
          {gap.titleOptions.length - 1} other title{gap.titleOptions.length === 2 ? '' : 's'}
          <ChevronDown aria-hidden className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-180" />
        </>
      )}
    >
      <ul className="mb-1 space-y-1.5">
        {gap.titleOptions.slice(1).map((o) => (
          <li key={o.title} className="text-sm text-fg-2">
            {o.title} <span className="nums font-mono text-xs text-fg-3">· {o.score}/100</span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );

  const covering = gap.coveringVideos?.length > 0 && (
    <Disclosure
      className="mt-3"
      summaryClassName={SUMMARY}
      bodyClassName="mb-1 mt-1"
      summary={(
        <>
          <span className="group-open:hidden">
            Partly covered by {gap.coveringVideos.length} video{gap.coveringVideos.length === 1 ? '' : 's'}
          </span>
          <span className="hidden group-open:inline">Hide</span>
          <ChevronDown aria-hidden className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-180" />
        </>
      )}
    >
      <VideoStrip videos={gap.coveringVideos} limit={4} />
    </Disclosure>
  );

  return (
    <Card>
      {!inRow && (
        <>
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
            {!summary && signals}
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
        </>
      )}

      {gap.explanation && (
        <p className={cx('max-w-[68ch] text-base leading-relaxed text-fg-2', !inRow && 'mt-4')}>{gap.explanation}</p>
      )}
      {inRow && hasSignals && <div className="mt-3 flex flex-wrap items-center gap-2">{signals}</div>}

      {/* The evidence is the product. A creator should be able to check every
          claim against the actual comments rather than trusting the model. */}
      {!summary && quotes}

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
            {!summary && lint}
            {!summary && titleOptions}
          </div>

          {/* Idle, the brief's controls sit at the right of this row; once a
              brief exists it takes the full row below. */}
          <BriefPanel runId={runId} index={index} sensitive={gap.sensitive} gap={gap} canMake={canMake} />
        </div>
      )}

      {summary ? (
        <Disclosure
          className="mt-5 border-t border-line pt-1"
          summaryClassName={cx(SUMMARY, 'justify-between')}
          bodyClassName="space-y-5 pb-1 pt-3"
          summary={(
            <>
              <span>
                See the evidence
                <span className="nums font-mono text-xs font-normal text-fg-3"> · {gap.evidenceCount} comments</span>
              </span>
              <ChevronDown aria-hidden className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-180" />
            </>
          )}
        >
          {hasSignals && <div className="flex flex-wrap items-center gap-2">{signals}</div>}
          {quotes}
          {(lint || titleOptions) && (
            <div>
              {lint}
              {titleOptions}
            </div>
          )}
          {covering}
        </Disclosure>
      ) : (
        covering
      )}
    </Card>
  );
}
