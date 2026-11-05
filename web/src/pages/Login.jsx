import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Field, Input, PasswordInput } from '../components/ui/index.js';
import AuthLayout, { AuthHeading, OrDivider } from '../components/auth/AuthLayout.jsx';
import { GoogleButton } from '../components/auth/GoogleButton.jsx';
import { LegalLinks } from '../components/auth/LegalLinks.jsx';
import { NotConfiguredAlert } from '../components/auth/NotConfiguredAlert.jsx';
import { EmailTypoHint } from '../components/auth/EmailTypoHint.jsx';
import { emailTypoFix, looksLikeEmail, nextSuffix, safeNext } from '../components/auth/helpers.js';
import { Link, navigate, useRoute } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useRecordAgreement } from '../lib/consent.jsx';

const link = 'font-semibold text-fg underline underline-offset-2 hover:text-focus';

/** Log in with Google or email and password. Draws its own full-page layout (the bare shell). */
export default function Login() {
  const { user, loading, configured, signInWithGoogle, signInWithEmail } = useAuth();
  const { query } = useRoute();
  const next = query.next;
  const recordAgreement = useRecordAgreement();
  const signingIn = useRef(false); // Google sign-in in progress: stay until the agreement is recorded

  // Arriving from "Password updated": say so and have the address waiting.
  const justReset = query.reset === '1';
  const [email, setEmail] = useState(() => {
    if (!justReset) return '';
    try { return sessionStorage.getItem('gs:reset-email') ?? ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null); // { tone, message }: an error that belongs to no one field
  const [busy, setBusy] = useState(null); // 'email' | 'google' | null

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const noticeRef = useRef(null);

  // Already signed in (or just now): go where they were headed.
  useEffect(() => {
    if (!loading && user && !signingIn.current) navigate(safeNext(next), { replace: true });
  }, [loading, user, next, busy]);

  // A failed submit moves focus to the message, so a keyboard or screen reader user lands on it.
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  const off = !configured || Boolean(busy);

  const fail = (err) => {
    const code = err?.code;
    if (code === 'INVALID_EMAIL') {
      setErrors({ email: err.message });
      emailRef.current?.focus();
    } else if (code === 'INVALID_CREDENTIALS') {
      // Above the form, not under one field: it may be either, and we never say which.
      setNotice({ tone: 'bad', message: err.message });
    } else {
      setNotice({ tone: code === 'POPUP_CLOSED' ? 'warn' : 'bad', message: err?.message ?? 'Something went wrong. Please try again.' });
    }
  };

  const reset = () => { setErrors({}); setNotice(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (off) return;
    reset();
    const found = {};
    if (!email.trim()) found.email = 'Enter your email address.';
    else if (!looksLikeEmail(email)) found.email = 'Invalid email address.';
    else if (emailTypoFix(email)) {
      found.email = <EmailTypoHint fix={emailTypoFix(email)} onUse={(v) => { setEmail(v); setErrors((x) => ({ ...x, email: undefined })); }} />;
    }
    if (!password) found.password = 'Enter your password.';
    if (found.email || found.password) {
      setErrors(found);
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy('email');
    try {
      await signInWithEmail({ email: email.trim(), password });
      // The effect above takes it from here once the account is announced.
    } catch (err) {
      fail(err);
    }
    setBusy(null);
  };

  const google = async () => {
    if (off) return;
    reset();
    setBusy('google');
    signingIn.current = true;
    try {
      await signInWithGoogle();
      // The sentence under the button is the agreement (a no-op for an account that already agreed). If it could not be recorded, go straight to the agree step.
      if (!(await recordAgreement())) { signingIn.current = false; navigate(`/accept-terms${nextSuffix(next)}`, { replace: true }); setBusy(null); return; }
    } catch (err) {
      fail(err);
    }
    signingIn.current = false;
    setBusy(null);
  };

  // Signed in: the redirect is on its way. Show nothing that could be typed into.
  if (!loading && user) {
    return (
      <AuthLayout>
        <p role="status" className="text-fg-2">You’re signed in. One moment…</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeading title="Welcome back">
        Log in to run analyses and open your saved reports.
      </AuthHeading>

      {!configured && <NotConfiguredAlert className="mt-6" />}

      {justReset && !notice && <Alert tone="good" className="mt-6">Password updated. Log in with your new password.</Alert>}

      {notice && (
        <div ref={noticeRef} tabIndex={-1} className="mt-6 focus:outline-none">
          <Alert tone={notice.tone}>{notice.message}</Alert>
        </div>
      )}

      <GoogleButton className="mt-8" onClick={google} loading={busy === 'google'} disabled={off}>
        Continue with Google
      </GoogleButton>
      <p className="mt-3 text-[13px] leading-relaxed text-fg-3">New here? By continuing with Google you agree to the <LegalLinks />.</p>

      <OrDivider />

      <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
        <Field label="Email" error={errors.email}>
          <Input
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }}
            disabled={!configured}
          />
        </Field>
        <Field
          label="Password"
          error={errors.password}
          labelAction={(
            <Link href="/reset-password" className="-my-3 inline-block py-3 underline-offset-2 hover:text-fg hover:underline">
              Forgot password?
            </Link>
          )}
        >
          <PasswordInput
            ref={passwordRef}
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }}
            disabled={!configured}
          />
        </Field>
        <Button type="submit" size="lg" className="mt-1" loading={busy === 'email'} disabled={off}>
          Log in
        </Button>
      </form>

      <p className="mt-7 text-[15px] text-fg-2">
        New to Gapstronaut?{' '}
        <Link href={`/signup${nextSuffix(next)}`} className={link}>Create a free account</Link>
      </p>
      <p className="mt-10 text-[13px] leading-relaxed text-fg-3">
        By continuing you agree to the <LegalLinks terms="Terms" />.
      </p>
    </AuthLayout>
  );
}
