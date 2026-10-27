import { ChevronDown } from 'lucide-react';
import { compact } from '../lib/format.js';
import { Badge } from './Bits.jsx';
import { Button } from './ui/Button.jsx';
import { Panel } from './ui/Panel.jsx';

// What re-running without a given filter means, and whether the query uses it.
const FILTERS = {
  contentType: { active: (q) => q.contentType && q.contentType !== 'both', patch: { contentType: 'both' }, label: (q) => `Include both formats (now ${q.contentType === 'long' ? 'long-form' : 'Shorts'} only)` },
  minViews: { active: (q) => q.minViews > 0, patch: { minViews: 0 }, label: (q) => `Drop the ${q.minViews.toLocaleString()} minimum-views filter` },
  relevanceLanguage: { active: (q) => Boolean(q.relevanceLanguage), patch: { relevanceLanguage: undefined }, label: (q) => `Drop the "${q.relevanceLanguage}" language filter` },
  regionCode: { active: (q) => Boolean(q.regionCode), patch: { regionCode: undefined }, label: (q) => `Drop the "${q.regionCode}" region filter` },
};

const SUMMARY_MARKER = '[&::-webkit-details-marker]:hidden';

function Funnel({ steps }) {
  const top = Math.max(1, steps[0]?.count ?? 1);
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="nums w-12 shrink-0 text-right font-mono font-medium text-fg">{compact(s.count)}</span>
          <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-[3px] bg-line">
            <div className="h-full rounded-[3px] bg-fg-3" style={{ width: `${Math.max(2, Math.min(100, (s.count / top) * 100))}%` }} />
          </div>
          <span className="basis-full text-fg-2 sm:w-56 sm:basis-auto sm:shrink-0">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Reason({ reason, items, query, busy, onRerun }) {
  const rows = items.filter((i) => i.code === reason.code);
  const shown = rows.slice(0, 12);
  const filter = reason.filter ? FILTERS[reason.filter] : null;
  const canRerun = filter?.active(query);

  // A hairline row, not a box: the whole panel is the one container.
  return (
    <details className="group border-t border-line-soft first:border-t-0">
      <summary className={`flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-control py-2 text-[15px] ${SUMMARY_MARKER}`}>
        <Badge mono>{reason.count}</Badge>
        <span className="min-w-0 flex-1 text-fg">{reason.label}</span>
        <span className="inline-flex items-center gap-1 text-[13px] text-fg-3">
          <span className="group-open:hidden">show</span>
          <span className="hidden group-open:inline">hide</span>
          <ChevronDown aria-hidden className="h-4 w-4 group-open:rotate-180" />
        </span>
      </summary>

      <ul className="space-y-1.5 pb-3 pl-1">
        {shown.map((i) => (
          <li key={`${i.code}-${i.videoId}`} className="text-sm text-fg-2">
            {i.url ? (
              <a href={i.url} target="_blank" rel="noreferrer noopener" className="text-fg underline-offset-2 hover:underline">{i.title || i.videoId}</a>
            ) : (i.title || i.videoId)}
            <span className="text-fg-3">
              {i.channelTitle ? ` · ${i.channelTitle}` : ''}
              {i.views != null ? ` · ${compact(i.views)} views` : ''}
              {i.detail ? ` · ${i.detail}` : ''}
            </span>
          </li>
        ))}
        {reason.count > shown.length && <li className="text-[13px] text-fg-3">+{reason.count - shown.length} more (all of them are in the audit log)</li>}
      </ul>

      {canRerun && (
        <div className="pb-3">
          <Button variant="secondary" disabled={busy} onClick={() => onRerun(filter.patch)}>
            {filter.label(query)} and re-run
          </Button>
        </div>
      )}
    </details>
  );
}

/**
 * Where every video went. Replaces "N dropped by the filters" with the actual
 * funnel and, per reason, the videos themselves -- so a short list can be traced
 * to the step that made it short, and the filter responsible can be undone from
 * the same place.
 */
const OUTPUT_NAMES = { heat: 'Heat ranking', topics: 'Trending topics', gaps: 'Content gaps', outliers: 'Channel-median outliers', recurrence: 'Recurrence' };
// Status dots use the semantic status colours; "n/a" is just quiet.
const DOT = { solid: 'bg-good-fg', small: 'bg-warn-fg', thin: 'bg-bad-fg', 'n/a': 'bg-fg-3' };
const LEVEL_TEXT = { thin: 'text-bad-fg', small: 'text-warn-fg' };

const SECTION_TITLE = 'text-[13px] font-medium text-fg-3';

/** How much to trust each output, judged by what that output computes (server lib/confidence.js). */
function Trust({ evidence }) {
  return (
    <section>
      <h4 className={SECTION_TITLE}>How much to trust each output</h4>
      <ul className="mt-2 space-y-2">
        {Object.entries(evidence).map(([key, e]) => (
          <li key={key} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-sm">
            <span aria-hidden className={`mt-[0.45em] h-2 w-2 shrink-0 rounded-full ${DOT[e.level] ?? DOT['n/a']}`} />
            <span className="shrink-0 font-medium text-fg sm:w-52">{OUTPUT_NAMES[key] ?? key} <span className="font-normal text-fg-3">· {e.level}</span></span>
            <span className="min-w-0 basis-full pl-4 text-fg-2 sm:basis-0 sm:flex-1 sm:pl-0">{e.why}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EvidencePanel({ exclusions, evidence, query, busy, onRerun }) {
  const { funnel, byReason, items, excluded, language, integrity } = exclusions;
  const found = funnel[0]?.count ?? 0;
  const scored = funnel.find((f) => f.key === 'scored')?.count ?? 0;
  const left = byReason.filter((r) => r.kind === 'excluded');
  const unread = byReason.filter((r) => r.kind === 'unread');

  return (
    <Panel as="details" padding="none" className="group/evidence">
      <summary className={`flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-panel px-5 py-3 text-[15px] text-fg-2 ${SUMMARY_MARKER}`}>
        <span>
          <b className="nums font-mono font-medium text-fg">{found}</b> {funnel[0]?.label.toLowerCase().includes('upload') ? 'uploads in the window' : 'videos found'} → <b className="nums font-mono font-medium text-fg">{scored}</b> scored
          {excluded > 0 && <> · <b className="nums font-mono font-medium text-fg">{excluded}</b> left out, and why</>}
        </span>
        {evidence && Object.entries(evidence).filter(([, e]) => e.level === 'small' || e.level === 'thin').map(([k, e]) => (
          <span key={k} className={`text-[13px] font-medium ${LEVEL_TEXT[e.level]}`}>{(OUTPUT_NAMES[k] ?? k).toLowerCase()}: {e.level}</span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-[13px] text-fg-3">
          details <ChevronDown aria-hidden className="h-4 w-4 group-open/evidence:rotate-180" />
        </span>
      </summary>

      <div className="space-y-6 border-t border-line px-5 py-5">
        <Funnel steps={funnel} />
        {exclusions.shortfall?.detail && <p className="max-w-[68ch] text-sm leading-relaxed text-fg-2">{exclusions.shortfall.detail}</p>}

        {left.length > 0 && (
          <section>
            <h4 className={SECTION_TITLE}>Left out of scoring</h4>
            <div className="mt-1">
              {left.map((r) => <Reason key={r.code} reason={r} items={items} query={query} busy={busy} onRerun={onRerun} />)}
            </div>
          </section>
        )}

        {language && (
          <p className="max-w-[68ch] text-sm leading-relaxed text-fg-2">
            Language &ldquo;{language.requested}&rdquo;: {language.confirmed} confirmed, {language.excluded} excluded as a different language, {language.undecided} undecided
            {language.undecided > 0 && ' (kept: unknown is not no)'}
            {!language.applied && ' — the filter was not applied because it would have removed every video'}.
          </p>
        )}

        {unread.length > 0 && (
          <section>
            <h4 className={SECTION_TITLE}>Scored, but comments not used for gaps</h4>
            <div className="mt-1">
              {unread.map((r) => <Reason key={r.code} reason={r} items={items} query={query} busy={busy} onRerun={onRerun} />)}
            </div>
          </section>
        )}

        {evidence && <Trust evidence={evidence} />}

        {!integrity && (
          <p role="alert" className="text-sm font-medium text-bad-fg">
            These counts do not add up (found ≠ scored + left out). Treat this funnel with suspicion and check the audit log.
          </p>
        )}
      </div>
    </Panel>
  );
}
