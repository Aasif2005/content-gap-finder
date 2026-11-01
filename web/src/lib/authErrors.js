/**
 * Firebase reports failures as `auth/...` codes. People never see those: each
 * maps to a sentence that says what happened and what to do.
 *
 * Wrong password and unknown email share one message on purpose. Telling them
 * apart would let anyone check whether an address has an account.
 *
 * The returned Error keeps a short app-level `code` so a page can react (offer
 * "Log in instead" when the email is already in use) without parsing prose.
 */

const TABLE = {
  'auth/invalid-credential': ['INVALID_CREDENTIALS', 'Invalid email or password.'],
  'auth/wrong-password': ['INVALID_CREDENTIALS', 'Invalid email or password.'],
  'auth/user-not-found': ['INVALID_CREDENTIALS', 'Invalid email or password.'],
  'auth/invalid-login-credentials': ['INVALID_CREDENTIALS', 'Invalid email or password.'],
  'auth/invalid-email': ['INVALID_EMAIL', 'Invalid email address.'],
  'auth/missing-email': ['INVALID_EMAIL', 'Enter your email address.'],
  'auth/missing-password': ['INVALID_CREDENTIALS', 'Enter your password.'],
  'auth/email-already-in-use': ['EMAIL_IN_USE', 'There is already an account with that email. Log in instead, or reset your password.'],
  'auth/weak-password': ['WEAK_PASSWORD', 'Choose a longer password: at least 6 characters.'],
  'auth/popup-closed-by-user': ['POPUP_CLOSED', 'The sign-in window was closed before it finished. Try again when you are ready.'],
  'auth/cancelled-popup-request': ['POPUP_CLOSED', 'The sign-in window was closed before it finished. Try again when you are ready.'],
  'auth/popup-blocked': ['POPUP_BLOCKED', 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'],
  'auth/too-many-requests': ['TOO_MANY_REQUESTS', 'Too many attempts. Wait a few minutes, then try again.'],
  'auth/network-request-failed': ['NETWORK', 'Check your internet connection and try again.'],
  'auth/user-disabled': ['ACCOUNT_DISABLED', 'This account has been disabled. Contact us if you think that is a mistake.'],
  'auth/requires-recent-login': ['REQUIRES_RECENT_LOGIN', 'For your security, log in again and then repeat this.'],
  'auth/account-exists-with-different-credential': ['EMAIL_IN_USE', 'That email is already used by another sign-in method. Log in the way you did before.'],
  'auth/unauthorized-domain': ['NOT_CONFIGURED', 'Sign-in is not enabled for this address yet.'],
  'auth/operation-not-allowed': ['NOT_CONFIGURED', 'This sign-in method is not turned on yet.'],
};

const FALLBACK = ['UNKNOWN', 'Something went wrong. Please try again.'];

/** Maps anything thrown by Firebase (or by us) to an Error with a plain-words message. */
export function authError(err) {
  // One of ours already (a NOT_CONFIGURED guard, a server error with its own message).
  if (err instanceof Error && err.code && !String(err.code).startsWith('auth/')) return err;
  const [code, message] = TABLE[err?.code] ?? FALLBACK;
  return Object.assign(new Error(message), { code });
}

export const notConfiguredError = () =>
  Object.assign(new Error('Accounts are not set up on this server yet.'), { code: 'NOT_CONFIGURED' });

/** Thrown before any request when the browser already knows it has no connection. */
export const offlineError = () =>
  Object.assign(new Error('You are offline. Check your internet connection and try again.'), { code: 'NETWORK' });

/** `navigator.onLine` is only believed when false: true can still mean no real internet, which Firebase reports itself. */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
