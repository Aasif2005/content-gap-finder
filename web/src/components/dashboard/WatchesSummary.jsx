import { CircleAlert } from 'lucide-react';
import { Alert, Button, Panel, Skeleton } from '../ui/index.js';
import { Link } from '../../lib/router.jsx';
import { cx } from '../../lib/cx.js';

function WatchRow({ row }) {
  const body = (
    <>
      <span className="block break-words text-base font-semibold leading-snug">{row.label}</span>
      <span
        className={cx('mt-0.5 flex items-center gap-1.5 text-[13px]', row.status === 'failed' ? 'text-bad-fg' : 'text-fg-2')}
        title={row.error ?? undefined}
      >
        {row.status === 'failed' && <CircleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />}
        {row.detail}
      </span>
    </>
  );
  return (
    <li className="border-t border-line-soft first:border-t-0">
      {row.href ? (
        <Link href={row.href} className="-mx-2 block rounded-lg px-2 py-3.5 transition-colors hover:bg-hover">{body}</Link>
      ) : (
        <div className="py-3.5">{body}</div>
      )}
    </li>
  );
}

/**
 * The watches panel. `state` is { status, data, error } from the page's loader;
 * `rows` are toWatchRow results. Managing them (pause, delete, changes since the
 * last run) lives in the Explorer, which is where "Manage" goes.
 */
export function WatchesSummary({ status, rows, max, error, onRetry }) {
  if (status === 'error') {
    return (
      <Alert tone="bad" title="Could not load your watches" action={<Button variant="secondary" onClick={onRetry}>Retry</Button>}>
        {error?.message}
      </Alert>
    );
  }

  return (
    <Panel as="section" aria-labelledby="watches-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="watches-h" className="text-[19px] font-semibold tracking-[-0.01em]">Watches</h2>
        {status === 'ready' && max != null && (
          <span className="nums font-mono text-[13px] text-fg-3">{rows.length} of {max}</span>
        )}
      </div>

      {status === 'loading' && (
        <div role="status" aria-label="Loading your watches" className="mt-4 space-y-4">
          {[0, 1].map((i) => (
            <div key={i}><Skeleton className="h-5 w-44 max-w-full" /><Skeleton className="mt-2 h-3.5 w-56 max-w-full" /></div>
          ))}
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
          A watch re-runs a search on a schedule, so you can see which gaps keep coming back. Run an analysis, then save it as a watch.
        </p>
      )}

      {status === 'ready' && rows.length > 0 && <ul className="mt-3">{rows.map((r) => <WatchRow key={r.id} row={r} />)}</ul>}

      <Button variant="secondary" href="/explore" className="mt-4">Manage</Button>
    </Panel>
  );
}
