import { useState } from 'react';
import { Button } from './ui/index.js';
import { Link } from '../lib/router.jsx';

const KEY = 'gapstronaut-storage-notice';

const seen = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

/**
 * Says what the site keeps in the browser. Nothing here is optional (a sign-in
 * session and the theme), so there is nothing to accept or refuse; adding
 * analytics would make this a real consent choice.
 */
export default function CookieNotice() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;

  const close = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* blocked storage: it just shows again next visit */ }
    setOpen(false);
  };

  return (
    // On a phone it is a slim pill above the home bar, so it never covers a screenful.
    <aside aria-label="Storage notice" className="fade-in fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-5 pr-1.5 shadow-card sm:inset-x-auto sm:left-5 sm:bottom-5 sm:max-w-[380px] sm:gap-4 sm:rounded-panel sm:p-4">
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg-2 sm:text-[14px]">
        <span className="max-sm:hidden">We only store what keeps you signed in. </span>No tracking.{' '}
        <Link href="/privacy" className="inline-block font-medium text-fg underline underline-offset-2">Privacy Policy</Link>
      </p>
      <Button onClick={close} className="shrink-0 !rounded-full max-sm:!min-h-10 max-sm:!px-4">OK</Button>
    </aside>
  );
}
