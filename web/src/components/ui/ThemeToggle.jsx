import { Moon, Sun } from 'lucide-react';
import { useColorMode } from '../../lib/colorMode.js';
import { cx } from '../../lib/cx.js';

const ICON = 'absolute h-5 w-5 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none';

/** The round light/dark switch used in every header.  */
export function ThemeToggle({ className }) {
  const { mode, toggle } = useColorMode();
  const dark = mode === 'dark';
  return (
    <button
      type="button"
      onClick={() => toggle()}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cx(
        'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-hover hover:text-fg',
        className
      )}
    >
      <Sun aria-hidden className={cx(ICON, dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0')} />
      <Moon aria-hidden className={cx(ICON, dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100')} />
    </button>
  );
}
