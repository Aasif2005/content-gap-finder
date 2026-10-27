import { useLayoutEffect } from 'react';
import { Footer } from '../Footer.jsx';
import { Button, Logo } from '../ui/index.js';
import { Link } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { cx } from '../../lib/cx.js';

/**
 * The public frame: the homepage, the legal pages, the 404.
 *
 *  - `theme="night"` pins the dark tokens (the homepage); `"day"` pins light;
 *    leave it out to follow the OS (the legal pages). A pinned theme is also set
 *    on <html>, so the overscroll area and anything portalled match.
 *  - `anchors` is `[{ href: '#how', label: 'How it works' }]`. The in-page links
 *    appear only when given, and only from the `md` width up.
 */
export default function MarketingShell({ theme, anchors, children }) {
  const { user, loading } = useAuth();

  useLayoutEffect(() => {
    if (!theme) return undefined;
    const cls = `theme-${theme}`;
    document.documentElement.classList.add(cls);
    return () => document.documentElement.classList.remove(cls);
  }, [theme]);

  // No display utility here: `hidden md:inline-flex` below must be the only one, or the
  // anchors showed on phones (two display classes: the stylesheet order decides).
  const link = 'min-h-11 items-center text-fg-2 transition-colors hover:text-fg';
  return (
    <div className={cx('flex min-h-screen flex-col bg-bg text-fg', theme && `theme-${theme}`)}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header>
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 px-5 py-4 sm:gap-x-6 sm:px-10 sm:py-7">
          <Logo href="/" size={26} className="text-xl" />
          <nav aria-label="Main" className="flex items-center gap-x-4 text-[15px] sm:gap-x-8">
            {anchors?.map((a) => (
              <a key={a.href} href={a.href} className={cx(link, 'hidden md:inline-flex')}>{a.label}</a>
            ))}
            {!loading && (user ? (
              <Button href="/dashboard" className="!min-h-11 !px-5">Dashboard</Button>
            ) : (
              <>
                <Link href="/login" className="inline-flex min-h-11 items-center whitespace-nowrap font-medium text-fg">Log in</Link>
                <Button href="/signup" className="!px-4 sm:!px-5"><span className="sm:hidden">Sign up</span><span className="hidden sm:inline">Sign up free</span></Button>
              </>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">{children}</main>

      <Footer containerClassName="px-5 sm:px-10" />
    </div>
  );
}
