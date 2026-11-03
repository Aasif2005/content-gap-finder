import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

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
    const app = initializeApp(config);
    // App Check (reCAPTCHA) proves a request comes from this site, not a script, before
    // Firebase answers sign-up, sign-in or reset. Off without a site key. Enforcement is
    // switched on in the Firebase console once it has run in monitor mode.
    const siteKey = (env.VITE_RECAPTCHA_SITE_KEY ?? '').trim();
    if (siteKey) {
      if (env.DEV && env.VITE_APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN;
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
    }
    instance = getAuth(app);
  } catch (err) {
    console.warn('[auth] Firebase could not start; continuing logged out.', err?.code ?? err?.message);
  }
}

export const auth = instance;
export const firebaseConfigured = Boolean(instance);
