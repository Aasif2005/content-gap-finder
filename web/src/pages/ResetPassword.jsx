import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Alert, Button, Field, Input } from '../components/ui/index.js';
import AuthLayout, { AuthHeading } from '../components/auth/AuthLayout.jsx';
import { NotConfiguredAlert } from '../components/auth/NotConfiguredAlert.jsx';
import { EmailTypoHint } from '../components/auth/EmailTypoHint.jsx';
import { emailTypoFix, looksLikeEmail } from '../components/auth/helpers.js';
import { Link } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';

const back = 'inline-flex min-h-11 items-center gap-2 font-semibold text-fg underline-offset-2 hover:text-focus hover:underline';

/** Ask for a password reset link. Draws its own full-page layout (the bare shell). */
export default function ResetPassword() {
  const { configured, sendReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  const emailRef = useRef(null);
  const noticeRef = useRef(null);
  const doneRef = useRef(null);

  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);
  // The form is replaced by the confirmation; put focus there so it is read out.
  useEffect(() => { if (sentTo) doneRef.current?.focus(); }, [sentTo]);

  const off = !configured || busy;

  const submit = async (e) => {
    e.preventDefault();
    if (off) return;
    setError(null);
    setNotice(null);
    if (!email.trim()) { setError('Enter the email address you signed up with.'); emailRef.current?.focus(); return; }
    if (!looksLikeEmail(email)) { setError('Invalid email address.'); emailRef.current?.focus(); return; }
    if (emailTypoFix(email)) {
      setError(<EmailTypoHint fix={emailTypoFix(email)} onUse={(v) => { setEmail(v); setError(null); }} />);
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await sendReset(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      if (err?.code === 'INVALID_EMAIL') { setError(err.message); emailRef.current?.focus(); }
      else setNotice({ tone: 'bad', message: err?.message ?? 'Something went wrong. Please try again.' });
    }
    setBusy(false);
  };

  if (sentTo) {
    return (
      <AuthLayout brand="reset">
        <div ref={doneRef} tabIndex={-1} className="focus:outline-none">
          <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg">
            <MailCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">Check your inbox</h1>
          <p role="status" className="mt-3 text-base leading-normal text-fg-2">
            If an account exists for <span className="break-all font-medium text-fg">{sentTo}</span>, a link is on its way. It can take a minute to arrive; check spam too.
          </p>
        </div>
        <div className="mt-8 flex flex-col items-start gap-1">
          <Button variant="secondary" onClick={() => { setSentTo(null); setEmail(sentTo); }}>Use a different address</Button>
          <Link href="/login" className={`${back} mt-3`}><ArrowLeft aria-hidden className="h-4 w-4" />Back to log in</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout brand="reset" info="/reset-password">
      <AuthHeading title="Reset your password">
        Enter the email you signed up with and we’ll send you a link to choose a new password.
      </AuthHeading>

      {!configured && <NotConfiguredAlert className="mt-6" />}

      {notice && (
        <div ref={noticeRef} tabIndex={-1} className="mt-6 focus:outline-none">
          <Alert tone={notice.tone}>{notice.message}</Alert>
        </div>
      )}

      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-[18px]">
        <Field label="Email" error={error}>
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
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            disabled={!configured}
          />
        </Field>
        <Button type="submit" size="lg" className="mt-1" loading={busy} disabled={off}>
          Send reset link
        </Button>
      </form>

      <p className="mt-7 text-[15px] text-fg-2">
        <Link href="/login" className={back}><ArrowLeft aria-hidden className="h-4 w-4" />Back to log in</Link>
      </p>
      <p className="mt-6 text-[13px] leading-relaxed text-fg-3">
        Signed up with Google? There is no password to reset: log in with the Google button instead.
      </p>
    </AuthLayout>
  );
}
