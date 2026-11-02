import { forwardRef, useId } from 'react';
import { Check } from 'lucide-react';
import { cx } from '../../lib/cx.js';

/**
 * A checkbox with its label. The whole row is the click target (at least
 * 44px tall). Links inside `children` work as links and do not toggle the box.
 */
export const Checkbox = forwardRef(function Checkbox({ children, error, className, id, disabled, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = error ? `${inputId}-error` : undefined;
  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className={cx('flex min-h-11 items-start gap-3 py-2 text-sm leading-relaxed text-fg-2', disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer')}
      >
        <span className="relative mt-px h-5 w-5 shrink-0">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            disabled={disabled}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={errId}
            className={cx(
              'peer absolute inset-0 h-5 w-5 appearance-none rounded-[5px] border bg-surface transition-colors duration-150',
              'checked:border-ink checked:bg-ink hover:border-fg-3 disabled:cursor-not-allowed',
              error ? 'border-bad-fg shadow-[inset_0_0_0_1px_var(--bad-fg)]' : 'border-line-strong'
            )}
            {...rest}
          />
          <Check
            aria-hidden
            strokeWidth={3}
            className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-on-ink opacity-0 peer-checked:opacity-100"
          />
        </span>
        <span>{children}</span>
      </label>
      {error && <p id={errId} role="alert" className="mt-1 text-[13px] text-bad-fg">{error}</p>}
    </div>
  );
});
