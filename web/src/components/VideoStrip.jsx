import { useState } from 'react';
import { compact, duration, ago } from '../lib/format.js';
import { Badge } from './Bits.jsx';

/** Compact evidence row: the videos backing a topic or an avoid warning. */
export function VideoStrip({ videos, limit = 4, showEngagement = false }) {
  const shown = videos.slice(0, limit);
  const [broken, setBroken] = useState(() => new Set());

  return (
    <div className="space-y-1.5">
      {shown.map((v) => (
        <a
          key={v.videoId}
          href={v.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
        >
          {v.thumbnail && !broken.has(v.videoId) ? (
            <img
              src={v.thumbnail}
              alt=""
              loading="lazy"
              // YouTube thumbnail URLs 404 for deleted or region-blocked videos.
              onError={() => setBroken((prev) => new Set(prev).add(v.videoId))}
              className="h-10 w-[71px] shrink-0 rounded object-cover ring-1 ring-ink-200 dark:ring-ink-700"
            />
          ) : (
            <div className="grid h-10 w-[71px] shrink-0 place-items-center rounded bg-ink-200 text-[9px] text-ink-400 dark:bg-ink-800">
              no image
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-800 group-hover:text-ink-950 dark:text-ink-200 dark:group-hover:text-white">
              {v.title}
            </p>
            <p className="nums truncate text-xs text-ink-500 dark:text-ink-400">
              {v.channelTitle} · {compact(v.subscribers)} subs · {compact(v.views)} views · {ago(v.ageDays)}
              {showEngagement && ` · ${(v.engagementRate * 100).toFixed(2)}% eng`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {v.isShort && <Badge tone="cool">Short</Badge>}
            <span className="nums hidden text-xs text-ink-400 sm:inline">{duration(v.durationSeconds)}</span>
          </div>
        </a>
      ))}

      {videos.length > limit && (
        <p className="pl-1.5 text-xs text-ink-400">+{videos.length - limit} more</p>
      )}
    </div>
  );
}
