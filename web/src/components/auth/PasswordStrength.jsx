import { cx } from '../../lib/cx.js';
import { passwordStrength } from './helpers.js';

const BAR = ['bg-bad-fg', 'bg-bad-fg', 'bg-warn-fg', 'bg-good-fg'];

/**
 * The hint under the new-password field. Made of spans only, because `Field`
 * renders a hint inside a paragraph. Shows the standing hint until they type,
 * then a three-step bar and a plain-words reading. It is announced politely
 * and never blocks submitting.
 */
export function PasswordStrength({ password, hint }) {
  const s = passwordStrength(password);
  return (
    <span aria-live="polite" className="block">
      {s ? (
        <>
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="flex w-24 shrink-0 gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-200', i < Math.max(1, s.score) ? BAR[s.score] : 'bg-line')} />
              ))}
            </span>
            <span className="font-medium text-fg-2">{s.label}</span>
          </span>
          <span className="mt-1 block">{s.tip}</span>
        </>
      ) : hint}
    </span>
  );
}
