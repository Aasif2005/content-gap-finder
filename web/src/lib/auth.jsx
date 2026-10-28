import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase.js';
import { acceptConsent, deleteMe, setTokenGetter } from './api.js';
import { authError, notConfiguredError } from './authErrors.js';

/**
 * Who is signed in. `user` is `{ uid, email, name, photoUrl, emailVerified,
 * provider }` (provider is 'google.com' or 'password') or null.
 *
 * Every action that can fail throws an Error whose `message` is plain words
 * (never an `auth/...` code) and whose `code` is a short app-level code.
 */

// api.js asks for a token through this, so it needs no import of this module.
// Registered at load, not in an effect: a child's first fetch runs before its
// parent's effects do.
setTokenGetter(async () => (auth?.currentUser ? auth.currentUser.getIdToken() : null));

const providerOf = (fb) => (fb.providerData.some((p) => p.providerId === 'google.com') ? 'google.com' : 'password');

const toUser = (fb) => fb && ({
  uid: fb.uid,
  email: fb.email,
  name: fb.displayName ?? '',
  photoUrl: fb.photoURL ?? null,
  emailVerified: fb.emailVerified,
  provider: providerOf(fb),
  // Firebase knows when the account was made, so the profile page need not wait for our server.
  createdAt: fb.metadata?.creationTime ? new Date(fb.metadata.creationTime).toISOString() : null,
});

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

/** Runs a Firebase call, turning whatever it throws into a plain-words Error. */
async function guarded(fn) {
  if (!auth) throw notConfiguredError();
  try { return await fn(auth); } catch (err) { throw authError(err); }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  // While a sign-up is in flight the account exists but its terms are not yet
  // recorded. Announcing the user early would let the app fetch /api/me and
  // find no consent, then ask for it again a moment later.
  const signingUp = useRef(false);

  useEffect(() => {
    if (!auth) return undefined;
    // A Google sign-in that fell back to a redirect finishes here on return.
    // onAuthStateChanged reports the user either way; this only drains the result.
    getRedirectResult(auth).catch(() => {});
    return onAuthStateChanged(auth, (fb) => {
      if (signingUp.current) return;
      setUser(toUser(fb));
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = useCallback(() => guarded(async (a) => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(a, provider);
    } catch (err) {
      // A blocked popup is common on mobile and in in-app browsers; a full-page
      // redirect always works. The page reloads signed in, so nothing returns.
      if (err?.code === 'auth/popup-blocked') { await signInWithRedirect(a, provider); return; }
      throw err;
    }
  }), []);

  const signUpWithEmail = useCallback(({ name, email, password }) => guarded(async (a) => {
    signingUp.current = true;
    try {
      const { user: fb } = await createUserWithEmailAndPassword(a, email, password);
      if (name) await updateProfile(fb, { displayName: name.trim() });
      await sendEmailVerification(fb).catch(() => {}); // they can resend from the banner
      // The signup form has a required terms checkbox; this is where it is recorded.
      await acceptConsent().catch(() => {}); // not agreed here? the consent dialog asks later
      await fb.getIdToken(true); // so the token carries the display name
      setUser(toUser(fb));
      setLoading(false);
    } finally {
      signingUp.current = false;
    }
  }), []);

  const signInWithEmail = useCallback(({ email, password }) => guarded(async (a) => {
    await signInWithEmailAndPassword(a, email, password);
  }), []);

  const sendReset = useCallback((email) => guarded(async (a) => {
    try {
      await sendPasswordResetEmail(a, email);
    } catch (err) {
      // Say "sent" for an unknown address too, so the form can't be used to probe for accounts.
      if (err?.code !== 'auth/user-not-found') throw err;
    }
  }), []);

  const signOutUser = useCallback(() => guarded((a) => signOut(a)), []);

  const resendVerification = useCallback(() => guarded(async (a) => {
    if (!a.currentUser) throw Object.assign(new Error('Log in first.'), { code: 'AUTH_REQUIRED' });
    await sendEmailVerification(a.currentUser);
  }), []);

  const getIdToken = useCallback(async (forceRefresh = false) => (
    auth?.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null
  ), []);

  /** Re-reads the account from Firebase, e.g. after they clicked the verification link in another tab. */
  const reloadUser = useCallback(() => guarded(async (a) => {
    if (!a.currentUser) return null;
    await a.currentUser.reload();
    await a.currentUser.getIdToken(true); // the server reads email_verified from the token
    const next = toUser(a.currentUser);
    setUser(next);
    return next;
  }), []);

  const deleteAccount = useCallback(({ password } = {}) => guarded(async (a) => {
    const fb = a.currentUser;
    if (!fb) throw Object.assign(new Error('Log in first.'), { code: 'AUTH_REQUIRED' });
    // Deleting an account needs a recent sign-in, so prove it again first.
    if (providerOf(fb) === 'google.com') await reauthenticateWithPopup(fb, new GoogleAuthProvider());
    else await reauthenticateWithCredential(fb, EmailAuthProvider.credential(fb.email, password ?? ''));
    await deleteMe(); // our server's data first; the Firebase account is the last thing to go
    await deleteUser(fb);
    await signOut(a).catch(() => {});
  }), []);

  const value = useMemo(() => ({
    user,
    loading,
    configured: firebaseConfigured,
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    sendReset,
    signOutUser,
    resendVerification,
    deleteAccount,
    getIdToken,
    reloadUser,
  }), [user, loading, signInWithGoogle, signUpWithEmail, signInWithEmail, sendReset, signOutUser, resendVerification, deleteAccount, getIdToken, reloadUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
