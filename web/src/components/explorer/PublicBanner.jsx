import { Button, Panel } from '../ui/index.js';
import { currentPathAndSearch } from '../../lib/router.jsx';

/**
 * What a logged-out visitor sees above a shared report: where it came from and
 * how to get their own. Quiet on purpose; the report is what they came for.
 */
export function PublicBanner() {
  const next = encodeURIComponent(currentPathAndSearch());
  return (
    <Panel padding="none" className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3">
      <p className="text-[15px] text-fg-2">
        <span className="font-semibold text-fg">Made with Gapstronaut.</span> Sign up free to run your own.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Button href="/signup">Sign up</Button>
        <Button variant="secondary" href={`/login?next=${next}`}>Log in</Button>
      </div>
    </Panel>
  );
}
