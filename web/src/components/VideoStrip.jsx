import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { compact, duration, ago } from '../lib/format.js';
import { Badge, Derived, DERIVED_NOTE } from './Bits.jsx';

/** Compact evidence rows: the videos backing a topic or an avoid warning. */
export function VideoStrip({ videos, limit = 4, showEngagement = false }) {
  const shown = videos.slice(0, limit);
  const [broken, setBroken] = useState(() => new Set());

  return (
    <div className="-mx-2 space-y-0.5">
      {shown.map((v) => (
        <a
          key={v.videoId}
          href={v.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control p-2 transition-colors hover:bg-hover"
        >
          {v.thumbnail && !broken.has(v.videoId) ? (
            <img
              src={v.thumbnail}
              alt=""
              loading="lazy"
              // YouTube thumbnail URLs 404 for deleted or region-blocked videos.
              onError={() => setBroken((prev) => new Set(prev).add(v.videoId))}
              className="h-10 w-[71px] shrink-0 rounded-md object-cover ring-1 ring-line"
            />
          ) : (
            <div className="grid h-10 w-[71px] shrink-0 place-items-center rounded-md bg-surface-2 text-[11px] text-fg-3">
              no image
            </div>
          )}

          <div className="min-w-0 flex-1 basis-48">
            <p className="truncate text-[15px] font-medium text-fg">{v.title}</p>
            <p className="nums truncate text-[13px] text-fg-3">
              {v.channelTitle} · {compact(v.subscribers)} subs · {compact(v.views)} views · {ago(v.ageDays)}
              {showEngagement && <> · {(v.engagementRate * 100).toFixed(2)}% eng <Derived /></>}
            </p>
          </div>

          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5 sm:shrink-0">
            {v.tagOnlyMatch && (
              <Badge
                tone="warn"
                title="The niche appears only in this video's tags/hashtags, never in its title prose. Not necessarily wrong -- just worth a second look."
              >
                <TriangleAlert aria-hidden className="h-3.5 w-3.5" /> tag-only
              </Badge>
            )}
            {v.outlier?.multiple >= 2 && (
              <Badge
                tone="good"
                mono
                title={`${v.views.toLocaleString()} views vs. a median of ${v.outlier.median.toLocaleString()} across this channel's last ${v.outlier.baseline} ${v.isShort ? 'Shorts' : 'long videos'}. Ranks the video, not the channel's size. ${DERIVED_NOTE}`}
              >
                {v.outlier.multiple >= 100 ? '100×+' : `${v.outlier.multiple}×`} channel median <Derived />
              </Badge>
            )}
            {v.formula && (
              <Badge title="Title wording matches this hook formula. A judgement about the words, not a claim about why it worked.">
                {v.formula}
              </Badge>
            )}
            {v.isShort && <Badge tone="info">Short</Badge>}
            <span className="nums hidden font-mono text-xs text-fg-3 sm:inline">{duration(v.durationSeconds)}</span>
          </div>
        </a>
      ))}

      {videos.length > limit && (
        <p className="px-2 pt-1 text-[13px] text-fg-3">+{videos.length - limit} more</p>
      )}
    </div>
  );
}
