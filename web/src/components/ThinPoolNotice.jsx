import { Alert } from './ui/Alert.jsx';
import { Button } from './ui/Button.jsx';

/**
 * Shown when too few videos survived to scoring for relative scoring to carry
 * meaning. This is deliberately louder than a warning line: buzz, topic
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
  const { videos, threshold, swing, detail, cause } = thinPool;
  const channelMode = Boolean(query.channelId);

  // Only offer routes that would actually change this query. Offering "widen the
  // window" on a run that is already at 90d trains people to distrust the whole
  // callout -- and dropping a filter does nothing for a channel that simply
  // published little, so which routes lead depends on the cause.
  const filterEscapes = [
    query.contentType && query.contentType !== 'both' && {
      label: `Include both formats (now ${query.contentType === 'long' ? 'long-form' : 'Shorts'} only)`,
      patch: { contentType: 'both' },
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
  const widenEscapes = [
    query.window !== '90d' && query.window !== 'custom' && {
      label: 'Widen to 90 days',
      patch: { window: '90d', customAfter: undefined },
    },
    !channelMode && !query.deepScan && {
      label: 'Deep scan',
      patch: { deepScan: true },
      title: 'Doubles the candidate pool with a second date-ordered search pass. Costs one extra search call (of 100 a day).',
    },
  ].filter(Boolean);
  const escapes = cause === 'filters' ? [...filterEscapes, ...widenEscapes] : [...widenEscapes, ...filterEscapes];

  return (
    <Alert
      tone="warn"
      title={`Only ${videos} video${videos === 1 ? '' : 's'} to score — treat the ranking as weak evidence`}
    >
      <p className="max-w-[68ch] leading-relaxed">
        Buzz is a rank <em>within this set</em>: with <span className="nums">{videos}</span> video{videos === 1 ? '' : 's'}, adding or removing one
        moves a score by about <span className="nums">{swing}</span> points (it takes about <span className="nums">{threshold}</span> for that to drop to ~<span className="nums">{Math.round(100 / (threshold - 1))}</span>).
        {detail && <> {detail}</>}
      </p>

      {escapes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium">Widen it</span>
          {escapes.map((e) => (
            <Button
              key={e.label}
              variant="secondary"
              disabled={busy}
              title={e.title}
              onClick={() => onRerun(e.patch)}
            >
              {e.label}
            </Button>
          ))}
        </div>
      )}
    </Alert>
  );
}
