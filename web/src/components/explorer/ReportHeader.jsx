import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Avatar, Button } from '../ui/index.js';
import { ExportMenu } from '../ExportMenu.jsx';
import { copyToClipboard } from '../../lib/export.js';
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
  const [copied, setCopied] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const channel = result.channel;
  const share = async () => {
    const url = `${window.location.origin}${reportPathFor(result.channelMode ? 'channel' : 'niche', result.runId)}`;
    setCopied((await copyToClipboard(url)) ? 'Link copied' : 'Copy failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1600);
  };

  return (
    <header>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-focus">
        {channel ? 'Channel report' : 'Niche report'}
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="flex min-w-0 flex-1 basis-96 items-center gap-5">
          {channel && <Avatar user={{ name: channel.title }} size={64} className="hidden sm:inline-flex" />}
          <div className="min-w-0">
            <h1 id="report-title" tabIndex={-1} className="outline-none text-balance break-words text-[34px] font-bold leading-[1.06] tracking-[-0.035em] sm:text-[44px]">
              {channel ? reportName(result) : <>&ldquo;{reportName(result)}&rdquo;</>}
            </h1>
            {/* Channel mode reports on one creator's own uploads and viewers: say so,
                or the report reads as if it were about a niche. */}
            {channel && (
              <p className="nums mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-fg-2">
                <a
                  href={channel.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-medium text-focus underline-offset-2 hover:underline"
                >
                  Open channel
                  <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                  <span className="sr-only">(opens on YouTube)</span>
                </a>
                <span>&middot; {compact(channel.subscribers)} subscribers &middot; {compact(channel.videoCount)} videos total</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {result.runId && (
            <Button variant="soft" onClick={share} title="Copies a link to this saved report. Opening it is free.">
              <Link2 aria-hidden className="h-4 w-4" />
              {copied ?? 'Share'}
            </Button>
          )}
          <ExportMenu result={result} />
          {canRun && (
            <>
              <Button variant="soft" onClick={onRefresh} disabled={busy} title="Re-run against live data. Spends one of today's analyses.">
                <RefreshCw aria-hidden className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="soft" onClick={onToggleForm} aria-expanded={formOpen}>
                <SlidersHorizontal aria-hidden className="h-4 w-4" />
                {formOpen ? 'Close search' : 'Edit search'}
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="nums mt-4 text-[15px] text-fg-2">
        {reportMeta(result).join(' · ')}
        {channel && <span className="text-fg-3"> · Its own uploads and its own viewers&rsquo; comments.</span>}
      </p>
      <div className="mt-2">
        <ReportProvenance generatedAt={result.generatedAt} />
      </div>
    </header>
  );
}
