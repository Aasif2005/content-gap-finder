import { forwardRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cx } from '../../lib/cx.js';

/**
 * The primary call to action: a pill with a slow light running around its edge,
 * a dotted sheen and, on hover or focus, a brighter glow. From 21st.dev
 * (ShinyButton), restyled with our tokens (ground = --ink, glow = --focus, so
 * navy with Ion Blue in light and cream with lilac in dark) and without its
 * Google Fonts import. The styles live in index.css (`.shiny-cta`).
 *
 * Under reduced motion the light stands still. `loading` shows a spinner and
 * stops the animation; the width does not change.
 */
export const ShinyButton = forwardRef(function ShinyButton(
  { children, loading = false, disabled = false, type = 'button', className, ...rest },
  ref
) {
  const off = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={off}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={cx('shiny-cta', className)}
      {...rest}
    >
      {/* Not positioned: the glow layer inside this span is sized against the button. */}
      <span className="inline-flex items-center justify-center gap-2">
        {loading && <LoaderCircle aria-hidden className="absolute inset-0 m-auto h-[18px] w-[18px] animate-spin" />}
        <span className={cx('inline-flex items-center justify-center gap-2', loading && 'invisible')}>{children}</span>
      </span>
    </button>
  );
});
