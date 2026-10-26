import { Link } from '../../lib/router.jsx';
import { cx } from '../../lib/cx.js';

/**
 * The mark: an open ring with an amber dot. It is drawn here, not loaded, so it
 * takes the text colour and works in either theme. `variant="light"` is for a
 * dark ground that is not a themed one (it pins the colour to near-white).
 * Never combine it with YouTube branding.
 */
export function Logo({ variant = 'default', size = 26, markOnly = false, href, className }) {
  const body = (
    <>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M20.5 8.5A9 9 0 1 0 21 12" />
        <circle cx="12" cy="12" r="2.6" fill="#F6C453" stroke="none" />
      </svg>
      {!markOnly && <span style={{ fontSize: Math.round(size * 0.77) }} className="font-semibold tracking-[-0.02em]">Gapstronaut</span>}
    </>
  );
  const classes = cx('inline-flex items-center gap-2.5', variant === 'light' ? 'text-[#EEF2FA]' : 'text-fg', className);
  return href ? (
    <Link href={href} aria-label={markOnly ? 'Gapstronaut' : undefined} className={cx(classes, 'min-h-11')}>{body}</Link>
  ) : (
    <span aria-label={markOnly ? 'Gapstronaut' : undefined} className={classes}>{body}</span>
  );
}
