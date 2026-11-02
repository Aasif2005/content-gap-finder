import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../lib/cx.js';
import { Button } from './ui/Button.jsx';
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
  const trigger = useRef(null);
  const menu = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
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
      hint: 'For Notion or Docs',
      run: async () => {
        const ok = await copyToClipboard(reportToMarkdown(result));
        flash(ok ? 'Copied' : 'Copy failed');
      },
    },
    {
      label: 'Download report',
      hint: 'Markdown file',
      run: () => { download(`${stem}.md`, reportToMarkdown(result), 'text/markdown'); setOpen(false); },
    },
    {
      label: 'Gaps (CSV)',
      hint: `${result.gaps?.length ?? 0} rows`,
      run: () => { download(`${stem}-gaps.csv`, gapsToCsv(result), 'text/csv'); setOpen(false); },
      disabled: !result.gaps?.length,
    },
    {
      label: 'Topics (CSV)',
      hint: `${result.topics?.length ?? 0} rows`,
      run: () => { download(`${stem}-topics.csv`, topicsToCsv(result), 'text/csv'); setOpen(false); },
      disabled: !result.topics?.length,
    },
  ];

  // Arrow keys move between enabled items; Escape closes and hands focus back.
  const onMenuKey = (e) => {
    const els = [...(menu.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])];
    const i = els.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); els[(n + els.length) % els.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(els.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <Button
        ref={trigger}
        variant="soft"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
      >
        {copied ?? 'Export'}
        <ChevronDown aria-hidden className={cx('h-4 w-4', open && 'rotate-180')} />
      </Button>

      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="Export"
          onKeyDown={onMenuKey}
          className="fade-in absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-panel border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgb(15_30_46/0.35)]"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              tabIndex={-1}
              disabled={it.disabled}
              onClick={it.run}
              className="block min-h-11 w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-hover focus-visible:bg-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
            >
              <span className="block text-[15px] font-medium text-fg">{it.label}</span>
              <span className="block text-[13px] text-fg-3">{it.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
