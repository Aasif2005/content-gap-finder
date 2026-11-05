import { useEffect, useState } from 'react';
import { Avatar, Button, useToast } from '../components/ui/index.js';
import AuthLayout, { AuthHeading } from '../components/auth/AuthLayout.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useMe } from '../lib/me.jsx';
import { Link, goBackOr, navigate } from '../lib/router.jsx';

const link = 'font-medium text-fg-2 underline underline-offset-2 hover:text-fg';

/** "Log out of Gapstronaut?": a pause before ending the session. Cancel goes back to where they were. */
export default function Logout() {
  const { user, loading, signOutUser } = useAuth();
  const { me } = useMe();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Nobody to log out: the sign-in page is the place to be.
  useEffect(() => {
    if (!loading && !user && !busy) navigate('/login', { replace: true });
  }, [loading, user, busy]);

  const logOut = async () => {
    setBusy(true);
    try {
      await signOutUser();
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <AuthLayout brand="goodbye">
        <p role="status" className="text-fg-2">One moment…</p>
      </AuthLayout>
    );
  }

  const shown = { ...user, photoUrl: me?.user?.photoUrl ?? user.photoUrl };
  const name = user.name || user.email?.split('@')[0] || 'Your account';
  return (
    <AuthLayout brand="goodbye">
      <AuthHeading title="Log out of Gapstronaut?" />
      <div className="mt-7 flex items-center gap-3.5 rounded-panel border border-line bg-surface px-4 py-3.5">
        <Avatar user={shown} size={44} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          {user.email && <p className="truncate text-sm text-fg-2">{user.email}</p>}
        </div>
      </div>
      <p className="mt-5 text-[15px] text-fg-2">You’ll need to log in again to open your reports.</p>
      <div className="mt-7 flex flex-col gap-3">
        <Button size="lg" onClick={logOut} loading={busy}>Log out</Button>
        <Button variant="secondary" size="lg" onClick={() => goBackOr('/dashboard')} disabled={busy}>Cancel</Button>
      </div>
      <p className="mt-10 text-[13px] text-fg-3">
        <Link href="/terms" className={link}>Terms of Service</Link>
        <span aria-hidden className="mx-2">|</span>
        <Link href="/privacy" className={link}>Privacy Policy</Link>
      </p>
    </AuthLayout>
  );
}
