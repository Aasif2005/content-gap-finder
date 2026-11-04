import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleCheck, MailCheck, MailX } from 'lucide-react';
import { Alert, Button, Field, PasswordInput } from '../components/ui/index.js';
import AuthLayout, { AuthHeading } from '../components/auth/AuthLayout.jsx';
import { PasswordStrength } from '../components/auth/PasswordStrength.jsx';
import { Link, navigate, useRoute } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';

export const RESET_EMAIL_KEY = 'gs:reset-email';
const REDIRECT_MS = 3000;
const back = 'inline-flex min-h-11 items-center gap-2 font-semibold text-fg underline-offset-2 hover:text-focus hover:underline';

const Icon = ({ as: I }) => (
  <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg"><I className="h-6 w-6" /></span>
);

/** A link that cannot be used (expired, used already, malformed): one way forward. */
function Dead({ verify }) {
  return (
    <AuthLayout>
      <Icon as={MailX} />
      <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">This link has expired</h1>
      <p role="status" className="mt-3 text-base leading-normal text-fg-2">
        {verify
          ? 'It was already used, or is out of date. Log in and we’ll send you a fresh one.'
          : 'Reset links work once and last an hour. Request a new one and it will be on its way.'}
      </p>
      <div className="mt-8 flex flex-col items-start gap-1">
        <Button size="lg" href={verify ? '/login' : '/reset-password'}>{verify ? 'Log in' : 'Request a new link'}</Button>
        <Link href="/login" className={`${back} mt-3`}><ArrowLeft aria-hidden className="h-4 w-4" />Back to log in</Link>
      </div>
    </AuthLayout>
  );
}

/** Choose a new password from the emailed link. */
function ChoosePassword({ code }) {
  const { verifyResetCode, confirmReset } = useAuth();
  const [phase, setPhase] = useState('checking'); // checking | form | done | dead
  const [forEmail, setForEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const doneRef = useRef(null);

  useEffect(() => {
    let alive = true;
    verifyResetCode(code)
      .then((email) => { if (alive) { setForEmail(email); setPhase('form'); } })
      .catch((err) => { if (alive) { if (err?.code === 'LINK_EXPIRED') setPhase('dead'); else { setNotice({ tone: 'bad', message: err?.message }); setPhase('form'); } } });
    return () => { alive = false; };
  }, [code, verifyResetCode]);

  useEffect(() => { if (phase === 'form') inputRef.current?.focus(); }, [phase]);
  useEffect(() => { if (phase === 'done') doneRef.current?.focus(); }, [phase]);

  // After saving, go to log in (with the email waiting): they prove the new password works.
  useEffect(() => {
    if (phase !== 'done') return undefined;
    const t = setTimeout(() => navigate('/login?reset=1', { replace: true }), REDIRECT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    if (password.length < 8) { setError('Use at least 8 characters.'); inputRef.current?.focus(); return; }
    setBusy(true);
    try {
      await confirmReset(code, password);
      try { sessionStorage.setItem(RESET_EMAIL_KEY, forEmail); } catch { /* the login page just starts empty */ }
      setPhase('done');
    } catch (err) {
      if (err?.code === 'LINK_EXPIRED') setPhase('dead');
      else if (err?.code === 'WEAK_PASSWORD') { setError('Use at least 8 characters.'); inputRef.current?.focus(); }
      else setNotice({ tone: 'bad', message: err?.message ?? 'Something went wrong. Please try again.' });
    }
    setBusy(false);
  };

  if (phase === 'dead') return <Dead />;
  if (phase === 'checking') return <AuthLayout><p role="status" className="text-fg-2">Checking your link…</p></AuthLayout>;

  if (phase === 'done') {
    return (
      <AuthLayout>
        <div ref={doneRef} tabIndex={-1} className="focus:outline-none">
          <Icon as={CircleCheck} />
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">Password updated</h1>
          <p role="status" className="mt-3 text-base leading-normal text-fg-2">Taking you to log in with your new password…</p>
        </div>
        <div className="mt-8">
          <Button size="lg" onClick={() => navigate('/login?reset=1', { replace: true })}>Log in now</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeading title="Choose a new password">
        for <span className="break-all font-medium text-fg">{forEmail}</span>
      </AuthHeading>
      {notice && <div className="mt-6"><Alert tone={notice.tone}>{notice.message}</Alert></div>}
      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-[18px]">
        <Field label="New password" error={error} hint={<PasswordStrength password={password} hint="Use 8 or more characters." />}>
          <PasswordInput
            ref={inputRef}
            name="new-password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
          />
        </Field>
        <Button type="submit" size="lg" className="mt-1" loading={busy}>Save password</Button>
      </form>
    </AuthLayout>
  );
}

/** Confirm an email address from the emailed link. */
function ConfirmEmail({ code }) {
  const { applyVerification, user } = useAuth();
  const [phase, setPhase] = useState('working'); // working | done | dead
  const [message, setMessage] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // a code works once: StrictMode must not spend it twice
    ran.current = true;
    applyVerification(code)
      .then(() => setPhase('done'))
      .catch((err) => { if (err?.code === 'LINK_EXPIRED') setPhase('dead'); else { setMessage(err?.message); setPhase('dead'); } });
  }, [code, applyVerification]);

  if (phase === 'working') return <AuthLayout><p role="status" className="text-fg-2">Confirming your email…</p></AuthLayout>;
  if (phase === 'dead') return message ? <AuthLayout><Alert tone="bad">{message}</Alert></AuthLayout> : <Dead verify />;
  return (
    <AuthLayout>
      <Icon as={MailCheck} />
      <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">Email confirmed</h1>
      <p role="status" className="mt-3 text-base leading-normal text-fg-2">Your address is verified. {user ? 'You’re ready to go.' : 'Log in to get started.'}</p>
      <div className="mt-8">
        <Button size="lg" onClick={() => navigate(user ? '/dashboard' : '/login', { replace: true })}>{user ? 'Go to your dashboard' : 'Log in'}</Button>
      </div>
    </AuthLayout>
  );
}

/** Where emailed account links land (password reset, email verification). Replaces Firebase's hosted pages. */
export default function AuthAction() {
  const { query } = useRoute();
  const { mode, oobCode } = query;
  if (!oobCode) return <Dead verify={mode === 'verifyEmail'} />;
  if (mode === 'resetPassword') return <ChoosePassword code={oobCode} />;
  if (mode === 'verifyEmail') return <ConfirmEmail code={oobCode} />;
  return <Dead />;
}
