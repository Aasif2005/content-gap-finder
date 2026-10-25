import { navigate } from '../lib/urlState.js';
import { YouTubeAttribution } from './Attribution.jsx';

/**
 * On every page: the Privacy Policy must be reachable at all times (YouTube
 * API policies III.A.2.a), and we say plainly that we are not YouTube.
 */
export function Footer() {
  const link = 'underline-offset-2 hover:text-ink-800 hover:underline dark:hover:text-ink-200';
  const go = (href) => (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };
  return (
    <footer className="mt-16 border-t border-ink-200 pt-5 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
      <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a href="/privacy" onClick={go('/privacy')} className={link}>Privacy Policy</a>
        <a href="/terms" onClick={go('/terms')} className={link}>Terms of Service</a>
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer noopener" className={link}>YouTube Terms of Service</a>
        <YouTubeAttribution />
      </nav>
      <p className="mt-2 max-w-2xl leading-relaxed">
        Content Gap Finder uses YouTube API Services to read public videos, statistics and comments. It is not
        affiliated with, endorsed by or sponsored by YouTube or Google.
      </p>
    </footer>
  );
}
