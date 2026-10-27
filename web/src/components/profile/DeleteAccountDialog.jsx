import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Field, Input, PasswordInput } from '../ui/index.js';
import { useToast } from '../ui/Toast.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { navigate } from '../../lib/router.jsx';
import { DELETE_WORD, deleteConfirmed } from './helpers.js';

const FORM_ID = 'delete-account-form';

function DeleteDialog({ onClose }) {
  const { user, deleteAccount } = useAuth();
  const toast = useToast();
  const usesPassword = user?.provider !== 'google.com';
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState(null); // { field: 'password' | 'confirm' | null, message }
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const errorRef = useRef(null);

  useEffect(() => {
    if (!error) return;
    if (error.field === 'password') passwordRef.current?.focus();
    else if (error.field === 'confirm') confirmRef.current?.focus();
    else errorRef.current?.focus();
  }, [error]);

  const ready = deleteConfirmed(typed) && (!usesPassword || password.length > 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setError(null);
    setBusy(true);
    try {
      await deleteAccount(usesPassword ? { password } : {});
      toast.success('Your account has been deleted.');
      navigate('/', { replace: true });
      onClose();
    } catch (err) {
      setBusy(false);
      // A wrong password comes back as "email and password don't match": say it where they typed it.
      if (err?.code === 'INVALID_CREDENTIALS') setError({ field: 'password', message: 'That password is not right. Check it and try again.' });
      else setError({ field: null, message: err?.message ?? 'We could not delete your account. Please try again.' });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!busy}
      title="Delete your account?"
      description="This removes your account, your usage history, your watches and your saved links to reports. Shared reports already made stay up until they expire, within 30 days. This can’t be undone."
      actions={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="danger" loading={busy} disabled={!ready}>Delete my account</Button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {usesPassword ? (
          <Field label="Your password" error={error?.field === 'password' ? error.message : null} hint="We ask again to be sure it is you.">
            <PasswordInput
              ref={passwordRef}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error?.field === 'password') setError(null); }}
              disabled={busy}
            />
          </Field>
        ) : (
          <p className="text-[15px] leading-relaxed text-fg-2">
            A Google window will open to confirm it is you. Allow pop-ups if your browser asks.
          </p>
        )}
        <Field label={`Type ${DELETE_WORD} to confirm`} error={error?.field === 'confirm' ? error.message : null}>
          <Input
            ref={confirmRef}
            name="confirm"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={DELETE_WORD}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
          />
        </Field>
        <div aria-live="polite" className="empty:hidden">
          {error && !error.field && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="text-[14px] leading-relaxed text-bad-fg focus:outline-none">{error.message}</p>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/** The delete flow. The form mounts only while it is open, so every opening starts blank. */
export function DeleteAccountDialog({ open, onClose }) {
  return open ? <DeleteDialog onClose={onClose} /> : null;
}
