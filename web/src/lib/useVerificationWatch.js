import { useEffect, useRef } from 'react';
import { useAuth } from './auth.jsx';

const EVERY_MS = 4000;
// Nobody waits this long on purpose. Coming back to the tab still checks.
const POLL_FOR_MS = 15 * 60 * 1000;

/**
 * Notices when the signed-in email becomes verified, which happens on Firebase's
 * own page, often in another tab or on a phone. Polls only while this tab is
 * visible, and checks at once when the person comes back to it. `onVerified`
 * also runs when the verified state has already unmounted the caller.
 */
export function useVerificationWatch(onVerified, { enabled = true } = {}) {
  const { checkVerified } = useAuth();
  const latest = useRef(onVerified);
  latest.current = onVerified;

  useEffect(() => {
    if (!enabled) return undefined;
    const startedAt = Date.now();
    let done = false;
    let checking = false;

    const check = async () => {
      if (done || checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        if (await checkVerified()) {
          done = true;
          latest.current?.();
        }
      } catch { /* offline for a moment: the next check tries again */ }
      checking = false;
    };

    const timer = setInterval(() => { if (Date.now() - startedAt < POLL_FOR_MS) check(); }, EVERY_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      done = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled, checkVerified]);
}
