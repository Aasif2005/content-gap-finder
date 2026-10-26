import { forwardRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import { cx } from '../../lib/cx.js';

const VARIANTS = {
  primary: 'bg-ink text-on-ink hover:opacity-90',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-hover',
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
  // surface text on the alert colour keeps its contrast in both themes
  // (white on dark red in light; navy on salmon in dark).
  danger: 'bg-bad-fg text-surface hover:opacity-90',
};

// 44px is the touch-target floor; lg is the 52px search-console button.
const SIZES = {
  md: 'min-h-11 px-5 text-[15px]',
  lg: 'min-h-[52px] px-6 text-base',
};

/**
 * A button, or a link that looks like one.
 *
 * `href` renders a router `Link` (client-side navigation); `as="a"` with an
 * `href` renders a plain anchor, for another site or a new tab. `loading`
 * disables it and swaps the label for a spinner without changing its width.
 */
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled = false, as, href, className, children, type, ...rest },
  ref
) {
  const off = disabled || loading;
  const classes = cx(
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold',
    'transition-[background-color,color,opacity] duration-150 ease-[var(--ease-out)]',
    VARIANTS[variant],
    SIZES[size],
    off && 'cursor-not-allowed opacity-45 hover:opacity-45',
    className
  );

  const content = (
    <>
      {loading && <LoaderCircle aria-hidden className="absolute h-[18px] w-[18px] animate-spin" />}
      <span className={cx('inline-flex items-center justify-center gap-2', loading && 'invisible')}>{children}</span>
    </>
  );

  if (href !== undefined) {
    const Tag = as === 'a' ? 'a' : Link;
    return (
      <Tag
        ref={ref}
        href={off ? undefined : href}
        aria-disabled={off || undefined}
        aria-busy={loading || undefined}
        className={classes}
        {...rest}
      >
        {content}
      </Tag>
    );
  }
  if (as === 'a') {
    return <a ref={ref} className={classes} aria-disabled={off || undefined} {...rest}>{content}</a>;
  }
  return (
    <button ref={ref} type={type ?? 'button'} disabled={off} aria-busy={loading || undefined} className={classes} {...rest}>
      {content}
    </button>
  );
});
