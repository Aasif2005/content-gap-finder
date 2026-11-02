import { cx } from '../../lib/cx.js';

/**
 * "Fresh analyses  1 of 3 used" over a 6px bar. Once the allowance is gone the
 * bar turns the alert tone AND gets diagonal stripes: in the dark palette the
 * alert and normal tones are both near-white, so colour alone would not show it.
 */
export function UsageMeter({ label, used, limit, unit = 'used', className }) {
  const safeLimit = Math.max(1, limit || 0);
  const pct = Math.max(0, Math.min(100, (used / safeLimit) * 100));
  const spent = used >= limit;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-fg">{label}</span>
        <span className="nums font-mono text-fg-2">{used} of {limit} {unit}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={`${used} of ${limit} ${unit}`}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div
          style={{ width: `${pct}%` }}
          className={cx('h-full rounded-full transition-[width] duration-200 ease-[var(--ease-out)]', spent ? 'meter-spent bg-bad-fg' : 'bg-focus')}
        />
      </div>
    </div>
  );
}
