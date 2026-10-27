import { ChevronDown, TriangleAlert } from 'lucide-react';
import { compact } from '../lib/format.js';
import { Card, Rank, HeatBar, Badge, Derived, DERIVED_NOTE } from './Bits.jsx';
import { VideoStrip } from './VideoStrip.jsx';

export function TopicCard({ topic, rank }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <Rank n={rank} />
          <h3 className="min-w-0 text-xl font-semibold leading-tight tracking-[-0.02em] text-fg [text-wrap:balance]">
            {topic.label}
          </h3>
        </div>
        <HeatBar value={topic.heatScore} />
      </div>

      {topic.summary && (
        <p className="mt-3 max-w-[68ch] text-base leading-relaxed text-fg-2">{topic.summary}</p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Badge mono>{topic.videos.length} video{topic.videos.length === 1 ? '' : 's'}</Badge>
        <Badge mono title="Distinct channels succeeding with this angle. More channels = a trend rather than one lucky video.">
          {topic.breadth} channel{topic.breadth === 1 ? '' : 's'}
        </Badge>
        <Badge mono>{compact(topic.totalViews)} total views</Badge>
        {topic.evidence && topic.evidence.level !== 'solid' && (
          <Badge tone={topic.evidence.level === 'thin' ? 'warn' : 'neutral'} title={topic.evidence.why}>
            {topic.evidence.level === 'thin' ? 'single video' : 'one channel'}
          </Badge>
        )}
        <Badge mono title={`Median engagement rate across the topic's videos. ${DERIVED_NOTE}`}>
          {(topic.medianEngagementRate * 100).toFixed(2)}% eng <Derived />
        </Badge>
        {topic.nicheRelevant === false && (
          <Badge
            tone="bad"
            title="No niche keyword appears anywhere in this topic's label, summary, or backing videos -- search.list may have pulled in adjacent content. Check the example videos below before trusting it."
          >
            <TriangleAlert aria-hidden className="h-3.5 w-3.5" /> check relevance
          </Badge>
        )}
        {topic.nicheRelevant !== false && topic.tagSuspect && (
          <Badge
            tone="warn"
            title="Every video backing this topic matched the niche only via tags/hashtags, never in the title prose. Legitimate videos can do this too -- check the example videos below."
          >
            <TriangleAlert aria-hidden className="h-3.5 w-3.5" /> tag-suspect
          </Badge>
        )}
      </div>

      {topic.whyHot && (
        <div className="mt-5 rounded-control bg-surface-2 px-4 py-3.5">
          <p className="text-[13px] font-medium text-fg-3">Why it's hot</p>
          <p className="mt-1 max-w-[68ch] text-[15px] leading-relaxed text-fg">{topic.whyHot}</p>
        </div>
      )}

      {topic.suggestedAngles?.length > 0 && (
        <div className="mt-5">
          <p className="text-[13px] font-medium text-fg-3">Angles to try</p>
          <ul className="mt-2 space-y-2">
            {topic.suggestedAngles.map((a, i) => (
              <li key={i} className="flex max-w-[68ch] gap-3 text-[15px] leading-relaxed text-fg">
                <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-fg-3" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group mt-3">
        <summary className="group flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control text-sm font-medium text-fg-2 transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show {topic.videos.length} example videos</span>
          <span className="hidden group-open:inline">Hide examples</span>
          <ChevronDown aria-hidden className="h-4 w-4 group-open:rotate-180" />
        </summary>
        <div className="mb-1 mt-1">
          <VideoStrip videos={topic.videos} limit={6} />
        </div>
      </details>
    </Card>
  );
}
