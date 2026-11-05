import { useEffect } from 'react';
import { Skeleton } from './ui/index.js';
import { useAuth } from '../lib/auth.jsx';
import { useMe } from '../lib/me.jsx';
import { currentPathAndSearch, navigate } from '../lib/router.jsx';
import { preloadRoute } from '../routes.jsx';
import { needsVerification, nextSuffix } from './auth/helpers.js';

/** A quiet stand-in while we find out whether someone is signed in. */
function AuthSkeleton() {
  return (
    <div className="min-h-screen bg-bg" role="status" aria-label="Loading">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-8">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 pt-12 sm:px-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
        <Skeleton className="mt-6 h-20 w-full rounded-panel" />
      </div>
    </div>
  );
}

/** What a lazy page's slot shows while its code arrives: the page's own shape, never an empty block. */
export function PageSkeleton() {
  return (
    <div className="mx-auto min-h-[60vh] max-w-[1200px] space-y-4 px-4 pt-12 sm:px-8" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <Skeleton className="mt-6 h-20 w-full rounded-panel" />
    </div>
  );
}

/**
 * Wraps a page that needs an account (`required`; with it off this is a pass-through,
 * so a route's tree keeps one shape whether or not it is guarded). While auth is loading it shows a
 * skeleton; logged out, it sends the visitor to /login and brings them back
 * afterwards (`?next=` holds the path and query they asked for). An account
 * with an unverified email goes back to the "check your inbox" step on /signup.
 */
export default function RequireAuth({ required = true, children }) {
  const { user, loading } = useAuth();
  const { me } = useMe();
  const locked = needsVerification(user);
  // Signed in with Google and not yet agreed to the terms: that step comes first (email sign-ups record it as they go).
  const needsTerms = Boolean(me?.user) && !me.user.termsAcceptedAt;

  // Download the page's code while auth is still being worked out, not after it.
  useEffect(() => { if (required) preloadRoute(currentPathAndSearch()); }, [required]);

  useEffect(() => {
    if (!required || loading) return;
    if (!user) navigate(`/login?next=${encodeURIComponent(currentPathAndSearch())}`, { replace: true });
    else if (locked) navigate(`/signup${nextSuffix(currentPathAndSearch())}`, { replace: true });
    else if (needsTerms) navigate(`/accept-terms${nextSuffix(currentPathAndSearch())}`, { replace: true });
  }, [required, loading, user, locked, needsTerms]);

  if (required && (loading || !user || locked || needsTerms)) return <AuthSkeleton />;
  return children;
}
