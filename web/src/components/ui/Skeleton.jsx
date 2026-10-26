import { cx } from '../../lib/cx.js';

/** A placeholder block. Give it a size with className (`h-4 w-40`). Hidden from screen readers. */
export function Skeleton({ className }) {
  return <div aria-hidden className={cx('shimmer relative overflow-hidden rounded-md bg-line', className)} />;
}
