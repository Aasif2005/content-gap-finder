/**
 * Shown when too few videos survived to scoring for relative scoring to carry
 * meaning. This is deliberately louder than a warning line: heat, topic
 * breadth, and the whole ranking are computed *relative to the result set*, so
 * below a dozen videos the report still looks authoritative while actually
 * being close to "view order, restated". A real run ("what if hypothesis" with
 * a Tamil language filter) came back with 3 videos and rendered identically to
 * a 50-video run.
 *
 * Each escape route is a button rather than prose, because the fix is always a
 * re-run with one input changed and making the user rebuild the query by hand
 * is how a caveat gets ignored.
 */
export function ThinPoolNotice({ thinPool, query, busy, onRerun }) {
  const { videos, threshold } = thinPool;

  // Only offer routes that would actually change this query. Offering "widen the
  // window" on a run that is already at 90d trains people to distrust the whole
  // callout.
  const escapes = [
    query.window !== '90d' && query.window !== 'custom' && {
      label: 'Widen to 90 days',
      patch: { window: '90d', customAfter: undefined },
    },
    !query.deepScan && {
      label: 'Deep scan',
      patch: { deepScan: true },
      title: 'Doubles the candidate pool with a second date-ordered search pass. Costs one extra 100-unit search.',
    },
    query.relevanceLanguage && {
      label: `Drop "${query.relevanceLanguage}" language filter`,
      patch: { relevanceLanguage: undefined },
    },
    query.regionCode && {
      label: `Drop "${query.regionCode}" region filter`,
      patch: { regionCode: undefined },
    },
    query.minViews > 0 && {
      label: 'Drop min-views filter',
      patch: { minViews: 0 },
    },
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 dark:border-orange-500/40 dark:bg-orange-500/10">
      <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">
        Only {videos} video{videos === 1 ? '' : 's'} to score — treat this report as weak evidence
      </p>
      <p className="mt-1 text-sm text-orange-800 dark:text-orange-300">
        Heat, topic breadth and the ranking below are all computed <em>relative to this result
        set</em>. Under about {threshold} videos there is not enough spread for that to mean
        much — the ranking mostly just restates view order, and a topic backed by one video
        looks the same as one backed by ten.
      </p>

      {escapes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">
            Widen it
          </span>
          {escapes.map((e) => (
            <button
              key={e.label}
              type="button"
              disabled={busy}
              title={e.title}
              onClick={() => onRerun(e.patch)}
              className="rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-xs font-medium text-orange-900 transition-colors hover:bg-orange-100 disabled:opacity-50 dark:border-orange-500/40 dark:bg-transparent dark:text-orange-200 dark:hover:bg-orange-500/20"
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
