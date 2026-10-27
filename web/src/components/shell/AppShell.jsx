import { useState } from 'react';
import { LogOut, Menu as MenuIcon, User as UserIcon } from 'lucide-react';
import { Footer } from '../Footer.jsx';
import { Alert, Avatar, Button, Logo, Menu } from '../ui/index.js';
import { useToast } from '../ui/Toast.jsx';
import { Link, currentPathAndSearch, navigate, useRoute } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useMe } from '../../lib/me.jsx';
import { cx } from '../../lib/cx.js';

/** `/explore` and shared niche reports are one place; `/channel` and its reports another. */
const NAV = [
  { href: '/dashboard', label: 'Dashboard', active: (p) => p === '/dashboard' },
  { href: '/explore', label: 'Explore a niche', active: (p) => p === '/explore' || p.startsWith('/r/') },
  { href: '/channel', label: 'Analyze a channel', active: (p) => p === '/channel' || p.startsWith('/channel/') },
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
          We sent a link to {user.email}. Open it, then come back here.
        </Alert>
      </div>
    </div>
  );
}

/**
 * The signed-in frame: top bar with the logo, the three places to go, the
 * day's allowance and the account menu; an unverified-email strip when it
 * applies; the page; the footer. It has no theme class, so it follows the OS.
 *
 * It also copes with a logged-out visitor (a shared report link is public),
 * showing Log in and Sign up in place of the allowance and menu.
 */
export default function AppShell({ children }) {
  const { user, loading, signOutUser } = useAuth();
  const { me } = useMe();
  const { path } = useRoute();
  const toast = useToast();
  const allowance = allowanceLabel(me);

  const logOut = async () => {
    try { await signOutUser(); navigate('/'); } catch (err) { toast.error(err.message); }
  };
  const next = encodeURIComponent(currentPathAndSearch());

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-16 max-w-[1200px] items-center justify-between gap-x-6 px-4 py-1.5 sm:px-8">
          <div className="flex items-center gap-x-9">
            <Logo href={user ? '/dashboard' : '/'} size={24} className="text-lg" />
            {user && (
              <nav aria-label="Main" className="-mx-2 hidden gap-1.5 text-[15px] md:flex">
                {NAV.map((item) => {
                  const on = item.active(path);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={on ? 'page' : undefined}
                      className={cx(
                        'inline-flex min-h-11 items-center rounded-lg px-3.5 transition-colors',
                        on ? 'bg-hover font-semibold text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg'
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {user && allowance && (
              <span className="nums hidden rounded-lg border border-line px-2.5 py-1.5 font-mono text-[13px] text-fg-2 md:inline">{allowance}</span>
            )}
            {user && (
              // Under md the three places to go (and the allowance) fold into one menu,
              // so the bar stays a single row: wordmark, menu, avatar.
              <div className="md:hidden">
                <Menu
                  label="Navigate"
                  trigger={<span className="grid h-11 w-11 place-items-center rounded-lg text-fg-2"><MenuIcon aria-hidden className="h-5 w-5" /></span>}
                  header={allowance ? <p className="nums font-mono text-[13px] text-fg-2">{allowance}</p> : null}
                  items={NAV.map((item) => ({ label: item.label, href: item.href }))}
                />
              </div>
            )}
            {user && (
              <Menu
                label="Account"
                trigger={<Avatar user={user} size={36} />}
                header={(
                  <>
                    <p className="truncate text-[15px] font-semibold">{user.name || user.email}</p>
                    {user.name && <p className="truncate text-[13px] text-fg-3">{user.email}</p>}
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
                <Link href={`/login?next=${next}`} className="inline-flex min-h-11 items-center px-1 text-[15px] font-medium">Log in</Link>
                <Button href="/signup">Sign up free</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {user?.provider === 'password' && user.emailVerified === false && <VerifyStrip user={user} />}

      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-20 pt-8 sm:px-8 sm:pt-12">
        {children}
      </main>

      {/* The policies open in a new tab so a running analysis is never torn down. */}
      <Footer newTab />
    </div>
  );
}
