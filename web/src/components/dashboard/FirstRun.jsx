import { Button, Panel } from '../ui/index.js';

// Starting points, not claims about these niches.
export const EXAMPLE_NICHES = ['sourdough starter', 'cast iron restoration', 'home espresso'];

/** Shown instead of the report list until the first analysis exists. */
export function FirstRun({ onPick }) {
  return (
    <Panel>
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Run your first analysis</h2>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-fg-2">
        Enter a niche above. A run takes 60 to 120 seconds. You get the questions viewers keep asking that no video
        answers well, each with the comments behind it and a link to the video it was written under.
      </p>
      <p className="mt-5 text-sm font-medium text-fg">Or start from an example</p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {EXAMPLE_NICHES.map((n) => (
          <Button key={n} variant="secondary" onClick={() => onPick(n)}>{n}</Button>
        ))}
      </div>
      <p className="mt-5 text-[13px] leading-relaxed text-fg-3">
        Your reports appear here afterwards, and reopening one costs nothing.
      </p>
    </Panel>
  );
}
