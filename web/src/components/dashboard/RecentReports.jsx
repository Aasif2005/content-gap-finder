import { ArrowUpRight, Trash2 } from 'lucide-react';
import { useRemoveReport } from '../../lib/removeReport.jsx';
import { Link } from '../../lib/router.jsx';
import { Badge, Panel, Skeleton } from '../ui/index.js';

/** The user's latest reports, newest first. `rows` come from toRunRow (lib/runRows.js). */
export function RecentReports({ rows }) {
  const requestRemove = useRemoveReport();
  return (
    <section aria-labelledby="recent-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-h" className="text-[26px] font-semibold tracking-[-0.02em]">Recent reports</h2>
        <p className="text-sm text-fg-3">Kept for 30 days</p>
      </div>
      <ul className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <li key={r.id} className="relative">
            <Link
              href={r.href}
              className="group flex h-full min-h-[168px] flex-col justify-between rounded-panel border border-line bg-surface p-6 shadow-panel transition-colors hover:border-line-strong"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-3">{r.meta.slice(0, 2).join(' · ')}</span>
                <ArrowUpRight aria-hidden className="h-4 w-4 shrink-0 text-fg-3 transition-colors group-hover:text-fg" />
              </span>
              <span className="mt-4 block">
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <span className="break-words text-[22px] font-semibold leading-tight tracking-[-0.015em]">{r.title}</span>
                  {r.thin && <Badge tone="warn" title="Too few videos for the ranking to mean much">thin</Badge>}
                </span>
                <span className="nums mt-3 block border-t border-line-soft pt-3 font-mono text-[13px] text-fg-2">{r.counts}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => requestRemove({ runId: r.id, title: r.title })}
              aria-label={`Remove ${r.title} from your reports`}
              title="Remove from your reports"
              className="absolute right-12 top-[14px] grid h-10 w-10 place-items-center rounded-full text-fg-3 transition-colors hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Rows shaped like the real ones, while the list loads. */
export function RecentReportsSkeleton() {
  return (
    <Panel padding="none" role="status" aria-label="Loading your reports">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <Skeleton className="h-6 w-40" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-[18px] sm:px-6">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-44 max-w-full" />
            <Skeleton className="mt-2.5 h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-4 w-28 shrink-0" />
        </div>
      ))}
      <div className="px-5 py-4 sm:px-6"><Skeleton className="h-3.5 w-80 max-w-full" /></div>
    </Panel>
  );
}
