import { Alert, Badge } from '../ui/index.js';
import { StatRow } from '../Bits.jsx';
import { ThinPoolNotice } from '../ThinPoolNotice.jsx';
import { EvidencePanel } from '../EvidencePanel.jsx';
import { VideoTitlesProvider } from '../CommentQuote.jsx';
import { ReportHeader } from './ReportHeader.jsx';
import { ReportTabs } from './ReportTabs.jsx';
import { ReportFooter } from './ReportFooter.jsx';
import { SummaryBand } from './SummaryBand.jsx';

/**
 * A finished report in one calm column: header and provenance, the stats
 * line, the notices that qualify every number below them, the top three gaps,
 * the tabs, `extras` (the watch controls, only for someone who can run
 * analyses) and the footer.
 *
 * `canRun` is false for a logged-out visitor on a shared link: no Refresh, no
 * form, no Make it. `onRerun(patch)` re-runs with changed filters.
 */
export function ReportView({ result, cacheInfo, busy, canRun, canMake, formOpen, onToggleForm, onRefresh, onRerun, extras }) {
  // The thin-pool warning is already the callout below, verbatim. Filtered by
  // identity against the value the server sent, not by matching on its wording.
  const warnings = (result.warnings ?? []).filter((w) => w !== result.thinPool?.warning);
  const outliers = result.outliers;

  return (
    <VideoTitlesProvider result={result}>
      <div className="mx-auto max-w-[760px] space-y-8">
        <ReportHeader result={result} canRun={canRun} busy={busy} formOpen={formOpen} onToggleForm={onToggleForm} onRefresh={onRefresh} />

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-line py-4">
          <StatRow stats={result.stats} />
          {cacheInfo?.cached && (
            <Badge tone="info" title="Served from cache, so it cost no API quota.">
              cached {Math.max(1, Math.round((cacheInfo.ageSeconds ?? 0) / 60))}m ago
            </Badge>
          )}
        </div>

        {/* A thin pool is not a warning among warnings: it undermines every
            number below it, so it gets its own callout with one-click ways out. */}
        {result.thinPool && (
          <ThinPoolNotice thinPool={result.thinPool} query={result.query} busy={busy} onRerun={onRerun} />
        )}

        {warnings.length > 0 && (
          <Alert tone="warn">
            {warnings.map((w, i) => <p key={i} className={i ? 'mt-1' : undefined}>{w}</p>)}
          </Alert>
        )}

        {result.exclusions && (
          <EvidencePanel exclusions={result.exclusions} evidence={result.evidence} query={result.query} busy={busy} onRerun={onRerun} />
        )}

        {outliers?.outliers > 0 && (
          <Alert tone="good">
            <b>{outliers.outliers}</b> of {outliers.measured} measured videos beat their own channel&rsquo;s median by {outliers.threshold}&times; or more
            {outliers.topFormulas?.length > 0 && (
              <> &middot; common title formulas: {outliers.topFormulas.slice(0, 3).map((f) => `${f.name} (${f.count})`).join(', ')}</>
            )}
            .
          </Alert>
        )}

        <SummaryBand gaps={result.gaps} />

        <div className="pt-2">
          <ReportTabs key={result.runId} result={result} canMake={canMake} canRun={canRun} />
        </div>

        {extras}

        <ReportFooter result={result} />
      </div>
    </VideoTitlesProvider>
  );
}
