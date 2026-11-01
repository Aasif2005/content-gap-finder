import { updateProfile } from 'firebase/auth';
import { auth } from './firebase.js';
import { authError, isOffline, notConfiguredError, offlineError } from './authErrors.js';

/**
 * Changes the signed-in person's display name in Firebase. The caller then
 * runs `reloadUser()` so the app (and the next ID token) carry the new name.
 * Throws an Error with plain words, like the actions in auth.jsx.
 */
export async function updateDisplayName(name) {
  if (!auth) throw notConfiguredError();
  if (isOffline()) throw offlineError();
  const fb = auth.currentUser;
  if (!fb) throw Object.assign(new Error('Log in first.'), { code: 'AUTH_REQUIRED' });
  try {
    await updateProfile(fb, { displayName: name });
  } catch (err) {
    throw authError(err);
  }
}
