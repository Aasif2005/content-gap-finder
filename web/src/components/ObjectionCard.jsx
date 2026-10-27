import { CommentQuote } from './CommentQuote.jsx';
import { Card, Rank, Badge } from './Bits.jsx';

const SEVERITY = { high: 'bad', medium: 'warn', low: 'neutral' };

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
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <Rank n={rank} />
          <h3 className="min-w-0 text-xl font-semibold leading-tight tracking-[-0.02em] text-fg [text-wrap:balance]">
            {objection.label}
          </h3>
        </div>
        <Badge tone={SEVERITY[objection.severity] ?? 'neutral'}>{objection.severity} severity</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge mono title="Distinct comments raising this, across how many different videos">
          {objection.evidenceCount} comments · {objection.distinctVideos} video
          {objection.distinctVideos === 1 ? '' : 's'}
        </Badge>
      </div>

      {objection.detail && (
        <p className="mt-4 max-w-[68ch] text-base leading-relaxed text-fg-2">{objection.detail}</p>
      )}

      <div className="mt-6">
        <h4 className="sr-only">What viewers actually said</h4>
        <ul className="mt-3 space-y-4">
          {objection.evidence.slice(0, 4).map((e, i) => (
            <CommentQuote key={i} comment={e} lead={i === 0} sweep={i === 0} marked={i === 0} />
          ))}
        </ul>
        {objection.evidence.length > 4 && (
          <p className="nums mt-3 text-[13px] text-fg-3">+{objection.evidence.length - 4} more comments</p>
        )}
      </div>

      {objection.fix && (
        <div className="mt-7 border-t border-line pt-5">
          <p className="max-w-[68ch] text-[19px] font-semibold leading-snug tracking-[-0.01em] text-fg">
            <span className="font-normal text-fg-2">Do this instead: </span>{objection.fix}
          </p>
        </div>
      )}
    </Card>
  );
}
