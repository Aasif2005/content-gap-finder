import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'gapstronaut-color-mode';
const query = () => matchMedia('(prefers-color-scheme: dark)');

/** The visitor's pick: 'light' (the default for a new visitor), 'dark', or 'system' (follow the OS, chosen on purpose). */
function readPick() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

// One shared store, so the nav switch and the Profile control never disagree.
let pick = readPick();
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

function apply() {
  const el = document.documentElement;
  if (pick === 'system') delete el.dataset.mode; else el.dataset.mode = pick;
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

const snapshot = () => `${pick}|${query().matches ? 'dark' : 'light'}`;

/**
 * Light/dark for the whole site. A new visitor gets light; the OS decides only
 * after they choose System (the CSS then follows prefers-color-scheme). A pick is
 * remembered and pinned on <html> as data-mode, which the theme tokens key on.
 *
 * `choice` is what they chose ('system' | 'light' | 'dark'); `mode` is what
 * they are looking at ('light' | 'dark'). `toggle` flips `mode`; `choose`
 * sets `choice` (the Profile page's three-way control).
 */
export function useColorMode() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => 'light|light');
  const [choice, system] = snap.split('|');
  const mode = choice === 'system' ? system : choice;

  const choose = useCallback((next) => {
    withFade(() => {
      pick = next === 'dark' || next === 'system' ? next : 'light';
      try {
        localStorage.setItem(KEY, pick);
      } catch { /* private mode: the pick lasts for this visit */ }
      apply();
      notify();
    });
  }, []);

  const toggle = useCallback(() => choose(mode === 'dark' ? 'light' : 'dark'), [choose, mode]);
  return { mode, choice, choose, toggle };
}
