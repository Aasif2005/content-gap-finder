import { ChevronRight } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import { Badge, Panel, Skeleton } from '../ui/index.js';

/** The user's latest reports, newest first. `rows` come from toRunRow (lib/runRows.js). */
export function RecentReports({ rows }) {
  return (
    <Panel padding="none">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-6">
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Recent reports</h2>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="border-b border-line-soft">
            <Link
              href={r.href}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-[18px] transition-colors hover:bg-hover sm:px-6"
            >
              <span className="min-w-0 flex-[1_1_220px]">
                <span className="block break-words text-[17px] font-semibold leading-snug">{r.title}</span>
                <span className="mt-1 block text-sm text-fg-2">{r.meta.join(' · ')}</span>
              </span>
              <span className="flex flex-none items-center gap-3 sm:gap-4">
                {r.thin && <Badge tone="warn" title="Too few videos for the ranking to mean much">thin</Badge>}
                <span className="nums font-mono text-[13px] text-fg-2">{r.counts}</span>
                <ChevronRight aria-hidden className="h-4 w-4 text-fg-3" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-5 py-4 text-sm text-fg-3 sm:px-6">
        Reports are kept for 30 days, then removed to follow YouTube&rsquo;s data rules.
      </p>
    </Panel>
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
