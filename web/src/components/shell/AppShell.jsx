import { useRef, useState } from 'react';
import { LogOut, Menu as MenuIcon, User as UserIcon } from 'lucide-react';
import { SiteFooter } from '../home/SiteFooter.jsx';
import { Alert, Avatar, Button, Logo, Menu, SlideGroup, SLIDE_ITEM, ThemeToggle } from '../ui/index.js';
import { useToast } from '../ui/Toast.jsx';
import { Link, currentPathAndSearch, navigate, useRoute } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useMe } from '../../lib/me.jsx';
import { cx } from '../../lib/cx.js';
import { useScrolled } from '../../lib/useScrolled.js';
import { useVerificationWatch } from '../../lib/useVerificationWatch.js';

/**
 * `/explore` and shared niche reports are one place; `/channel` and its reports another.
 * `label` is the short name on the bar (it must stay on one line); `long` is the full name for the menu.
 */
const NAV = [
  { href: '/dashboard', label: 'Dashboard', long: 'Dashboard', active: (p) => p === '/dashboard' },
  { href: '/explore', label: 'Explore', long: 'Explore a niche', active: (p) => p === '/explore' || p.startsWith('/r/') },
  { href: '/channel', label: 'Channels', long: 'Analyze a channel', active: (p) => p === '/channel' || p.startsWith('/channel/') },
];

/** "2 of 3 analyses left", from today's usage and the person's limits. Null until /api/me has loaded. */
export function allowanceLabel(me) {
  if (!me?.usage || !me?.limits) return null;
  const left = Math.max(0, me.limits.analyses - me.usage.analyses);
  return `${left} of ${me.limits.analyses} analyses left`;
}

