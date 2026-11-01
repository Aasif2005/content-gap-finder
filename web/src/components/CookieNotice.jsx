import { useState } from 'react';
import { Button } from './ui/index.js';

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
    <aside aria-label="Storage notice" className="fade-in fixed inset-x-3 bottom-3 z-30 flex items-center gap-4 rounded-panel border border-line bg-surface p-4 shadow-card sm:inset-x-auto sm:left-5 sm:bottom-5 sm:max-w-[380px]">
      <p className="min-w-0 flex-1 text-[14px] leading-snug text-fg-2">
        We only store what keeps you signed in. No tracking.{' '}
        <a href="/privacy" target="_blank" rel="noreferrer noopener" className="inline-block font-medium text-fg underline underline-offset-2">Privacy Policy</a>
      </p>
      <Button onClick={close} className="shrink-0">OK</Button>
    </aside>
  );
}
