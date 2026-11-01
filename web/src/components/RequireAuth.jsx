import { useEffect } from 'react';
import { Skeleton } from './ui/index.js';
import { useAuth } from '../lib/auth.jsx';
import { currentPathAndSearch, navigate } from '../lib/router.jsx';
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

/**
 * Wraps a page that needs an account (`required`; with it off this is a pass-through,
 * so a route's tree keeps one shape whether or not it is guarded). While auth is loading it shows a
 * skeleton; logged out, it sends the visitor to /login and brings them back
 * afterwards (`?next=` holds the path and query they asked for). An account
 * with an unverified email goes back to the "check your inbox" step on /signup.
 */
export default function RequireAuth({ required = true, children }) {
  const { user, loading } = useAuth();
  const locked = needsVerification(user);

  useEffect(() => {
    if (!required || loading) return;
    if (!user) navigate(`/login?next=${encodeURIComponent(currentPathAndSearch())}`, { replace: true });
    else if (locked) navigate(`/signup${nextSuffix(currentPathAndSearch())}`, { replace: true });
  }, [required, loading, user, locked]);

  if (required && (loading || !user || locked)) return <AuthSkeleton />;
  return children;
}
