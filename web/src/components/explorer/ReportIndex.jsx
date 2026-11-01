import { useEffect, useState } from 'react';
import { cx } from '../../lib/cx.js';

/**
 * The slim section index that sticks to the left of a report on wide screens.
 * The active entry follows the section nearest the top of the viewport.
 */
export function ReportIndex({ sections, meta = [] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = els.find((el) => seen.get(el.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-96px 0px -55% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Report sections" className="sticky top-24 hidden self-start lg:block">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-fg-3">Index</p>
      <ul className="mt-4 space-y-1">
        {sections.map((s) => {
          const on = active === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={on ? 'location' : undefined}
                className={cx(
                  'flex min-h-9 items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[14px] transition-colors',
                  on ? 'bg-surface-2 font-medium text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg'
                )}
              >
                {s.label}
                {on && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-focus" />}
              </a>
            </li>
          );
        })}
      </ul>
      {meta.length > 0 && (
        <dl className="mt-8 space-y-1.5 border-t border-line-soft pt-5 font-mono text-[11px] uppercase tracking-[0.08em]">
          {meta.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-3">{k}</dt>
              <dd className="text-right normal-case tracking-normal text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </nav>
  );
}
