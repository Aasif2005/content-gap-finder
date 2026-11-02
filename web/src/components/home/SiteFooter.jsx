import { useRef } from 'react';
import { Link } from '../../lib/router.jsx';
import { Logo } from '../ui/index.js';
import { useAuth } from '../../lib/auth.jsx';
import { YouTubeAttribution } from '../Attribution.jsx';
import { useInView } from '../../lib/useInView.js';
import { cx } from '../../lib/cx.js';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/#how', label: 'How it works' },
      { href: '/#get', label: 'What you get' },
      { href: '/#evidence', label: 'Evidence' },
      { href: '/signup', label: 'Start exploring' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
      { href: 'https://www.youtube.com/t/terms', label: 'YouTube Terms of Service', external: true },
    ],
  },
];

const link = 'inline-flex min-h-11 items-center text-[17px] text-fg-2 transition-colors hover:text-fg';

/**
 * The homepage footer: a full-width dark panel with curved top corners. As it
 * scrolls into view a soft glow warms the top edge and the columns fade up one
 * after another, slowly and once. Reduced motion shows it already in place. It keeps what the YouTube API
 * terms require: the Privacy Policy, YouTube's terms, the "developed with
 * YouTube" line and the not-affiliated notice.
 */
export function SiteFooter() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.15, rootMargin: '0px' });
  const { user } = useAuth();
  const step = (i) => ({ style: { '--i': i } });
  const account = user
    ? [{ href: '/dashboard', label: 'Dashboard' }, { href: '/explore', label: 'Explore a niche' }, { href: '/profile', label: 'Profile' }]
    : [{ href: '/login', label: 'Log in' }, { href: '/signup', label: 'Sign up' }];
  const columns = [COLUMNS[0], { title: 'Account', links: account }, COLUMNS[1]];

  return (
    <div className="theme-night mt-16 bg-transparent md:mt-24">
    <footer ref={ref} data-seen={seen} className="footer-rise relative isolate overflow-hidden rounded-t-[1.75rem] bg-surface text-fg md:rounded-t-[3rem]">
      <div aria-hidden className="footer-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" />
      <div className="mx-auto max-w-[1200px] px-6 pb-8 pt-14 sm:px-10 md:pt-24">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_repeat(3,1fr)] lg:gap-8">
          <div className="footer-item" {...step(0)}>
            <Logo href="/" size={28} className="text-xl" />
            <p className="mt-6 max-w-[280px] text-[17px] leading-[1.55] text-fg-2">
              Reads the comments under a niche’s YouTube videos and shows the questions nobody has answered.
            </p>
          </div>
          {columns.map((c, i) => (
            <nav key={c.title} aria-label={c.title} className="footer-item" {...step(i + 1)}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">{c.title}</h2>
              <ul className="mt-4 grid list-none">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noreferrer noopener" className={link}>{l.label}</a>
                    ) : (
                      <Link href={l.href} className={link}>{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className={cx('footer-item mt-16 border-t border-line pt-6 md:mt-24')} {...step(5)}>
          <div className="flex flex-col gap-3 text-sm text-fg-3 md:flex-row md:items-center md:justify-between">
            <p>© {new Date().getFullYear()} Gapstronaut</p>
            <YouTubeAttribution />
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-3">
            Gapstronaut uses YouTube API Services to read public videos, statistics and comments. It is not
            affiliated with, endorsed by or sponsored by YouTube or Google.
          </p>
        </div>
      </div>
    </footer>
    </div>
  );
}
