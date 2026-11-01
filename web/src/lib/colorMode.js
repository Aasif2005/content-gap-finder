import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'gapstronaut-color-mode';
const query = () => matchMedia('(prefers-color-scheme: dark)');

/** The visitor's pick: 'light', 'dark', or null for "follow the OS". */
function readPick() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

// One shared store, so the nav switch and the Profile control never disagree.
let pick = readPick();
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

function apply() {
  const el = document.documentElement;
  if (pick) el.dataset.mode = pick; else delete el.dataset.mode;
}
apply();

/**
 * Runs a mode change as a soft cross-fade (the View Transitions API; the styles are
 * in index.css). The theme is all CSS variables, so the change itself is synchronous
 * and both snapshots are exact. Without the API, or with reduced motion, it just changes.
 */
function withFade(change) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof document.startViewTransition !== 'function') { change(); return; }
  document.startViewTransition(change);
}

function subscribe(listener) {
  listeners.add(listener);
  const mq = query();
  mq.addEventListener('change', listener);
  return () => { listeners.delete(listener); mq.removeEventListener('change', listener); };
}

const snapshot = () => `${pick ?? 'system'}|${query().matches ? 'dark' : 'light'}`;

/**
 * Light/dark for the whole site. Until the visitor picks one the OS decides
 * (the CSS follows prefers-color-scheme); a pick is remembered and pinned on
 * <html> as data-mode, which the theme tokens key on.
 *
 * `choice` is what they chose ('system' | 'light' | 'dark'); `mode` is what
 * they are looking at ('light' | 'dark'). `toggle` flips `mode`; `choose`
 * sets `choice` (the Profile page's three-way control).
 */
export function useColorMode() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => 'system|light');
  const [choice, system] = snap.split('|');
  const mode = choice === 'system' ? system : choice;

  const choose = useCallback((next) => {
    withFade(() => {
      pick = next === 'light' || next === 'dark' ? next : null;
      try {
        if (pick) localStorage.setItem(KEY, pick); else localStorage.removeItem(KEY);
      } catch { /* private mode: the pick lasts for this visit */ }
      apply();
      notify();
    });
  }, []);

  const toggle = useCallback(() => choose(mode === 'dark' ? 'light' : 'dark'), [choose, mode]);
  return { mode, choice, choose, toggle };
}