function VerifyStrip({ user }) {
  const { resendVerification, reloadUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  // Verifying happens on Firebase's own page, so the strip clears itself when it does.
  useVerificationWatch(() => toast.success('Email verified. You can run analyses now.'));

  const run = async (which, fn, ok) => {
    setBusy(which);
    try { await fn(); if (ok) toast.success(ok); } catch (err) { toast.error(err.message); }
    setBusy(null);
  };

  return (
    <div className="border-b border-line bg-bg">
      <div className="mx-auto max-w-[1200px] px-4 py-3 sm:px-8">
        <Alert
          tone="warn"
          title="Verify your email to run analyses."
          action={(
            <>
              <Button size="md" variant="secondary" loading={busy === 'resend'} onClick={() => run('resend', resendVerification, `Verification email sent to ${user.email}.`)}>
                Resend email
              </Button>
              <Button size="md" variant="ghost" loading={busy === 'check'} onClick={() => run('check', reloadUser)}>
                I have verified
              </Button>
            </>
          )}
        >
          We sent a link to {user.email}. Open it and this page updates by itself. Not in your inbox? Check your spam folder.
        </Alert>
      </div>
    </div>
  );
}

/**
 * The signed-in frame: floating pill bar with the logo, the three places to go, the
 * day's allowance and the account menu; an unverified-email strip when it
 * applies; the page; the footer. Light is Lunar Cream, dark is Graphite Mono (OS or the switch).
 *
 * It also copes with a logged-out visitor (a shared report link is public),
 * showing Log in and Sign up in place of the allowance and menu.
 */
/** Which top-level page a path belongs to; the entrance animation replays when this changes. */
const sectionOf = (path) => {
  if (path.startsWith('/channel')) return 'channel';
  if (path === '/explore' || path.startsWith('/r/')) return 'niche';
  return path.split('/')[1] || 'home';
};

export default function AppShell({ children }) {
  const { user, loading, signOutUser } = useAuth();
  const { me } = useMe();
  const { path } = useRoute();
  const toast = useToast();
  const allowance = allowanceLabel(me);
  const head = useRef(null);
  const { arriving } = useScrolled(head);

  const logOut = async () => {
    try { await signOutUser(); navigate('/'); } catch (err) { toast.error(err.message); }
  };
  const next = encodeURIComponent(currentPathAndSearch());

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header ref={head} className="nav-head pointer-events-none sticky top-0 z-40 px-3 sm:px-8">
        <div
          className="nav-pill nav-app pointer-events-auto relative mx-auto flex max-w-[1200px] items-center justify-between gap-x-4 rounded-full pl-5 pr-2 sm:gap-x-6 sm:pl-7"
          data-arriving={arriving || undefined}
        >
          <span aria-hidden className="nav-sheen" data-play={arriving || undefined} />
          <div className="flex items-center gap-x-9">
            <Logo href={user ? '/dashboard' : '/'} size={24} className="text-lg max-[374px]:[&>span:last-child]:sr-only" />
            {user && (
              <SlideGroup as="nav" aria-label="Main" className="hidden gap-1.5 text-[15px] md:flex" pillClassName="bg-surface-2" hoverClassName="bg-surface-2/50">
                {NAV.map((item) => {
                  const on = item.active(path);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={on ? 'page' : undefined}
                      data-slide-item
                      data-active={on}
                      className={cx(
                        SLIDE_ITEM,
                        'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 transition-colors duration-300',
                        on ? 'font-semibold text-fg' : 'text-fg-2 hover:text-fg'
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </SlideGroup>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {user && allowance && (
              <span className="nums hidden whitespace-nowrap rounded-full bg-surface-2 px-3 py-1.5 font-mono text-[13px] text-fg-2 lg:inline">{allowance}</span>
            )}
            {user && (
              // Under md the three places to go (and the allowance) fold into one menu,
              // so the bar stays a single row: wordmark, menu, avatar.
              <div className="md:hidden">
                <Menu
                  label="Navigate"
                  trigger={<span className="grid h-11 w-11 place-items-center rounded-full text-fg-2"><MenuIcon aria-hidden className="h-5 w-5" /></span>}
                  header={allowance ? <p className="nums font-mono text-[13px] text-fg-2">{allowance}</p> : null}
                  items={NAV.map((item) => ({ label: item.long, href: item.href }))}
                />
              </div>
            )}
            {/* Logged out on a small phone the bar is full; the theme follows the device there. */}
            <ThemeToggle className={user ? undefined : 'max-[419px]:hidden'} />
            {user && (
              <Menu
                label="Account"
                trigger={<Avatar user={{ ...user, photoUrl: me?.user?.photoUrl ?? user.photoUrl }} size={36} key={me?.user?.photoUrl ?? user.photoUrl ?? 'none'} />}
                header={(
                  <>
                    <p className="truncate text-[15px] font-semibold">{user.name || user.email}</p>
                    {user.name && <p className="truncate text-[13px] text-fg-3">{user.email}</p>}
                    {/* The bar shows the allowance from lg up; below that it lives here. */}
                    {allowance && <p className="nums mt-1.5 hidden font-mono text-[13px] text-fg-2 md:block lg:hidden">{allowance}</p>}
                  </>
                )}
                items={[
                  { label: 'Profile', href: '/profile', icon: <UserIcon aria-hidden className="h-4 w-4 text-fg-3" /> },
                  { label: 'Log out', onSelect: logOut, icon: <LogOut aria-hidden className="h-4 w-4 text-fg-3" /> },
                ]}
              />
            )}
            {!user && !loading && (
              <>
                <Link href={`/login?next=${next}`} className="inline-flex min-h-11 items-center px-2 text-[15px] font-medium">Log in</Link>
                <Button href="/signup" className="!rounded-full !px-4 sm:!px-5"><span className="sm:hidden">Sign up</span><span className="hidden sm:inline">Start free</span></Button>
              </>
            )}
          </div>
        </div>
      </header>

      {user?.provider === 'password' && user.emailVerified === false && <VerifyStrip user={user} />}

      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-10 pt-8 sm:px-8 sm:pt-12">
        {/* Keyed by section, so Dashboard / Niche / Channel replay the entrance but a report opening inside one does not. */}
        <div key={sectionOf(path)} className="page-enter">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}
