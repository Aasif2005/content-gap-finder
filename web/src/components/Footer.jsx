import { Link } from '../lib/router.jsx';
import { YouTubeAttribution } from './Attribution.jsx';
import { cx } from '../lib/cx.js';

/**
 * On every page: the Privacy Policy must be reachable at all times (YouTube
 * API policies III.A.2.a), and we say plainly that we are not YouTube.
 *
 * `newTab` makes the Privacy Policy and Terms open in a new tab. The signed-in
 * app uses it so reading a policy never tears down an analysis that is running.
 * `containerClassName` sets the gutters to match the page above it.
 */
export function Footer({ newTab = false, containerClassName = 'px-4 sm:px-8', className }) {
  const link = 'text-fg-2 underline-offset-2 hover:text-fg hover:underline';
  const legal = (href, label) => (newTab ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className={link}>{label}</a>
  ) : (
    <Link href={href} className={link}>{label}</Link>
  ));
  return (
    <footer className={cx('border-t border-line text-sm text-fg-3', className)}>
      <div className={cx('mx-auto max-w-[1200px] py-9', containerClassName)}>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {legal('/privacy', 'Privacy Policy')}
          {legal('/terms', 'Terms of Service')}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer noopener" className={link}>YouTube Terms of Service</a>
          <YouTubeAttribution />
        </nav>
        <p className="mt-4 max-w-2xl leading-relaxed">
          Gapstronaut uses YouTube API Services to read public videos, statistics and comments. It is not
          affiliated with, endorsed by or sponsored by YouTube or Google.
        </p>
      </div>
    </footer>
  );
}
