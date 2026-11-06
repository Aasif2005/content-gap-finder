import { Alert, Button, Panel, Skeleton, UsageMeter } from '../ui/index.js';
import { resetTimeLabel } from '../../lib/runRows.js';

/** Today's allowance: analyses and Make it drafts, from /api/me. */
export function AllowancePanel({ me, error, loading, onRetry }) {
  if (error && !me) {
    return (
      <Alert tone="bad" title="Could not load your allowance" action={<Button variant="secondary" onClick={onRetry}>Retry</Button>}>
        {error.message}
      </Alert>
    );
  }

  const reset = me ? resetTimeLabel(me.resetsAt) : '';
  return (
    <Panel as="section" aria-labelledby="allowance-h">
      <h2 id="allowance-h" className="text-[26px] font-semibold tracking-[-0.02em]">Today&rsquo;s allowance</h2>
      {loading || !me ? (
        <div role="status" aria-label="Loading your allowance" className="mt-5 space-y-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      ) : (
        <>
          <UsageMeter className="mt-5" label="Fresh analyses" used={me.usage.analyses} limit={me.limits.analyses} />
          <UsageMeter className="mt-[18px]" label="Make it drafts" used={me.usage.briefs} limit={me.limits.briefs} />
          <p className="mt-[18px] text-[13px] leading-relaxed text-fg-3">
            {reset ? `Resets ${reset} (midnight Pacific).` : 'Resets at midnight Pacific.'} Reopening a saved report doesn&rsquo;t use any.
          </p>
        </>
      )}
    </Panel>
  );
}
