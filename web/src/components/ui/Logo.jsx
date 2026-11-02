import { Link } from '../../lib/router.jsx';
import { cx } from '../../lib/cx.js';

/**
 * The logo: the astronaut artwork followed by the name. The `--brand-logo` token in
 * index.css picks the light or dark image, so it follows the OS, the mode switch
 * and `.theme-night` grounds exactly like the colours do. Both images have a clear
 * background. `variant="light"` is for a dark ground that is not a themed one (it
 * pins the dark-ground image and near-white text). Never combine it with YouTube branding.
 */
const DARK_GROUND_LOGO = 'url(/brand/logo-dark.webp)';

export function Logo({ variant = 'default', size = 26, markOnly = false, href, className }) {
  const mark = Math.round(size * 1.4);
  const body = (
    <>
      <span
        aria-hidden
        style={{ width: mark, height: mark, backgroundImage: variant === 'light' ? DARK_GROUND_LOGO : 'var(--brand-logo)' }}
        className="inline-block shrink-0 bg-contain bg-center bg-no-repeat"
      />
      {!markOnly && <span style={{ fontSize: Math.round(size * 0.77) }} className="font-semibold tracking-[-0.02em]">Gapstronaut</span>}
    </>
  );
  const classes = cx('inline-flex items-center gap-2.5', variant === 'light' ? 'text-[#EAF1FF]' : 'text-fg', className);
  return href ? (
    <Link href={href} aria-label={markOnly ? 'Gapstronaut' : undefined} className={cx(classes, 'min-h-11')}>{body}</Link>
  ) : (
    <span aria-label={markOnly ? 'Gapstronaut' : undefined} className={classes}>{body}</span>
  );
}
