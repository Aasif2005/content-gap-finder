import { compact } from '../lib/format.js';

// What re-running without a given filter means, and whether the query uses it.
const FILTERS = {
  contentType: { active: (q) => q.contentType && q.contentType !== 'both', patch: { contentType: 'both' }, label: (q) => `Include both formats (now ${q.contentType === 'long' ? 'long-form' : 'Shorts'} only)` },
  minViews: { active: (q) => q.minViews > 0, patch: { minViews: 0 }, label: (q) => `Drop the ${q.minViews.toLocaleString()} minimum-views filter` },
  relevanceLanguage: { active: (q) => Boolean(q.relevanceLanguage), patch: { relevanceLanguage: undefined }, label: (q) => `Drop the "${q.relevanceLanguage}" language filter` },
  regionCode: { active: (q) => Boolean(q.regionCode), patch: { regionCode: undefined }, label: (q) => `Drop the "${q.regionCode}" region filter` },
};

function Funnel({ steps }) {
  const top = Math.max(1, steps[0]?.count ?? 1);
  return (
    <ol className="space-y-1.5">
      {steps.map((s) => (
        <li key={s.key} className="flex items-center gap-3 text-xs">
          <span className="nums w-10 shrink-0 text-right font-semibold text-ink-800 dark:text-ink-100">{compact(s.count)}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
            <div className="h-full rounded-full bg-ink-500 dark:bg-ink-400" style={{ width: `${Math.max(2, Math.min(100, (s.count / top) * 100))}%` }} />
          </div>
          <span className="w-56 shrink-0 text-ink-500 dark:text-ink-400">{s.label}</span>
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

  return (
    <details className="group rounded-lg border border-ink-200 px-3 py-2 dark:border-ink-800">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
        <span className="nums rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700 dark:bg-ink-800 dark:text-ink-200">{reason.count}</span>
        <span className="text-ink-800 dark:text-ink-100">{reason.label}</span>
        <span className="ml-auto text-xs text-ink-400 group-open:hidden">show ▾</span>
        <span className="ml-auto hidden text-xs text-ink-400 group-open:inline">hide ▴</span>
      </summary>

      <ul className="mt-2 space-y-1">
        {shown.map((i) => (
          <li key={`${i.code}-${i.videoId}`} className="text-xs text-ink-600 dark:text-ink-300">
            {i.url ? (
              <a href={i.url} target="_blank" rel="noreferrer noopener" className="hover:underline">{i.title || i.videoId}</a>
            ) : (i.title || i.videoId)}
            <span className="text-ink-400">
              {i.channelTitle ? ` · ${i.channelTitle}` : ''}
              {i.views != null ? ` · ${compact(i.views)} views` : ''}
              {i.detail ? ` · ${i.detail}` : ''}
            </span>
          </li>
        ))}
        {reason.count > shown.length && <li className="text-xs text-ink-400">+{reason.count - shown.length} more (all of them are in the audit log)</li>}
      </ul>

      {canRerun && (
        <button
          disabled={busy}
          onClick={() => onRerun(filter.patch)}
          className="mt-2 rounded-md border border-ink-300 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
        >
          {filter.label(query)} and re-run
        </button>
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
const DOT = { solid: 'bg-emerald-500', small: 'bg-amber-400', thin: 'bg-rose-500', 'n/a': 'bg-ink-300 dark:bg-ink-600' };

/** How much to trust each output, judged by what that output computes (server lib/confidence.js). */
function Trust({ evidence }) {
  return (
    <section>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">How much to trust each output</h4>
      <ul className="mt-1.5 space-y-1">
        {Object.entries(evidence).map(([key, e]) => (
          <li key={key} className="flex items-start gap-2 text-xs">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[e.level]}`} />
            <span className="w-40 shrink-0 font-medium text-ink-700 dark:text-ink-200">{OUTPUT_NAMES[key] ?? key} <span className="font-normal text-ink-400">· {e.level}</span></span>
            <span className="text-ink-500 dark:text-ink-400">{e.why}</span>
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
    <details className="rounded-lg border border-ink-200 bg-white px-4 py-2.5 dark:border-ink-800 dark:bg-ink-900/40">
      <summary className="cursor-pointer list-none text-sm text-ink-700 dark:text-ink-200">
        <b>{found}</b> {funnel[0]?.label.toLowerCase().includes('upload') ? 'uploads in the window' : 'videos found'} → <b>{scored}</b> scored
        {excluded > 0 && <> · <b>{excluded}</b> left out, and why</>}
        {evidence && Object.entries(evidence).filter(([, e]) => e.level === 'small' || e.level === 'thin').map(([k, e]) => (
          <span key={k} className={`ml-2 text-xs ${e.level === 'thin' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>{(OUTPUT_NAMES[k] ?? k).toLowerCase()}: {e.level}</span>
        ))}
        <span className="ml-2 text-xs text-ink-400">details ▾</span>
      </summary>

      <div className="mt-3 space-y-4">
        <Funnel steps={funnel} />
        {exclusions.shortfall?.detail && <p className="text-xs text-ink-500 dark:text-ink-400">{exclusions.shortfall.detail}</p>}

        {left.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Left out of scoring</h4>
            {left.map((r) => <Reason key={r.code} reason={r} items={items} query={query} busy={busy} onRerun={onRerun} />)}
          </section>
        )}

        {language && (
          <p className="text-xs text-ink-500 dark:text-ink-400">
            Language &ldquo;{language.requested}&rdquo;: {language.confirmed} confirmed, {language.excluded} excluded as a different language, {language.undecided} undecided
            {language.undecided > 0 && ' (kept: unknown is not no)'}
            {!language.applied && ' — the filter was not applied because it would have removed every video'}.
          </p>
        )}

        {unread.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Scored, but comments not used for gaps</h4>
            {unread.map((r) => <Reason key={r.code} reason={r} items={items} query={query} busy={busy} onRerun={onRerun} />)}
          </section>
        )}

        {evidence && <Trust evidence={evidence} />}

        {!integrity && (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
            These counts do not add up (found ≠ scored + left out). Treat this funnel with suspicion and check the audit log.
          </p>
        )}
      </div>
    </details>
  );
}
