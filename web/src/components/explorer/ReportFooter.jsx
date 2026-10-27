import { ExternalLink } from 'lucide-react';

const relFrac = (r) => (r ? `${r.relevant}/${r.total}` : '—');

/** How the numbers were made, and the audit trail behind them. */
export function ReportFooter({ result }) {
  const { stats } = result;
  return (
    <footer className="nums border-t border-line pt-5 text-[13px] leading-relaxed text-fg-3">
      <p>
        Analyzed {stats.videosAnalyzed} videos and {stats.commentsAnalyzed} comments
        {stats.llmUsage?.totalTokens != null && <> &middot; {stats.llmUsage.totalTokens.toLocaleString()} LLM tokens</>}
        {' '}&middot; {new Date(result.generatedAt).toLocaleString()}
      </p>
      <p className="mt-1.5 max-w-3xl">
        Heat is scored relative to this result set only. It blends view velocity, views per
        subscriber, and engagement rate, so a small channel breaking out outranks a large channel coasting.
        {stats.runsCompared > 0 ? (
          <>
            {' '}Gaps are compared against {stats.runsCompared} earlier run
            {stats.runsCompared === 1 ? '' : 's'} of this subject to mark them recurring or new.
          </>
        ) : (
          <>
            {' '}This is the first stored run of this subject, so no gap can be marked recurring yet.
            Run it again later and repeat demand becomes visible.
          </>
        )}
      </p>
      {result.runId && stats.relevance && (
        <p className="mt-1.5">
          Niche relevance check: topics {relFrac(stats.relevance.topicRelevance)}, gaps{' '}
          {relFrac(stats.relevance.gapRelevance)}, avoid {relFrac(stats.relevance.avoidRelevance)} &middot;{' '}
          <a
            href={`/api/logs/${result.runId}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-6 items-center gap-1 font-medium text-fg-2 underline underline-offset-2 hover:text-fg"
            title="Opens the full audit log: every video the search returned, every topic/gap the model extracted, and whether it actually mentions the niche."
          >
            View full audit log
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </p>
      )}
    </footer>
  );
}
