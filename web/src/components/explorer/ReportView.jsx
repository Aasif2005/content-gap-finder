import { Alert, Badge } from '../ui/index.js';
import { StatRow } from '../Bits.jsx';
import { compact } from '../../lib/format.js';
import { ThinPoolNotice } from '../ThinPoolNotice.jsx';
import { EvidencePanel } from '../EvidencePanel.jsx';
import { VideoTitlesProvider } from '../CommentQuote.jsx';
import { ReportHeader } from './ReportHeader.jsx';
import { ReportIndex } from './ReportIndex.jsx';
import { ReportSections, SECTIONS } from './ReportSections.jsx';

/**
 * A finished report as an editorial page: a slim sticky index on the left (wide
 * screens), and one calm column of header, stat strip, the notices that qualify
 * every number below, then the sections (see ReportSections) and the footer.
 * `extras` is the watch controls, only for someone who can run analyses.
 *
 * `canRun` is false for a logged-out visitor on a shared link: no Refresh, no
 * form, no Make it. `onRerun(patch)` re-runs with changed filters.
 */
export function ReportView({ result, cacheInfo, busy, canRun, canMake, formOpen, onToggleForm, onRefresh, onRerun, extras }) {
  // The thin-pool warning is already the callout below, verbatim. Filtered by
  // identity against the value the server sent, not by matching on its wording.
  const warnings = (result.warnings ?? []).filter((w) => w !== result.thinPool?.warning);
  const outliers = result.outliers;
  const indexMeta = [
    ['Scope', result.channelMode ? 'Channel audit' : 'Niche scan'],
    ['Corpus', `${compact(result.stats.videosAnalyzed)} ${result.channelMode ? 'uploads' : 'videos'}`],
    ['Domain', result.channelMode ? 'Single channel' : 'Many channels'],
  ];
  const sections = SECTIONS(Boolean(result.channelMode)).filter((s) => s.id !== 'summary' || result.gaps?.length);

  return (
    <VideoTitlesProvider result={result}>
      <div className="mx-auto grid max-w-[1200px] gap-x-12 lg:grid-cols-[208px_minmax(0,1fr)]">
        <ReportIndex sections={sections} meta={indexMeta} />

        <div className="min-w-0 space-y-6 sm:space-y-10">
          <ReportHeader result={result} canRun={canRun} busy={busy} formOpen={formOpen} onToggleForm={onToggleForm} onRefresh={onRefresh} />

          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-panel bg-surface px-4 py-4 shadow-card sm:px-6 sm:py-5">
            <div className="min-w-0 flex-1 basis-96">
              <StatRow stats={result.stats} />
            </div>
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

          {outliers?.outliers > 0 && (
            <Alert tone="good">
              <b>{outliers.outliers}</b> of {outliers.measured} measured videos beat their own channel&rsquo;s median by {outliers.threshold}&times; or more
              {outliers.topFormulas?.length > 0 && (
                <> &middot; common title formulas: {outliers.topFormulas.slice(0, 3).map((f) => `${f.name} (${f.count})`).join(', ')}</>
              )}
              .
            </Alert>
          )}

          <div className="pt-4">
            <ReportSections
              key={result.runId}
              result={result}
              canMake={canMake}
              canRun={canRun}
              evidence={
                result.exclusions && (
                  <EvidencePanel exclusions={result.exclusions} evidence={result.evidence} query={result.query} busy={busy} onRerun={onRerun} />
                )
              }
            />
          </div>

          {extras}

        </div>
      </div>
    </VideoTitlesProvider>
  );
}
