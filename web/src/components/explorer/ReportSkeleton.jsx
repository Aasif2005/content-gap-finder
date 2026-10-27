import { Panel, Skeleton } from '../ui/index.js';

/** Stands in for a report while a saved one loads: title block, tabs, two cards. */
export function ReportSkeleton() {
  return (
    <div role="status" aria-label="Loading the report" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2.5">
          <Skeleton className="h-11 w-24 rounded-control" />
          <Skeleton className="h-11 w-24 rounded-control" />
        </div>
      </div>
      <Skeleton className="h-3.5 w-full max-w-xl" />
      <div className="flex gap-7 border-b border-line-strong pt-2">
        {['w-28', 'w-28', 'w-24', 'w-16'].map((w, i) => <Skeleton key={i} className={`mb-3 h-5 ${w}`} />)}
      </div>
      {[0, 1].map((i) => (
        <Panel key={i} className="space-y-4">
          <Skeleton className="h-7 w-3/4" />
          <div className="flex gap-2"><Skeleton className="h-7 w-24 rounded-full" /><Skeleton className="h-7 w-32 rounded-full" /></div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </Panel>
      ))}
    </div>
  );
}
