import { useRef } from 'react';
import { useInView } from '../../lib/useInView.js';
import { cx } from '../../lib/cx.js';

/**
 * The amber highlighter: marks text a real viewer wrote, and nothing else.
 * Light themes paint soft amber behind ink text; night themes paint full amber
 * behind night text (both come from the tokens). With `sweep` the highlight is
 * drawn left to right once, when it scrolls into view; reduced-motion shows it
 * already drawn.
 */
export function EvidenceMark({ children, sweep = false, className, as: Tag = 'span', ...rest }) {
  const ref = useRef(null);
  const seen = useInView(ref);
  return (
    <Tag ref={ref} className={cx('mark', sweep && 'evidence-sweep', sweep && seen && 'in-view', className)} {...rest}>
      {children}
    </Tag>
  );
}
