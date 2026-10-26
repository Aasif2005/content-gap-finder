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

  const link = 'inline-flex min-h-11 items-center text-fg-2 transition-colors hover:text-fg';
  return (
    <div className={cx('flex min-h-screen flex-col bg-bg text-fg', theme && `theme-${theme}`)}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header>
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-5 sm:px-10 sm:py-7">
          <Logo href="/" size={26} className="text-xl" />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-8 gap-y-2 text-[15px]">
            {anchors?.map((a) => (
              <a key={a.href} href={a.href} className={cx(link, 'hidden md:inline-flex')}>{a.label}</a>
            ))}
            {!loading && (user ? (
              <Button href="/dashboard" className="!min-h-11 !px-5">Dashboard</Button>
            ) : (
              <>
                <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-fg">Log in</Link>
                <Button href="/signup" className="!px-5">Sign up free</Button>
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
