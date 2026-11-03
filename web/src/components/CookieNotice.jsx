import { useEffect, useState } from 'react';
import { Button } from './ui/index.js';
import { Link } from '../lib/router.jsx';
import { analyticsConfigured, getConsent, setConsent, startIfConsented, SETTINGS_EVENT } from '../lib/analytics.js';

const KEY = 'gapstronaut-storage-notice';

const seen = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

/**
 * Says what the site keeps in the browser. The sign-in session and the theme are
 * not optional, so they need no choice. Google Analytics is: it loads only after
 * Accept (lib/analytics.js), and Decline is as easy to press. With no measurement
 * ID there is nothing to choose, so the notice is a plain OK.
 */
export default function CookieNotice() {
  const [open, setOpen] = useState(() => (analyticsConfigured ? getConsent() === null : !seen()));

  useEffect(() => { startIfConsented(); }, []);
  // The footer's "Cookie settings" link reopens the choice.
  useEffect(() => {
    if (!analyticsConfigured) return undefined;
    const show = () => setOpen(true);
    window.addEventListener(SETTINGS_EVENT, show);
    return () => window.removeEventListener(SETTINGS_EVENT, show);
  }, []);

  if (!open) return null;

  const close = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* blocked storage: it just shows again next visit */ }
    setOpen(false);
  };
  const choose = (granted) => { setConsent(granted); close(); };

  return (
    // On a phone it is a slim pill above the home bar, so it never covers a screenful.
    <aside aria-label="Storage notice" className="fade-in fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-5 pr-1.5 shadow-card sm:inset-x-auto sm:left-5 sm:bottom-5 sm:max-w-[420px] sm:gap-4 sm:rounded-panel sm:p-4">
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg-2 sm:text-[14px]">
        {analyticsConfigured ? (
          <>
            <span className="max-sm:hidden">We keep what signs you in. Analytics cookies only if you accept. </span>
          </>
        ) : (
          <>
            <span className="max-sm:hidden">We only store what keeps you signed in. </span>No tracking.{' '}
          </>
        )}
        <Link href="/privacy" className="inline-block font-medium text-fg underline underline-offset-2">Privacy Policy</Link>
      </p>
      {analyticsConfigured ? (
        <div className="flex shrink-0 gap-1.5">
          <Button variant="secondary" onClick={() => choose(false)} className="!rounded-full max-sm:!min-h-10 max-sm:!px-3.5">Decline</Button>
          <Button onClick={() => choose(true)} className="!rounded-full max-sm:!min-h-10 max-sm:!px-3.5">Accept</Button>
        </div>
      ) : (
        <Button onClick={close} className="shrink-0 !rounded-full max-sm:!min-h-10 max-sm:!px-4">OK</Button>
      )}
    </aside>
  );
}
