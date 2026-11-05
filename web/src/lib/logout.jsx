import { createContext, useCallback, useContext, useState } from 'react';
import { Avatar, Button, Dialog, useToast } from '../components/ui/index.js';
import { useAuth } from './auth.jsx';
import { useMe } from './me.jsx';
import { navigate } from './navigation.js';

/**
 * "Log out of Gapstronaut?": a small dialog over whichever screen the person is on, so ending the session is
 * never one stray click. `useLogout()` returns `requestLogout()`; the menu and the Profile page call it.
 */

const LogoutContext = createContext(() => {});
export const useLogout = () => useContext(LogoutContext);

export function LogoutProvider({ children }) {
  const [open, setOpen] = useState(false);
  const requestLogout = useCallback(() => setOpen(true), []);
  return (
    <LogoutContext.Provider value={requestLogout}>
      {children}
      <LogoutDialog open={open} onClose={() => setOpen(false)} />
    </LogoutContext.Provider>
  );
}

function LogoutDialog({ open, onClose }) {
  const { user, signOutUser } = useAuth();
  const { me } = useMe();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const logOut = async () => {
    setBusy(true);
    try {
      await signOutUser();
      onClose();
      navigate('/');
    } catch (err) {
      toast.error(err.message);
    }
    setBusy(false);
  };

  const shown = user ? { ...user, photoUrl: me?.user?.photoUrl ?? user.photoUrl } : null;
  const name = user?.name || user?.email?.split('@')[0] || 'Your account';
  return (
    <Dialog
      open={open && Boolean(user)}
      onClose={onClose}
      dismissible={!busy}
      title="Log out of Gapstronaut?"
      description="You’ll need to log in again to open your reports."
      actions={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={logOut} loading={busy}>Log out</Button>
        </>
      )}
    >
      {shown && (
        <div className="flex items-center gap-3.5 rounded-panel border border-line bg-surface px-4 py-3">
          <Avatar user={shown} size={40} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            {user.email && <p className="truncate text-sm text-fg-2">{user.email}</p>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
