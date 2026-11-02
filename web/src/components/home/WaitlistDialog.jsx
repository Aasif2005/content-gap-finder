import { useEffect, useState } from 'react';
import { Button, Dialog, Field, Input } from '../ui/index.js';
import { joinWaitlist } from '../../lib/api.js';
import { EmailTypoHint } from '../auth/EmailTypoHint.jsx';
import { emailTypoFix, looksLikeEmail } from '../auth/helpers.js';

/**
 * Collects an email for a plan that is not on sale yet. `plan` is the plan
 * object being asked about (or null: closed). The body mounts only while the
 * dialog is open, so each opening starts fresh.
 */
export default function WaitlistDialog({ plan, onClose, defaultEmail = '' }) {
  const [email, setEmail] = useState(defaultEmail);
  const [company, setCompany] = useState(''); // honeypot: people leave it empty
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Each opening starts clean, with the address as it is now: sign-in may not
  // have finished when this first rendered, and a late "done" must not carry over.
  const planId = plan?.id;
  useEffect(() => {
    if (planId) { setDone(false); setError(''); setEmail(defaultEmail); }
  }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => onClose();

  const submit = async (e) => {
    e.preventDefault();
    if (!looksLikeEmail(email)) { setError('Enter a valid email address.'); return; }
    if (emailTypoFix(email)) {
      setError(<EmailTypoHint fix={emailTypoFix(email)} onUse={(v) => { setEmail(v); setError(''); }} />);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await joinWaitlist({ email: email.trim(), plan: plan.id, company });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not save that. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(plan)}
      onClose={close}
      dismissible={!busy}
      title={done ? `You're on the ${plan?.name} list` : `Join the ${plan?.name} waitlist`}
      description={done
        ? "We'll email you once, when it opens. To be taken off the list, just ask."
        : `We'll email you once, when ${plan?.name} opens. No spam, and you can ask us to remove you any time.`}
      actions={done ? <Button onClick={close}>Done</Button> : undefined}
    >
      {!done && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Email" error={error || undefined}>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
              placeholder="you@example.com"
              maxLength={254}
              autoFocus
            />
          </Field>
          {/* Honeypot: hidden from people and screen readers, filled in by bots. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>Company<input tabIndex={-1} autoComplete="off" name="company" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" loading={busy}>Join the waitlist</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
