import { useEffect, useState } from 'react';
import { getRuns } from '../lib/api.js';
import { Badge } from './Bits.jsx';

const when = (iso) => {
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

/**
 * Past runs, from the persisted report store.
 *
 * Every report used to be unreachable the moment the page reloaded, even though
 * the server had already written a full audit log for each one -- the listing
 * endpoint existed and had no consumer at all. Reopening a past report costs no
 * quota, which makes this the cheapest useful thing in the app.
 */
export function HistoryPanel({ onOpen, currentRunId, mode = 'niche' }) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRuns(null);
    getRuns({ limit: 40, mode })
      .then((d) => setRuns(d.runs))
      .catch((e) => setError(e.message));
  }, [open, currentRunId, mode]);

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
      >
        {open ? 'Hide past runs' : 'Past runs'}
      </button>

      {open && (
        <div className="rise mt-2 overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          {error && <p className="px-4 py-3 text-sm text-rose-700 dark:text-rose-400">{error}</p>}
          {!error && runs === null && <p className="px-4 py-3 text-sm text-ink-400">Loading…</p>}
          {!error && runs?.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-400">
              No past runs stored yet. Every analysis from here on is kept and reopenable for free.
            </p>
          )}

          {runs?.map((r) => (
            <button
              key={r.runId}
              type="button"
              onClick={() => onOpen(r.runId)}
              className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-100 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-800 ${
                r.runId === currentRunId ? 'bg-ink-100 dark:bg-ink-800' : ''
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800 dark:text-ink-100">
                {r.channelMode ? `📺 ${r.channelTitle ?? 'channel'}` : r.niche}
              </span>
              <span className="nums shrink-0 text-xs text-ink-400">
                {r.videosAnalyzed} videos · {r.gapsFound} gaps · {r.topicsFound} topics
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {r.thinPool && <Badge tone="warm" title="Too few videos for the ranking to mean much">thin</Badge>}
                {r.deepScan && <Badge tone="cool">deep</Badge>}
                <span className="nums text-xs text-ink-400">{r.window}</span>
                <span className="nums w-16 text-right text-xs text-ink-400">{when(r.generatedAt)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
