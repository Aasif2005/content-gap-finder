import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '../../lib/router.jsx';
import { cx } from '../../lib/cx.js';

/**
 * A popover menu opened from a button.
 *
 *   <Menu label="Account" trigger={<Avatar user={user} />} header={<>name, email</>}
 *         items={[{ label: 'Profile', href: '/profile' }, { label: 'Log out', onSelect: logOut }]} />
 *
 * Items are `{ label, href? , onSelect?, icon?, tone?: 'danger' }` or
 * `{ separator: true }`. The panel is `position: fixed`, placed from the
 * button's rectangle, and rendered into <body>, so no ancestor's `overflow`, transform or
 * backdrop-filter (the header glass) can clip or offset it. Arrow keys, Home
 * and End move between items; Escape and Tab close it; Escape returns focus to
 * the button.
 */
export function Menu({ label, trigger, items, header, align = 'end', triggerClassName, className }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const button = useRef(null);
  const panel = useRef(null);
  const id = useId();

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    setPos(align === 'end'
      ? { top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) }
      : { top: r.bottom + 8, left: Math.max(8, r.left) });
  }, [align]);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    place();
    panel.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
    const onDown = (e) => {
      if (!panel.current?.contains(e.target) && !button.current?.contains(e.target)) close();
    };
    const onMove = () => close();
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place, close]);

  const onKeyDown = (e) => {
    const els = [...(panel.current?.querySelectorAll('[role="menuitem"]') ?? [])];
    const i = els.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); els[(n + els.length) % els.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(els.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close();
  };

  const itemClass = (tone) => cx(
    'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[15px] transition-colors hover:bg-hover focus-visible:bg-hover',
    tone === 'danger' ? 'text-bad-fg' : 'text-fg'
  );

  return (
    <div className={cx('relative inline-block', className)}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
        className={cx('inline-flex min-h-11 min-w-11 items-center justify-center rounded-full', triggerClassName)}
      >
        {trigger}
      </button>

      {open && createPortal(
        <div
          ref={panel}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{ position: 'fixed', ...pos }}
          className="fade-in z-50 w-64 max-w-[calc(100vw-1rem)] rounded-panel border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgb(15_30_46/0.35)]"
        >
          {header && <div className="border-b border-line-soft px-3 pb-2.5 pt-2">{header}</div>}
          <div className={header ? 'pt-1.5' : undefined}>
            {items.map((item, n) => {
              if (item.separator) return <div key={`sep${n}`} role="separator" className="my-1.5 h-px bg-line-soft" />;
              const inner = <>{item.icon}{item.label}</>;
              return item.href ? (
                <Link key={item.label} href={item.href} role="menuitem" tabIndex={-1} onClick={() => close()} className={itemClass(item.tone)}>
                  {inner}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => { close(); item.onSelect?.(); }}
                  className={itemClass(item.tone)}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
