import { useEffect, useId, useState } from 'react';
import { ChevronDown, Tv } from 'lucide-react';
import { getRuns } from '../lib/api.js';
import { cx } from '../lib/cx.js';
import { Badge } from './Bits.jsx';
import { Button } from './ui/Button.jsx';
import { Panel } from './ui/Panel.jsx';
import { Skeleton } from './ui/Skeleton.jsx';

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
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    // Switching pages quickly could let the other page's list arrive last.
    let live = true;
    setError(null);
    setRuns(null);
    getRuns({ limit: 40, mode })
      .then((d) => live && setRuns(d.runs))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [open, currentRunId, mode]);

  return (
    <div className={cx('min-w-0', open && 'basis-full')}>
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="-ml-2"
      >
        {open ? 'Hide past runs' : 'Past runs'}
        <ChevronDown aria-hidden className={cx('h-4 w-4', open && 'rotate-180')} />
      </Button>

      {open && (
        <Panel id={panelId} padding="none" className="mt-2 overflow-hidden">
          {error && <p role="alert" className="px-5 py-4 text-[15px] text-bad-fg">{error}</p>}
          {!error && runs === null && (
            <div role="status" aria-label="Loading past runs" className="space-y-3 px-5 py-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {!error && runs?.length === 0 && (
            <p className="px-5 py-4 text-[15px] leading-relaxed text-fg-2">
              No past runs stored yet. Every analysis from here on is kept and reopenable for free.
            </p>
          )}

          {runs?.map((r) => (
            <button
              key={r.runId}
              type="button"
              onClick={() => onOpen(r.runId)}
              aria-current={r.runId === currentRunId ? 'true' : undefined}
              className={cx(
                'flex min-h-14 w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-soft px-5 py-3 text-left transition-colors last:border-0 hover:bg-hover',
                r.runId === currentRunId && 'bg-hover'
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold text-fg">
                {r.channelMode && <Tv aria-hidden className="h-4 w-4 shrink-0 text-fg-3" />}
                <span className="truncate">{r.channelMode ? (r.channelTitle ?? 'channel') : r.niche}</span>
              </span>
              <span className="nums font-mono text-[13px] text-fg-2">
                {r.videosAnalyzed} videos · {r.gapsFound} gaps · {r.topicsFound} topics
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {r.thinPool && <Badge tone="warn" title="Too few videos for the ranking to mean much">thin</Badge>}
                {r.deepScan && <Badge tone="info">deep</Badge>}
                <span className="nums font-mono text-[13px] text-fg-3">{r.window}</span>
                <span className="nums w-16 text-right font-mono text-[13px] text-fg-3">{when(r.generatedAt)}</span>
              </span>
            </button>
          ))}
        </Panel>
      )}
    </div>
  );
}
