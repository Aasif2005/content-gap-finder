import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

/**
 * The web app's Firebase config. It is public by design: it ships in the
 * bundle, and access is controlled by Firebase's authorized domains and the
 * server's token checks, not by hiding it. Vite reads it from the root .env.
 *
 * With no config the app still renders fully, as a logged-out visitor, and
 * every sign-in call explains that accounts are not set up. Nothing throws.
 */
const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

let instance = null;
if (config.apiKey && config.projectId && config.appId) {
  try {
    instance = getAuth(initializeApp(config));
  } catch (err) {
    console.warn('[auth] Firebase could not start; continuing logged out.', err?.code ?? err?.message);
  }
}

export const auth = instance;
export const firebaseConfigured = Boolean(instance);
