import { useEffect, useRef, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Alert, Button, Checkbox, Field, Input, PasswordInput, useToast } from '../components/ui/index.js';
import AuthLayout, { AuthHeading, OrDivider } from '../components/auth/AuthLayout.jsx';
import { GoogleButton } from '../components/auth/GoogleButton.jsx';
import { LegalLinks } from '../components/auth/LegalLinks.jsx';
import { NotConfiguredAlert } from '../components/auth/NotConfiguredAlert.jsx';
import { PasswordStrength } from '../components/auth/PasswordStrength.jsx';
import { useCooldown } from '../components/auth/useCooldown.js';
import { MIN_PASSWORD, looksLikeEmail, nextSuffix, passwordStrength, welcomeNext } from '../components/auth/helpers.js';
import { Link, navigate, useRoute } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useMe } from '../lib/me.jsx';
import { acceptConsent } from '../lib/api.js';

const link = 'font-semibold text-fg underline underline-offset-2 hover:text-focus';

/**
 * After the account exists: "check your inbox", in place of the form. They can
 * resend the link (with a cooldown) and carry on once it is verified. Until
 * then they may still look around; running analyses needs a verified email.
 */
function CheckInbox({ email, onContinue }) {
  const { resendVerification, reloadUser, user } = useAuth();
  const toast = useToast();
  const cooldown = useCooldown(30);
  const [busy, setBusy] = useState(null); // 'resend' | 'check' | null
  const [status, setStatus] = useState(null); // { tone, message } for the live region
  const verified = Boolean(user?.emailVerified);

  // Cooldown starts as soon as the first email has gone out.
  const { start } = cooldown;
  useEffect(() => { start(); }, [start]);

  // They usually verify in another tab; when they come back, look again without being asked.
  useEffect(() => {
    if (verified) return undefined;
    const onFocus = () => { reloadUser().catch(() => {}); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [verified, reloadUser]);

  const resend = async () => {
    setBusy('resend');
    setStatus(null);
    try {
      await resendVerification();
      cooldown.start();
      setStatus({ tone: 'good', message: `Sent again to ${email}. It can take a minute to arrive; check spam too.` });
      toast.success('Verification email sent.');
    } catch (err) {
      setStatus({ tone: 'bad', message: err.message });
    }
    setBusy(null);
  };

  const proceed = async () => {
    setBusy('check');
    setStatus(null);
    try {
      const fresh = await reloadUser();
      if (fresh?.emailVerified) { onContinue(); return; }
      setStatus({ tone: 'warn', message: 'We can’t see the verification yet. Open the link in the email we sent, then press Continue again.' });
    } catch (err) {
      setStatus({ tone: 'bad', message: err.message });
    }
    setBusy(null);
  };

  return (
    <div>
      <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg">
        <MailCheck className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">
        {verified ? 'Email verified' : 'Check your inbox'}
      </h1>
      <p className="mt-3 text-base leading-normal text-fg-2">
        {verified ? (
          <>Thanks. <span className="break-all font-medium text-fg">{email}</span> is confirmed and your account is ready.</>
        ) : (
          <>We sent a link to <span className="break-all font-medium text-fg">{email}</span>. Open it to verify your address. You need to verify before you can run analyses.</>
        )}
      </p>

      <div aria-live="polite" className="mt-5 empty:hidden">
        {status && <Alert tone={status.tone}>{status.message}</Alert>}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <Button size="lg" onClick={proceed} loading={busy === 'check'} disabled={busy === 'resend'}>
          Continue to your dashboard
        </Button>
        {!verified && (
          <Button variant="secondary" size="lg" onClick={resend} loading={busy === 'resend'} disabled={cooldown.active || busy === 'check'}>
            {cooldown.active ? `Resend email in ${cooldown.left}s` : 'Resend email'}
          </Button>
        )}
      </div>

      {!verified && (
        <p className="mt-6 text-[15px] leading-relaxed text-fg-2">
          Not there? Check spam, or make sure {email} is the right address.{' '}
          <button type="button" onClick={onContinue} className={link}>Skip for now</button>
          {' '}to look around; analyses stay locked until it is verified.
        </p>
      )}
    </div>
  );
}

/** Create an account with email or Google. Draws its own full-page layout (the bare shell). */
export default function Signup() {
  const { user, loading, configured, signInWithGoogle, signUpWithEmail } = useAuth();
  const { refresh } = useMe();
  const { query } = useRoute();
  const next = query.next;
  const goNext = () => navigate(welcomeNext(next), { replace: true });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null); // 'email' | 'google' | null
  const [sentTo, setSentTo] = useState(null); // the address we emailed, once the account exists

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const agreeRef = useRef(null);
  const noticeRef = useRef(null);
  // While we create the account the user appears before we are ready to leave
  // the page (the "check your inbox" state, the consent record), so the
  // already-signed-in redirect stands down.
  const holding = useRef(false);

  useEffect(() => {
    if (!loading && user && !holding.current && !sentTo) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, sentTo, next]);

  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  const off = !configured || Boolean(busy);
  const clear = (key) => setErrors((x) => ({ ...x, [key]: undefined }));

  const fail = (err) => {
    const code = err?.code;
    if (code === 'EMAIL_IN_USE') {
      setErrors({ email: (
        <>
          There is already an account with that email.{' '}
          <Link href={`/login${nextSuffix(next)}`} className="font-semibold underline underline-offset-2">Log in</Link>
          {' '}instead, or{' '}
          <Link href="/reset-password" className="font-semibold underline underline-offset-2">reset your password</Link>.
        </>
      ) });
      emailRef.current?.focus();
    } else if (code === 'INVALID_EMAIL') {
      setErrors({ email: err.message });
      emailRef.current?.focus();
    } else if (code === 'WEAK_PASSWORD') {
      setErrors({ password: err.message });
      passwordRef.current?.focus();
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
    if (!name.trim()) found.name = 'Enter your name, so we know what to call you.';
    if (!email.trim()) found.email = 'Enter your email address.';
    else if (!looksLikeEmail(email)) found.email = 'That does not look like an email address. Check it for typos.';
    if (!password) found.password = 'Choose a password.';
    else if (password.length < MIN_PASSWORD) found.password = `Choose a longer password: at least ${MIN_PASSWORD} characters.`;
    if (!agree) found.agree = 'Tick the box to agree before you create an account.';
    const first = [['name', nameRef], ['email', emailRef], ['password', passwordRef], ['agree', agreeRef]].find(([k]) => found[k]);
    if (first) {
      setErrors(found);
      first[1].current?.focus();
      return;
    }
    setBusy('email');
    holding.current = true;
    try {
      await signUpWithEmail({ name: name.trim(), email: email.trim(), password });
      setSentTo(email.trim());
    } catch (err) {
      fail(err);
    }
    holding.current = false;
    setBusy(null);
  };

  const google = async () => {
    if (off) return;
    reset();
    setBusy('google');
    holding.current = true;
    try {
      await signInWithGoogle();
      // They ticked the box, so record it now rather than asking again later.
      // Failing here is fine: the app asks at the first analysis.
      await acceptConsent().catch(() => {});
      await refresh();
      goNext();
    } catch (err) {
      fail(err);
    }
    holding.current = false;
    setBusy(null);
  };

  if (sentTo) {
    return (
      <AuthLayout brand="benefits">
        <CheckInbox email={sentTo} onContinue={goNext} />
      </AuthLayout>
    );
  }

  if (!loading && user && !busy) {
    return (
      <AuthLayout brand="benefits">
        <p role="status" className="text-fg-2">You’re signed in. One moment…</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout brand="benefits">
      <AuthHeading title="Create your account">No card needed. Takes under a minute.</AuthHeading>

      {!configured && <NotConfiguredAlert className="mt-6" />}

      {notice && (
        <div ref={noticeRef} tabIndex={-1} className="mt-6 focus:outline-none">
          <Alert tone={notice.tone}>{notice.message}</Alert>
        </div>
      )}

      <GoogleButton
        className="mt-7"
        onClick={google}
        loading={busy === 'google'}
        disabled={off || !agree}
        aria-describedby={!agree ? 'google-hint' : undefined}
      >
        Sign up with Google
      </GoogleButton>
      <p id="google-hint" aria-live="polite" className="mt-2 text-[13px] text-fg-3 empty:hidden">
        {configured && !agree ? 'Tick the agreement below to use Google.' : null}
      </p>

      <OrDivider />

      <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
        <Field label="Name" error={errors.name}>
          <Input
            ref={nameRef}
            name="name"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => { setName(e.target.value); clear('name'); }}
            disabled={!configured}
          />
        </Field>
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
            onChange={(e) => { setEmail(e.target.value); clear('email'); }}
            disabled={!configured}
          />
        </Field>
        <Field
          label="Password"
          error={errors.password}
          hint={<PasswordStrength password={password} hint="Use 8 or more characters. We’ll email you a link to verify your address." />}
        >
          <PasswordInput
            ref={passwordRef}
            name="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clear('password'); }}
            disabled={!configured}
          />
        </Field>

        <Checkbox
          ref={agreeRef}
          checked={agree}
          onChange={(e) => { setAgree(e.target.checked); clear('agree'); }}
          error={errors.agree}
          disabled={!configured}
          className="-my-2"
        >
          I agree to the <LegalLinks />.
        </Checkbox>

        <Button type="submit" size="lg" className="mt-1" loading={busy === 'email'} disabled={off}>
          Create account
        </Button>
      </form>

      <p className="mt-7 text-[15px] text-fg-2">
        Already have an account?{' '}
        <Link href={`/login${nextSuffix(next)}`} className={link}>Log in</Link>
      </p>
    </AuthLayout>
  );
}
