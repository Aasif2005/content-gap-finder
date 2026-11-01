import { useLayoutEffect, useRef } from 'react';
import { cx } from '../../lib/cx.js';

/**
 * A card grid whose cards share one height per row while closed, yet where
 * opening a card grows only that card. Cards align to the top (a neighbour never
 * stretches) and each gets a min-height equal to the tallest card in its row,
 * measured only while nothing in the grid is open.
 */
export function EqualRows({ className, children }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const measure = () => {
      if (el.querySelector('[aria-expanded="true"]')) return;
      const cards = Array.from(el.children);
      cards.forEach((c) => { c.style.minHeight = ''; });
      const rows = new Map();
      cards.forEach((c) => rows.set(c.offsetTop, Math.max(rows.get(c.offsetTop) ?? 0, c.offsetHeight)));
      cards.forEach((c) => { c.style.minHeight = `${rows.get(c.offsetTop)}px`; });
    };

    // Debounced: a card closing animates for ~500ms, and measuring mid-way would read a half-open height.
    let timer;
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(measure, 150); };

    measure();
    // Width changes (resize, sidebar) reflow the text; a card closing returns to its resting size.
    const ro = new ResizeObserver(later);
    ro.observe(el);
    const mo = new MutationObserver(later);
    mo.observe(el, { attributes: true, attributeFilter: ['aria-expanded'], subtree: true });
    document.fonts?.ready.then(measure);
    return () => { window.clearTimeout(timer); ro.disconnect(); mo.disconnect(); };
  });

  return <div ref={ref} className={cx('grid items-start gap-4', className)}>{children}</div>;
}
