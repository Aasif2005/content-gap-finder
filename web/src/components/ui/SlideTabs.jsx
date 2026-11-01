import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cx } from '../../lib/cx.js';

const SPRING = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 };

const measure = (el) => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
const same = (a, b) => (!a && !b) || (a && b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && a.on === b.on);

/**
 * A row of tabs with two pills: the selected one (`pillClassName`) always sits
 * on the tab marked `data-active="true"` and glides when the selection changes;
 * a soft one (`hoverClassName`) follows the pointer or focus to the other tabs.
 * Children keep their own markup and roles: mark each with `data-slide-item`
 * and give them no background of their own (see SLIDE_ITEM).
 */
export function SlideGroup({ as: Tag = 'div', className, pillClassName, hoverClassName = 'bg-hover', children, ...rest }) {
  const root = useRef(null);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(null);
  const [hover, setHover] = useState(null);
  const hovered = useRef(null);
  const moving = reduced ? { duration: 0 } : SPRING;

  const selected = useCallback(() => root.current?.querySelector('[data-slide-item][data-active="true"]') ?? null, []);

  // Runs after every render so a changed selection, font load or wrap re-measures;
  // setState bails out when nothing moved.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const sync = () => {
      const sel = selected();
      const a = sel ? measure(sel) : null;
      setActive((p) => (same(p, a) ? p : a));
      const item = hovered.current;
      setHover((p) => {
        if (!p) return p;
        const h = item?.isConnected ? { ...measure(item), on: item !== sel } : { ...p, on: false };
        return same(p, h) ? p : h;
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const point = (e) => {
    const item = e.target.closest?.('[data-slide-item]');
    if (!item || !root.current?.contains(item) || item.disabled) return;
    hovered.current = item;
    setHover({ ...measure(item), on: item.dataset.active !== 'true' });
  };

  const leave = () => {
    hovered.current = null;
    setHover((p) => (p ? { ...p, on: false } : p));
  };

  return (
    <Tag
      ref={root}
      className={cx('relative', className)}
      onMouseOver={point}
      onFocusCapture={point}
      onMouseLeave={leave}
      onBlurCapture={(e) => { if (!root.current?.contains(e.relatedTarget)) leave(); }}
      {...rest}
    >
      {hover && (
        <motion.span
          aria-hidden
          initial={false}
          animate={{ left: hover.left, top: hover.top, width: hover.width, height: hover.height, opacity: hover.on ? 1 : 0 }}
          transition={moving}
          className={cx('pointer-events-none absolute z-0 rounded-full', hoverClassName)}
        />
      )}
      {active && (
        <motion.span
          aria-hidden
          initial={false}
          animate={active}
          transition={moving}
          className={cx('pointer-events-none absolute z-[1] rounded-full', pillClassName)}
        />
      )}
      {children}
    </Tag>
  );
}

/** Classes every tab inside a SlideGroup needs: above both pills, no fill of its own. */
export const SLIDE_ITEM = 'relative z-10 bg-transparent';
