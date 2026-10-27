import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Button } from '../ui/index.js';
import { ExportMenu } from '../ExportMenu.jsx';
import { ReportProvenance } from '../Attribution.jsx';
import { compact } from '../../lib/format.js';
import { reportMeta, reportName } from '../../lib/runRows.js';
import { reportPathFor } from '../../lib/urlState.js';

/**
 * The report's title block: the niche (or channel) as the h1, a meta line, the
 * actions, and the provenance line. A logged-out visitor opening a shared link
 * gets Share and Export only: Refresh spends someone's allowance and Edit
 * search needs the form, which they do not have.
 */
export function ReportHeader({ result, canRun, busy, formOpen, onToggleForm, onRefresh }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const channel = result.channel;
  const share = async () => {
    const url = `${window.location.origin}${reportPathFor(result.channelMode ? 'channel' : 'niche', result.runId)}`;
    try { await navigator.clipboard.writeText(url); } catch { /* insecure context: the URL bar still has it */ }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <header>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-balance break-words text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]">
            {reportName(result)}
          </h1>
          <p className="nums mt-2 text-[15px] text-fg-2">{reportMeta(result).join(' · ')}</p>
          {/* Channel mode reports on one creator's own uploads and viewers: say so,
              or the report reads as if it were about a niche. */}
          {channel && (
            <p className="nums mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-fg-2">
              <a
                href={channel.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-medium text-fg underline underline-offset-2 hover:text-focus"
              >
                {channel.title}
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                <span className="sr-only">(opens on YouTube)</span>
              </a>
              <span>{compact(channel.subscribers)} subscribers &middot; {compact(channel.videoCount)} videos total</span>
              <span className="text-fg-3">Its own uploads and its own viewers&rsquo; comments.</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5">
          {result.runId && (
            <Button variant="secondary" onClick={share} title="Copies a link to this saved report. Opening it costs no quota.">
              <Link2 aria-hidden className="h-4 w-4" />
              {copied ? 'Link copied' : 'Share'}
            </Button>
          )}
          <ExportMenu result={result} />
          {canRun && (
            <>
              <Button variant="secondary" onClick={onRefresh} disabled={busy} title="Re-run against live data. Spends one of today's analyses.">
                <RefreshCw aria-hidden className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="ghost" onClick={onToggleForm} aria-expanded={formOpen}>
                <SlidersHorizontal aria-hidden className="h-4 w-4" />
                {formOpen ? 'Close search' : 'Edit search'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4">
        <ReportProvenance generatedAt={result.generatedAt} />
      </div>
    </header>
  );
}
