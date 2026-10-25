import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { navigate } from './urlState.js';

/**
 * YouTube's API policies (III.A) require users to agree to our Terms -- which
 * bind them to the YouTube Terms of Service -- and to our Privacy Policy before
 * using the features that read YouTube data. Reading a shared report needs no
 * consent; starting an analysis or a "Make it" draft does.
 *
 * Remembered per browser. Bump the version when the Terms or Policy change in a
 * way people must re-accept.
 */
const KEY = 'cgf.consent.v1';

function stored() {
  try { return Boolean(window.localStorage.getItem(KEY)); } catch { return false; }
}
function remember() {
  try { window.localStorage.setItem(KEY, new Date().toISOString()); } catch { /* private mode: asked again next visit */ }
}

const ConsentContext = createContext(async () => true);

/** `await ensureConsent()` resolves true once the visitor has agreed, false if they close the dialog. */
export const useConsent = () => useContext(ConsentContext);

export function ConsentProvider({ children }) {
  const [asking, setAsking] = useState(false);
  const accepted = useRef(stored());
  const pending = useRef([]);

  const ensureConsent = useCallback(() => {
    if (accepted.current) return Promise.resolve(true);
    setAsking(true);
    return new Promise((resolve) => pending.current.push(resolve));
  }, []);

  const settle = (ok) => {
    if (ok) { accepted.current = true; remember(); }
    setAsking(false);
    for (const resolve of pending.current.splice(0)) resolve(ok);
  };

  return (
    <ConsentContext.Provider value={ensureConsent}>
      {children}
      {asking && <ConsentDialog onAccept={() => settle(true)} onCancel={() => settle(false)} />}
    </ConsentContext.Provider>
  );
}

function ConsentDialog({ onAccept, onCancel }) {
  const [checked, setChecked] = useState(false);
  const dialog = useRef(null);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal?.();
    return () => el?.close?.();
  }, []);

  // A legal link opens its page; the dialog closes without agreeing, and the
  // visitor can press the button again after reading.
  const open = (e, href) => { e.preventDefault(); onCancel(); navigate(href); };

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      aria-labelledby="consent-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-ink-200 bg-white p-0 text-ink-800 shadow-xl backdrop:bg-ink-950/50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
    >
      <div className="p-5">
        <h2 id="consent-title" className="text-base font-semibold text-ink-900 dark:text-white">Before your first analysis</h2>
        <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
          Content Gap Finder reads public videos, statistics and comments through the YouTube API Services,
          and sends comment text to an AI model to find what viewers are asking for. Saved reports are deleted after 30 days.
        </p>
        <label className="mt-4 flex items-start gap-2.5 text-sm text-ink-700 dark:text-ink-200">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-ink-900 dark:accent-white"
          />
          <span>
            I agree to the{' '}
            <a href="/terms" onClick={(e) => open(e, '/terms')} className="font-medium underline underline-offset-2">Terms of Service</a>,
            the{' '}
            <a href="/privacy" onClick={(e) => open(e, '/privacy')} className="font-medium underline underline-offset-2">Privacy Policy</a>,
            and the{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer noopener" className="font-medium underline underline-offset-2">YouTube Terms of Service</a>.
          </span>
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3 dark:border-ink-800">
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
        >
          Not now
        </button>
        <button
          onClick={onAccept}
          disabled={!checked}
          className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100"
        >
          Agree and continue
        </button>
      </div>
    </dialog>
  );
}
