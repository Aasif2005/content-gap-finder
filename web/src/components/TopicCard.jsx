import { compact } from '../lib/format.js';
import { Card, Rank, HeatBar, Badge } from './Bits.jsx';
import { VideoStrip } from './VideoStrip.jsx';

export function TopicCard({ topic, rank }) {
  return (
    <Card className="rise" >
      <div className="flex items-start gap-3">
        <Rank n={rank} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold leading-tight text-ink-900 dark:text-ink-50">
              {topic.label}
            </h3>
            <HeatBar value={topic.heatScore} />
          </div>

          {topic.summary && (
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{topic.summary}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge>{topic.videos.length} video{topic.videos.length === 1 ? '' : 's'}</Badge>
            <Badge title="Distinct channels succeeding with this angle. More channels = a trend rather than one lucky video.">
              {topic.breadth} channel{topic.breadth === 1 ? '' : 's'}
            </Badge>
            <Badge>{compact(topic.totalViews)} total views</Badge>
            <Badge title="Median engagement rate across the topic's videos">
              {(topic.medianEngagementRate * 100).toFixed(2)}% eng
            </Badge>
            {topic.nicheRelevant === false && (
              <Badge
                tone="bad"
                title="No niche keyword appears anywhere in this topic's label, summary, or backing videos -- search.list may have pulled in adjacent content. Check the example videos below before trusting it."
              >
                ⚠ check relevance
              </Badge>
            )}
            {topic.nicheRelevant !== false && topic.tagSuspect && (
              <Badge
                tone="warm"
                title="Every video backing this topic matched the niche only via tags/hashtags, never in the title prose. Legitimate videos can do this too -- check the example videos below."
              >
                ⚠ tag-suspect
              </Badge>
            )}
          </div>

          {topic.whyHot && (
            <div className="mt-3 rounded-lg border-l-2 border-amber-400 bg-amber-50/60 py-2 pl-3 pr-2 dark:border-amber-500/60 dark:bg-amber-500/10">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Why it's hot
              </p>
              <p className="mt-0.5 text-sm text-ink-700 dark:text-ink-200">{topic.whyHot}</p>
            </div>
          )}

          {topic.suggestedAngles?.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Angles to try</p>
              <ul className="mt-1 space-y-1">
                {topic.suggestedAngles.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-700 dark:text-ink-200">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-xs font-medium text-ink-500 hover:text-ink-800 dark:hover:text-ink-200">
              <span className="group-open:hidden">Show {topic.videos.length} example videos ▾</span>
              <span className="hidden group-open:inline">Hide examples ▴</span>
            </summary>
            <div className="mt-2">
              <VideoStrip videos={topic.videos} limit={6} />
            </div>
          </details>
        </div>
      </div>
    </Card>
  );
}
