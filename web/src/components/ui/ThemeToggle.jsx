import { Moon, Sun } from 'lucide-react';
import { useColorMode } from '../../lib/colorMode.js';
import { cx } from '../../lib/cx.js';

/** The round light/dark switch used in every header. */
export function ThemeToggle({ className }) {
  const { mode, toggle } = useColorMode();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-hover hover:text-fg',
        className
      )}
    >
      {mode === 'dark' ? <Sun aria-hidden className="h-5 w-5" /> : <Moon aria-hidden className="h-5 w-5" />}
    </button>
  );
}
