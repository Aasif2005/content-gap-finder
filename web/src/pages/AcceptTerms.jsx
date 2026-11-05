import { useEffect, useState } from 'react';
import { Alert, Button } from '../components/ui/index.js';
import AuthLayout, { AuthHeading } from '../components/auth/AuthLayout.jsx';
import { GoogleButton } from '../components/auth/GoogleButton.jsx';
import { LegalLinks } from '../components/auth/LegalLinks.jsx';
import { nextSuffix, safeNext } from '../components/auth/helpers.js';
import { acceptConsent } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useMe } from '../lib/me.jsx';
import { Link, navigate, useRoute } from '../lib/router.jsx';

/**
 * The agreement for people who signed in with Google. Google's own consent screen cannot carry our terms
 * or YouTube's, so this is the step right after it. Agreeing is recorded on the account (the same record the
 * email form's tick box makes); declining signs out and, for a brand-new account, removes it, then lands on
 * `?declined=1`, which says why and offers another try. YouTube's API policies (III.A) are why this exists.
 */
export default function AcceptTerms() {
  const { user, loading, configured, signInWithGoogle, declineTerms } = useAuth();
  const { me, refresh, loading: meLoading } = useMe();
  const { query } = useRoute();
  const next = query.next;
  const declined = query.declined === '1';
  const [busy, setBusy] = useState(null); // 'agree' | 'decline' | 'retry' | null
  const [error, setError] = useState(null);
  const agreed = Boolean(me?.user?.termsAcceptedAt);

  useEffect(() => {
    if (declined || loading) return;
    if (!user) navigate(`/login${nextSuffix(next)}`, { replace: true });
    else if (agreed && !busy) navigate(safeNext(next), { replace: true });
  }, [declined, loading, user, agreed, busy, next]);

  const agree = async () => {
    setBusy('agree');
    setError(null);
    try {
      await acceptConsent();
      await refresh();
      navigate(safeNext(next), { replace: true });
    } catch (err) {
      setError(err.message || 'Could not save that. Try again.');
      setBusy(null);
    }
  };

  const decline = async () => {
    setBusy('decline');
    try { await declineTerms(); } catch { /* signed out below either way */ }
    navigate(`/accept-terms?declined=1${next ? `&next=${encodeURIComponent(safeNext(next))}` : ''}`, { replace: true });
    setBusy(null);
  };

  const retry = async () => {
    setBusy('retry');
    setError(null);
    try {
      await signInWithGoogle();
      navigate(safeNext(next), { replace: true }); // the next page asks for the agreement again if it is still missing
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') setError(err.message || 'Google sign-in did not finish. Try again.');
    }
    setBusy(null);
  };

  if (declined) {
    return (
      <AuthLayout brand="paused">
        <AuthHeading title="You need to agree to continue">
          Gapstronaut reads public YouTube data, so using it means agreeing to our terms and YouTube’s. We didn’t create your account.
        </AuthHeading>
        {error && <Alert tone="bad" className="mt-6">{error}</Alert>}
        <GoogleButton className="mt-8" onClick={retry} loading={busy === 'retry'} disabled={!configured || Boolean(busy)}>
          Try again with Google
        </GoogleButton>
        <p className="mt-7 text-[15px] text-fg-2">
          Prefer email? <Link href="/signup" className="font-semibold text-fg underline underline-offset-2">Create an account</Link>
        </p>
        <p className="mt-10 text-[13px] leading-relaxed text-fg-3">Read the <LegalLinks /> first if you like.</p>
      </AuthLayout>
    );
  }

  // While the account's details are on their way, show nothing to act on: an account that already agreed would see
  // the buttons and then be sent on without a click.
  if (loading || !user || agreed || meLoading) {
    return (
      <AuthLayout brand="agree">
        <p role="status" className="text-fg-2">One moment…</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout brand="agree">
      <AuthHeading title="One more step" />
      <p className="mt-6 text-[15px] leading-relaxed text-fg">
        By continuing you agree to the <LegalLinks />.
      </p>
      {error && <Alert tone="bad" className="mt-6">{error}</Alert>}
      <div className="mt-8 flex flex-col gap-3">
        <Button size="lg" onClick={agree} loading={busy === 'agree'} disabled={Boolean(busy) && busy !== 'agree'}>Agree and continue</Button>
        <Button variant="secondary" size="lg" onClick={decline} loading={busy === 'decline'} disabled={Boolean(busy) && busy !== 'decline'}>Cancel</Button>
      </div>
    </AuthLayout>
  );
}
