import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cx } from '../../lib/cx.js';

/**
 * Brief messages that confirm something happened ("Email sent") without
 * taking the page over. `const toast = useToast()`:
 *
 *   toast('Saved')                      // neutral
 *   toast.success('Verification email sent')
 *   toast.error("Couldn't send it. Try again.")
 *   toast('Text', { tone, duration })   // duration in ms; 0 keeps it until dismissed
 *
 * Errors stay a little longer. Hovering or focusing a toast pauses its timer.
 */

const ToastContext = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

const ICONS = { info: Info, success: CircleCheck, error: CircleAlert };
const ICON_TONE = { info: 'text-fg-2', success: 'text-good-fg', error: 'text-bad-fg' };

function ToastItem({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || !toast.duration) return undefined;
    const t = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [paused, toast, onDismiss]);

  const Icon = ICONS[toast.tone] ?? Info;
  return (
    <li
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="fade-in pointer-events-auto flex items-start gap-3 rounded-panel border border-line bg-surface py-1 pl-4 pr-1 text-[15px] shadow-[0_12px_32px_-12px_rgb(15_30_46/0.35)]"
    >
      <Icon aria-hidden className={cx('mt-3 h-[18px] w-[18px] shrink-0', ICON_TONE[toast.tone])} />
      <p className="min-w-0 flex-1 py-2.5 leading-snug text-fg">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-hover hover:text-fg"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </li>
  );
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const next = useRef(0);

  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const toast = useMemo(() => {
    const show = (message, { tone = 'info', duration } = {}) => {
      const id = ++next.current;
      const ms = duration ?? (tone === 'error' ? 8000 : 5000);
      setItems((list) => [...list.slice(-3), { id, message, tone, duration: ms }]);
      return id;
    };
    show.success = (message, opts) => show(message, { ...opts, tone: 'success' });
    show.error = (message, opts) => show(message, { ...opts, tone: 'error' });
    show.dismiss = dismiss;
    return show;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ol
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] m-0 flex list-none flex-col items-center gap-2 p-0 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] sm:items-stretch"
      >
        {items.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
      </ol>
    </ToastContext.Provider>
  );
}
