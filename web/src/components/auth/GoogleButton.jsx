import { LoaderCircle } from 'lucide-react';
import { cx } from '../../lib/cx.js';

/** The four-colour Google "G". Official artwork: never recoloured. */
export function GoogleMark({ size = 18, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden className={className}>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/**
 * Google's own look: a white button, dark text, the coloured G, in either
 * theme (Google's branding rules ask for exactly this). The text is the
 * action ("Continue with Google" or "Sign up with Google").
 */
export function GoogleButton({ children, loading = false, disabled = false, className, ...rest }) {
  const off = disabled || loading;
  return (
    <button
      type="button"
      disabled={off}
      aria-busy={loading || undefined}
      className={cx(
        'relative flex min-h-[50px] w-full select-none items-center justify-center gap-3 rounded-full border border-line-strong bg-surface px-4',
        'text-base font-medium text-fg transition-colors duration-150 hover:bg-hover',
        off && 'cursor-not-allowed opacity-55 hover:bg-surface',
        className
      )}
      {...rest}
    >
      {loading && <LoaderCircle aria-hidden className="absolute h-[18px] w-[18px] animate-spin text-fg-2" />}
      <span className={cx('inline-flex items-center gap-3', loading && 'invisible')}>
        <GoogleMark />
        {children}
      </span>
    </button>
  );
}
