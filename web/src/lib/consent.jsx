import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog } from '../components/ui/index.js';
import { acceptConsent } from './api.js';
import { useAuth } from './auth.jsx';
import { useMe } from './me.jsx';
import { currentPathAndSearch, navigate } from './navigation.js';
import { Link } from './router.jsx';

/**
 * YouTube's API policies (III.A) require users to agree to our Terms (which
 * bind them to the YouTube Terms of Service) and to our Privacy Policy before
 * using the features that read YouTube data. Reading a shared report needs no
 * consent; starting an analysis or a "Make it" draft does.
 *
 * The agreement is stored on the account (`termsAcceptedAt`), not in the
 * browser, so it follows the person to another device. Signing up with email
 * records it already; a Google account agrees on /accept-terms right after its first sign-in.
 */

const ConsentContext = createContext(async () => true);

/**
 * `await ensureConsent()` resolves true once the account has agreed, false if
 * they close the dialog. For a logged-out visitor it sends them to log in and
 * resolves false.
 */
export const useConsent = () => useContext(ConsentContext);

/**
 * After a Google sign-in: has this account agreed to the Terms, Privacy Policy and YouTube Terms? It only reads; the
 * agreement itself is the "Agree and continue" click on /accept-terms. A returning account that agreed goes straight
 * on; a new one (or one that never agreed) is sent to that step. Any doubt (no answer) counts as not agreed, so the
 * step is never skipped.
 */
export function useAgreementStatus() {
  const { user } = useAuth();
  const { refresh } = useMe();
  // The sign-in promise can settle a beat before the new account reaches the rest of the app, and `refresh()` answers
  // null until it has: read the latest value and wait (briefly) for the account, never mistake "not ready" for an answer.
  const latest = useRef(user);
  latest.current = user;
  return useCallback(async () => {
    for (let waited = 0; !latest.current && waited < 5000; waited += 50) await new Promise((r) => setTimeout(r, 50));
    if (!latest.current) return false;
    const current = await refresh();
    return Boolean(current?.user?.termsAcceptedAt);
  }, [refresh]);
}

export function ConsentProvider({ children }) {
  const { user } = useAuth();
  const { me, refresh } = useMe();
  const [asking, setAsking] = useState(false);
  const pending = useRef([]);
  // ensureConsent is called from long-lived callbacks; read the latest values.
  const latest = useRef({});
  latest.current = { user, me, refresh };

  const ensureConsent = useCallback(async () => {
    const { user: u, me: m, refresh: reload } = latest.current;
    if (!u) {
      navigate(`/login?next=${encodeURIComponent(currentPathAndSearch())}`);
      return false;
    }
    const current = m ?? await reload();
    if (current?.user?.termsAcceptedAt) return true;
    setAsking(true);
    return new Promise((resolve) => pending.current.push(resolve));
  }, []);

  const settle = (ok) => {
    setAsking(false);
    for (const resolve of pending.current.splice(0)) resolve(ok);
  };

  return (
    <ConsentContext.Provider value={ensureConsent}>
      {children}
      <ConsentDialog open={asking} onAgreed={() => settle(true)} onCancel={() => settle(false)} refresh={refresh} />
    </ConsentContext.Provider>
  );
}

function ConsentDialog({ open, onAgreed, onCancel, refresh }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Start clean each time it opens.
  useEffect(() => { if (open) { setChecked(false); setError(null); } }, [open]);

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptConsent();
      await refresh();
      onAgreed();
    } catch (err) {
      setError(err.message || 'Could not save that. Try again.');
    }
    setBusy(false);
  };

  // A policy link opens in a new tab, so the dialog and whatever the person was
  // doing stay exactly where they are.
  const link = 'font-medium text-fg underline underline-offset-2';
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      dismissible={!busy}
      title="Before your first analysis"
      description="Please agree to continue."
      actions={(
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Not now</Button>
          <Button onClick={agree} disabled={!checked} loading={busy}>Agree and continue</Button>
        </>
      )}
    >
      <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} error={error}>
        I agree to the{' '}
        <Link href="/terms" onClick={onCancel} className={link}>Terms of Service</Link>,
        the{' '}
        <Link href="/privacy" onClick={onCancel} className={link}>Privacy Policy</Link>,
        and the{' '}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer noopener" className={link}>YouTube Terms of Service</a>.
      </Checkbox>
    </Dialog>
  );
}
