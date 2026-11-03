/**
 * Google Analytics, loaded only after the visitor accepts.
 *
 * Off entirely when VITE_GA_MEASUREMENT_ID is unset (local dev, tests, previews
 * without the variable), and until consent is "granted". Declining or never
 * answering loads nothing and sets no cookie. Only the path is ever sent, never
 * the query string, and report ids are masked: a report link is private to
 * whoever was given it, so it must not be handed to a third party.
 */
const ID = (import.meta.env.VITE_GA_MEASUREMENT_ID ?? '').trim();
const KEY = 'gapstronaut-analytics-consent';
export const SETTINGS_EVENT = 'gapstronaut:cookie-settings';

/** Whether App Check (lib/firebase.js) is on; the privacy policy mentions it only then. */
export const appCheckEnabled = Boolean((import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '').trim());
export const analyticsConfigured = /^G-[A-Z0-9]+$/i.test(ID);

export function getConsent() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch { return null; }
}

let loaded = false;

function load() {
  if (loaded || !analyticsConfigured) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // send_page_view off: the app is a single-page app, so views are sent per route by pageView().
  window.gtag('config', ID, { anonymize_ip: true, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
  document.head.appendChild(s);
}

/** Removes the cookies Google Analytics set, for when someone changes their mind. */
function clearCookies() {
  const hosts = [location.hostname, `.${location.hostname.replace(/^www\./, '')}`];
  for (const name of document.cookie.split(';').map((c) => c.split('=')[0].trim())) {
    if (name !== '_ga' && !name.startsWith('_ga_') && name !== '_gid') continue;
    for (const domain of hosts) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

export function setConsent(granted) {
  try { localStorage.setItem(KEY, granted ? 'granted' : 'denied'); } catch { /* blocked storage: asked again next visit */ }
  if (granted) {
    load();
    pageView(location.pathname); // the page they accepted on counts too
  } else {
    if (loaded) window[`ga-disable-${ID}`] = true;
    clearCookies();
  }
}

/** Starts analytics at page load for someone who already accepted. */
export function startIfConsented() {
  if (getConsent() === 'granted') load();
}

let lastPath = null;
const maskPath = (p) => p.replace(/^(\/(?:channel\/)?r\/)[^/]+/, '$1:id');

/** One page view per route change. No-op without consent. */
export function pageView(pathname) {
  if (!loaded || getConsent() !== 'granted') return;
  const path = maskPath(pathname);
  if (path === lastPath) return; // the router can report one navigation twice
  lastPath = path;
  window.gtag('event', 'page_view', { page_path: path, page_location: `${location.origin}${path}`, page_title: document.title });
}

export const openCookieSettings = () => window.dispatchEvent(new Event(SETTINGS_EVENT));
