import { Info } from 'lucide-react';
import { cx } from '../../lib/cx.js';

/**
 * Marks a figure we calculated ourselves. YouTube's API policies require our
 * own metrics to be clearly told apart from YouTube's: views, likes and
 * subscribers carry no mark; heat, demand, engagement % and the like do.
 */
export const DERIVED_NOTE = 'Calculated by Gapstronaut from YouTube data. Not a YouTube metric.';

export function Derived({ className }) {
  return (
    <span role="img" title={DERIVED_NOTE} aria-label={DERIVED_NOTE} className={cx('inline-flex cursor-help align-[-0.15em] font-normal opacity-60', className)}>
      <Info aria-hidden className="h-[1em] w-[1em]" />
    </span>
  );
}
