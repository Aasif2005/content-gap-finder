import { SiteFooter } from '../home/SiteFooter.jsx';
import { Button, Logo, ThemeToggle } from '../ui/index.js';
import { Link } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { cx } from '../../lib/cx.js';
import { useRef } from 'react';
import { useScrolled } from '../../lib/useScrolled.js';

/**
 * The public frame: the homepage, the legal pages, the 404. A floating pill nav
 * on top, the curved footer below. Light is Lunar Cream, dark is Graphite Mono,
 * from the OS or the switch.
 *
 *  - `anchors` is `[{ href: '#how', label: 'How it works' }]`. The in-page links
 *    appear only when given, and only from the `lg` width up: below that they would not fit on one row.
 */
export default function MarketingShell({ anchors, children }) {
  const { user, loading } = useAuth();
  const head = useRef(null);
  const { arriving } = useScrolled(head);

  // No display utility here: `hidden lg:inline-flex` below must be the only one, or the
  // anchors showed on phones (two display classes: the stylesheet order decides).
  const link = 'min-h-11 items-center text-fg-2 transition-colors hover:text-fg';
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header ref={head} className="nav-head pointer-events-none sticky top-0 z-40 px-3 sm:px-10">
        <div
          className="nav-pill pointer-events-auto relative mx-auto flex max-w-[1200px] items-center justify-between gap-x-4 rounded-full py-2 pl-5 pr-2 sm:gap-x-6 sm:pl-7"
          data-arriving={arriving || undefined}
        >
          <span aria-hidden className="nav-sheen" data-play={arriving || undefined} />
          <Logo href="/" size={26} className="text-xl max-[374px]:[&>span:last-child]:sr-only" />
          <nav aria-label="Main" className="flex items-center gap-x-2 text-[15px] sm:gap-x-8">
            {anchors?.map((a) => (
              <a key={a.href} href={a.href} className={cx(link, 'hidden whitespace-nowrap lg:inline-flex')}>{a.label}</a>
            ))}
            <ThemeToggle className="-mr-1 max-[419px]:hidden sm:-mr-4" />
            {!loading && (user ? (
              <Button href="/dashboard" className="!min-h-11 !rounded-full !px-5">Dashboard</Button>
            ) : (
              <>
                <Link href="/login" className="inline-flex min-h-11 items-center whitespace-nowrap font-medium text-fg">Log in</Link>
                <Button href="/signup" className="!rounded-full !px-4 sm:!px-5"><span className="sm:hidden">Sign up</span><span className="hidden sm:inline">Sign up free</span></Button>
              </>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}
