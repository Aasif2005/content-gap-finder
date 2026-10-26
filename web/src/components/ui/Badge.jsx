import { cx } from '../../lib/cx.js';

const TONES = {
  neutral: 'bg-surface-2 text-fg-2',
  good: 'bg-good-bg text-good-fg',
  bad: 'bg-bad-bg text-bad-fg',
  warn: 'bg-warn-bg text-warn-fg',
  info: 'bg-info-bg text-info-fg',
};

// The old report components pass hot / warm / cool.
const LEGACY = { hot: 'bad', warm: 'warn', cool: 'info' };

/** A small status pill. `mono` is for counts and scores (Geist Mono). */
export function Badge({ children, tone = 'neutral', mono = false, className, ...rest }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1',
        mono ? 'font-mono text-xs' : 'text-[13px] font-medium',
        TONES[LEGACY[tone] ?? tone] ?? TONES.neutral,
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
