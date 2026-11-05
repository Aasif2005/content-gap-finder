import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  EmailAuthProvider,
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
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
import { acceptConsent, deleteMe, requestPasswordReset, requestVerificationEmail } from './api.js';
import { authError, isOffline, notConfiguredError, offlineError } from './authErrors.js';

/**
 * Who is signed in. `user` is `{ uid, email, name, photoUrl, emailVerified,
 * provider }` (provider is 'google.com' or 'password') or null.
 *
 * Every action that can fail throws an Error whose `message` is plain words
 * (never an `auth/...` code) and whose `code` is a short app-level code.
 */

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

// Our own server sends the email (own design, own sender). Where it is not set up, or
// cannot be reached, Firebase's built-in email is the fallback: a plain link beats no email.
const sendVerification = async (fb) => {
  try {
    await requestVerificationEmail();
    return;
  } catch (err) {
    if (err?.code === 'RATE_LIMITED') throw err;
  }
  await sendEmailVerification(fb, { url: `${window.location.origin}/dashboard` }).catch((err) => {
    if (err?.code === 'auth/unauthorized-continue-uri') return sendEmailVerification(fb);
    throw err;
  });
};

// A tab opened after verifying holds a token from before it, and the server trusts the token.
const refreshStaleToken = (fb) =>
  fb.getIdTokenResult().then((t) => (t.claims.email_verified === false ? fb.getIdToken(true) : null)).catch(() => {});

/** Runs a Firebase call, turning whatever it throws into a plain-words Error. */
async function guarded(fn) {
  if (!auth) throw notConfiguredError();
  if (isOffline()) throw offlineError();
  try { return await fn(auth); } catch (err) { throw authError(err); }
}

/** The real thing, loaded after first paint by auth.jsx (Firebase is most of the page's JavaScript). It draws nothing: it reports its value upward. */
export default function AuthImpl({ setUser, setLoading, onActions }) {
  // `user` and `loading` live in auth.jsx and are set from here. Keeping them one hop away (reported up
  // after this component renders) made them lag behind a sign-up page that was already moving on.
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
      if (fb?.emailVerified && providerOf(fb) === 'password') refreshStaleToken(fb);
    });
  }, []);

  const signInWithGoogle = useCallback(() => guarded(async (a) => {
    const provider = new GoogleAuthProvider();
    // Always show Google's account chooser, so a shared browser never signs someone in as
    // whichever Google account happens to be open. No password is asked for here.
    provider.setCustomParameters({ prompt: 'select_account' });
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
      await sendVerification(fb).catch(() => {}); // they can resend from the banner
      // The signup form has a required terms checkbox; this is where it is recorded.
      await acceptConsent().catch(() => {}); // not agreed here? the consent dialog asks later
      await fb.getIdToken(true); // so the token carries the display name
    } finally {
      signingUp.current = false;
      // Always, even if a step above threw after the account was created: the
      // listener skipped that sign-in and Firebase will not report it again, so
      // without this the app stays "logged out" until a reload.
      if (a.currentUser) { setUser(toUser(a.currentUser)); setLoading(false); }
    }
  }), []);

  const signInWithEmail = useCallback(({ email, password }) => guarded(async (a) => {
    await signInWithEmailAndPassword(a, email, password);
  }), []);

  const sendReset = useCallback((email) => guarded(async (a) => {
    try {
      await requestPasswordReset(email);
      return;
    } catch (err) {
      if (err?.code === 'RATE_LIMITED' || err?.code === 'VALIDATION') throw err;
      // Our mail is not set up or not reachable: fall back to Firebase's own email.
    }
    try {
      await sendPasswordResetEmail(a, email);
    } catch (err) {
      // Say "sent" for an unknown address too, so the form can't be used to probe for accounts.
      if (err?.code !== 'auth/user-not-found') throw err;
    }
  }), []);

  /** The email a reset link is for, or throws LINK_EXPIRED. */
  const verifyResetCode = useCallback((code) => guarded((a) => verifyPasswordResetCode(a, code)), []);
  const confirmReset = useCallback((code, password) => guarded((a) => confirmPasswordReset(a, code, password)), []);
  /** Applies an email-verification link, then refreshes whoever is signed in here. */
  const applyVerification = useCallback((code) => guarded(async (a) => {
    await applyActionCode(a, code);
    if (a.currentUser) {
      await a.currentUser.reload();
      await a.currentUser.getIdToken(true);
      setUser(toUser(a.currentUser));
    }
  }), []);

  const signOutUser = useCallback(() => guarded((a) => signOut(a)), []);

  const resendVerification = useCallback(() => guarded(async (a) => {
    if (!a.currentUser) throw Object.assign(new Error('Log in first.'), { code: 'AUTH_REQUIRED' });
    await sendVerification(a.currentUser);
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

  /**
   * Quiet check behind useVerificationWatch: true once the email is verified.
   * The token is only refreshed then, so polling never hits Firebase's token endpoint.
   */
  const checkVerified = useCallback(() => guarded(async (a) => {
    const fb = a.currentUser;
    if (!fb) return false;
    await fb.reload();
    if (!fb.emailVerified) return false;
    await fb.getIdToken(true);
    setUser(toUser(fb));
    return true;
  }), []);

  /**
   * Removes an unverified account, so its address is free to sign up again.
   * Resolves false, leaving the account alone, if it turns out to be verified:
   * the link may have been opened a moment ago in another tab.
   */
  const discardNewAccount = useCallback(() => guarded(async (a) => {
    const fb = a.currentUser;
    if (!fb) return true;
    await fb.reload();
    if (fb.emailVerified) {
      await fb.getIdToken(true);
      setUser(toUser(fb));
      return false;
    }
    await deleteMe().catch(() => {}); // an unverified account holds nothing worth stopping for
    try {
      await deleteUser(fb);
    } catch (err) {
      // An older session may not delete without a fresh sign-in: leaving it signed out is enough.
      if (err?.code !== 'auth/requires-recent-login') throw err;
    }
    await signOut(a).catch(() => {});
    return true;
  }), []);

  const deleteAccount = useCallback(({ password } = {}) => guarded(async (a) => {
    const fb = a.currentUser;
    if (!fb) throw Object.assign(new Error('Log in first.'), { code: 'AUTH_REQUIRED' });
    // Deleting an account needs a recent sign-in, so prove it again first.
    if (providerOf(fb) === 'google.com') {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'login', login_hint: fb.email ?? undefined }); // Google asks for the password again
      await reauthenticateWithPopup(fb, provider);
    }
    else await reauthenticateWithCredential(fb, EmailAuthProvider.credential(fb.email, password ?? ''));
    await deleteMe(); // our server's data first; the Firebase account is the last thing to go
    await deleteUser(fb);
    await signOut(a).catch(() => {});
  }), []);

  const actions = useMemo(() => ({
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    sendReset,
    verifyResetCode,
    confirmReset,
    applyVerification,
    signOutUser,
    resendVerification,
    deleteAccount,
    getIdToken,
    reloadUser,
    checkVerified,
    discardNewAccount,
  }), [signInWithGoogle, signUpWithEmail, signInWithEmail, sendReset, verifyResetCode, confirmReset, applyVerification, signOutUser, resendVerification, deleteAccount, getIdToken, reloadUser, checkVerified, discardNewAccount]);

  useEffect(() => { onActions(actions); }, [actions, onActions]);
  return null;
}
