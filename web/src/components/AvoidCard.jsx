import { ChevronDown, TriangleAlert } from 'lucide-react';
import { Card, Rank, Badge, Derived, DERIVED_NOTE } from './Bits.jsx';
import { VideoStrip } from './VideoStrip.jsx';
import { Disclosure } from './ui/Disclosure.jsx';

const pct = (x) => `${((x ?? 0) * 100).toFixed(2)}%`;

// Reports saved before statsLevel existed carry only flaggedCount, whose old
// "confirmed" meant any one flagged video; re-derive the level from the counts.
function StatsBadge({ item }) {
  const n = item.videos.length;
  const derived = item.flaggedCount > 0 && item.flaggedCount * 2 >= n ? 'confirmed' : item.flaggedCount > 0 ? 'partly' : 'model-only';
  const level = item.statsLevel ?? derived;
  const badges = {
    confirmed: ['bad', `stats confirm (${item.flaggedCount} of ${n})`, `${item.flaggedCount} of these ${n} videos have high view counts but bottom-tier engagement.`],
    partly: ['warn', `stats partly agree (${item.flaggedCount} of ${n})`, `Only ${item.flaggedCount} of these ${n} videos have high views with bottom-tier engagement. A weak signal.`],
    'model-only': ['neutral', 'model signal only', 'Flagged by the model, but our engagement stats do not independently confirm it. Treat as a soft signal.'],
    contradicted: ['good', 'our numbers disagree', `These videos' median engagement (${pct(item.medianEngagementRate)}) is above this run's median (${pct(item.runMedianEngagementRate)}). The audience responds to them; the model's warning is not backed by the data.`],
  };
  const [tone, text, title] = badges[level] ?? badges['model-only'];
  return <Badge tone={tone} title={`${title} ${DERIVED_NOTE}`}>{text} <Derived /></Badge>;
}

export function AvoidCard({ item, rank, inRow = false }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        {!inRow && (
          <div className="flex min-w-0 items-baseline gap-3">
            <Rank n={rank} />
            <h3 className="min-w-0 text-xl font-semibold leading-tight tracking-[-0.02em] text-fg [text-wrap:balance]">
              {item.label}
            </h3>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {/* Separates "the model thinks so" from "our own numbers agree" -- or disagree. */}
          <StatsBadge item={item} />
          {item.nicheRelevant === false && (
            <Badge
              tone="bad"
              title="No niche keyword appears anywhere in this avoid entry's label, reason, or its videos' titles. It may be about something else entirely -- check the videos below before trusting it."
            >
              <TriangleAlert aria-hidden className="h-3.5 w-3.5" /> check relevance
            </Badge>
          )}
        </div>
      </div>

      {!inRow && <p className="mt-3 max-w-[68ch] text-base leading-relaxed text-fg-2">{item.reason}</p>}

      {(item.counterEvidence || inRow) && (
        <div className={`${inRow ? 'mt-4' : 'mt-5'} rounded-control bg-surface-2 px-4 py-3.5`}>
          <p className="text-[13px] font-medium text-fg-3">The numbers</p>
          {item.counterEvidence && <p className="mt-1 max-w-[68ch] text-[15px] leading-relaxed text-fg">{item.counterEvidence}</p>}
          <p className="nums mt-1.5 font-mono text-xs text-fg-2">
            Median engagement across these videos: {pct(item.medianEngagementRate)}
            {item.runMedianEngagementRate != null && <> (this run&rsquo;s median: {pct(item.runMedianEngagementRate)})</>}
            {' '}<Derived />
          </p>
        </div>
      )}

      <Disclosure
        className="mt-3"
        summaryClassName="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control text-sm font-medium text-fg-2 transition-colors hover:text-fg"
        bodyClassName="mb-1 mt-1"
        summary={(
          <>
            <span className="group-open:hidden">See the {item.videos.length} video{item.videos.length === 1 ? '' : 's'} behind this</span>
            <span className="hidden group-open:inline">Hide</span>
            <ChevronDown aria-hidden className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-180" />
          </>
        )}
      >
        <VideoStrip videos={item.videos} limit={6} showEngagement />
      </Disclosure>
    </Card>
  );
}
