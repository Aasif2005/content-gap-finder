import { Alert, Badge, Panel } from '../ui/index.js';
import { StatRow } from '../Bits.jsx';
import { ThinPoolNotice } from '../ThinPoolNotice.jsx';
import { EvidencePanel } from '../EvidencePanel.jsx';
import { VideoTitlesProvider } from '../CommentQuote.jsx';
import { ReportHeader } from './ReportHeader.jsx';
import { ReportTabs } from './ReportTabs.jsx';
import { ReportFooter } from './ReportFooter.jsx';

/**
 * A finished report, top to bottom: header and provenance, `extras` (the
 * history and watch controls, only for someone who can run analyses), the
 * stats row, the notices that qualify every number below them, the tabs and
 * the footer.
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
      <div className="space-y-6">
        <ReportHeader result={result} canRun={canRun} busy={busy} formOpen={formOpen} onToggleForm={onToggleForm} onRefresh={onRefresh} />

        {extras}

        <Panel padding="none" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <StatRow stats={result.stats} />
          {cacheInfo?.cached && (
            <Badge tone="info" title="Served from cache, so it cost no API quota.">
              cached {Math.max(1, Math.round((cacheInfo.ageSeconds ?? 0) / 60))}m ago
            </Badge>
          )}
        </Panel>

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

        <div className="pt-2">
          <ReportTabs key={result.runId} result={result} canMake={canMake} canRun={canRun} />
        </div>

        <ReportFooter result={result} />
      </div>
    </VideoTitlesProvider>
  );
}
