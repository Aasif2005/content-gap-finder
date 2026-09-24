import { useEffect, useRef, useState } from 'react';
import { gapsToCsv, topicsToCsv, reportToMarkdown, download, copyToClipboard, exportStem } from '../lib/export.js';

/**
 * Export, as a small menu rather than a row of five buttons -- most runs end in
 * one of these actions, but which one depends entirely on where the person is
 * planning their content, and none of them deserves top-level real estate.
 */
export function ExportMenu({ result }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const stem = exportStem(result);

  const flash = (label) => {
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  };

  const items = [
    {
      label: 'Copy as Markdown',
      hint: 'Pastes into Notion, Obsidian, Docs with structure intact',
      run: async () => {
        const ok = await copyToClipboard(reportToMarkdown(result));
        flash(ok ? 'Copied' : 'Copy failed');
      },
    },
    {
      label: 'Download Markdown',
      hint: 'The whole report, quotes included',
      run: () => { download(`${stem}.md`, reportToMarkdown(result), 'text/markdown'); setOpen(false); },
    },
    {
      label: 'Gaps as CSV',
      hint: `${result.gaps?.length ?? 0} rows, with evidence quotes`,
      run: () => { download(`${stem}-gaps.csv`, gapsToCsv(result), 'text/csv'); setOpen(false); },
      disabled: !result.gaps?.length,
    },
    {
      label: 'Topics as CSV',
      hint: `${result.topics?.length ?? 0} rows, with heat and angles`,
      run: () => { download(`${stem}-topics.csv`, topicsToCsv(result), 'text/csv'); setOpen(false); },
      disabled: !result.topics?.length,
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
      >
        {copied ?? 'Export'} ▾
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg dark:border-ink-700 dark:bg-ink-900"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              onClick={it.run}
              className="block w-full px-3 py-2 text-left transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-ink-800"
            >
              <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">{it.label}</span>
              <span className="block text-[11px] text-ink-400">{it.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
