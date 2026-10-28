import { createContext, forwardRef, useContext, useId, useState } from 'react';
import { cx } from '../../lib/cx.js';

const FieldContext = createContext(null);

/**
 * A labelled form control with optional hint and error text. The label, hint
 * and error are wired to the `Input` inside (`for`, `aria-describedby`,
 * `aria-invalid`) so a screen reader hears them with the control.
 *
 *   <Field label="Email" hint="We only use it to sign you in." error={err}>
 *     <Input type="email" autoComplete="email" />
 *   </Field>
 *
 * `labelAction` sits at the right of the label row (a "Forgot password?" link).
 */
export function Field({ label, hint, error, labelAction, className, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={className}>
        {(label || labelAction) && (
          <div className="mb-2 flex items-baseline justify-between gap-3">
            {label && <label htmlFor={id} className="text-sm font-medium text-fg">{label}</label>}
            {labelAction && <span className="text-sm text-fg-2">{labelAction}</span>}
          </div>
        )}
        {children}
        {hint && <p id={hintId} className="mt-2 text-[13px] leading-relaxed text-fg-3">{hint}</p>}
        {error && <p id={errorId} role="alert" className="mt-2 text-[13px] leading-relaxed text-bad-fg">{error}</p>}
      </div>
    </FieldContext.Provider>
  );
}

/**
 * A text input. `trailing` is a node placed inside the right edge (a show/hide
 * button). Inside a `Field` it picks up the id and descriptions; on its own,
 * give it an `aria-label` or your own `<label>`.
 */
export const Input = forwardRef(function Input({ trailing, invalid, className, id, 'aria-describedby': describedBy, ...rest }, ref) {
  const field = useContext(FieldContext);
  const bad = invalid ?? field?.invalid;
  return (
    <div className="relative">
      <input
        ref={ref}
        id={id ?? field?.id}
        aria-invalid={bad || undefined}
        aria-describedby={describedBy ?? field?.describedBy}
        className={cx(
          'box-border min-h-[52px] w-full rounded-control border bg-surface px-4 text-base text-fg',
          'placeholder:text-fg-3 transition-colors duration-150',
          'hover:border-fg-3 disabled:cursor-not-allowed disabled:opacity-55',
          bad ? 'border-bad-fg' : 'border-line-strong',
          trailing && 'pr-20',
          className
        )}
        {...rest}
      />
      {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
    </div>
  );
});

/** A password input with a Show / Hide toggle. Takes the same props as `Input`. */
export const PasswordInput = forwardRef(function PasswordInput({ autoComplete = 'current-password', ...rest }, ref) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      ref={ref}
      type={shown ? 'text' : 'password'}
      autoComplete={autoComplete}
      trailing={(
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'}
          className="min-h-11 rounded-lg px-3 text-sm font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      )}
      {...rest}
    />
  );
});
