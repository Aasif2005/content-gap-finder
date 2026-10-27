import { useState } from 'react';
import { Alert, Button, useToast } from '../ui/index.js';
import { useAuth } from '../../lib/auth.jsx';

/**
 * What went wrong with a run or a saved report, with the way forward for each
 * case. `error` comes from describeRunError / describeLoadError (lib/runRows.js):
 * `{ kind, tone, title, message }`.
 *
 *  - daily: the day's allowance is spent. The reset time is in the message.
 *  - verify: the email is not confirmed. Resend, or re-check after clicking the link.
 *  - quota: the site's YouTube budget. Saved reports still open.
 *  - gone: an expired or missing saved report.
 *  - generic / load: the server's own message and a retry.
 */
export function RunError({ error, signedIn, onRetry, onDismiss }) {
  const { user, resendVerification, reloadUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  const attempt = async (which, fn, after) => {
    setBusy(which);
    try { await after(await fn()); } catch (err) { toast.error(err.message); }
    setBusy(null);
  };

  let action = null;
  if (error.kind === 'verify') {
    action = (
      <>
        <Button
          variant="secondary"
          loading={busy === 'resend'}
          onClick={() => attempt('resend', resendVerification, () => toast.success(`Verification email sent to ${user?.email ?? 'your address'}.`))}
        >
          Resend email
        </Button>
        <Button
          variant="ghost"
          loading={busy === 'check'}
          onClick={() => attempt('check', reloadUser, (next) => {
            if (next?.emailVerified) { toast.success('Email verified. Press Find gaps to run it.'); onDismiss?.(); }
            else toast('Not verified yet. Open the link in the email, then try again.');
          })}
        >
          I&rsquo;ve verified
        </Button>
      </>
    );
  } else if (error.kind === 'daily' || error.kind === 'quota') {
    action = <Button variant="secondary" href="/dashboard">Open the dashboard</Button>;
  } else if (error.kind === 'gone') {
    action = signedIn
      ? <Button variant="secondary" href="/dashboard">Go to the dashboard</Button>
      : <Button href="/signup">Sign up free</Button>;
  } else if (onRetry) {
    action = <Button variant="secondary" onClick={onRetry}>Try again</Button>;
  }

  return (
    <Alert tone={error.tone} title={error.title} action={action}>
      {error.message}
    </Alert>
  );
}
