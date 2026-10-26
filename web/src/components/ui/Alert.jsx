import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cx } from '../../lib/cx.js';

const TONES = {
  info: ['bg-info-bg text-info-fg', Info],
  good: ['bg-good-bg text-good-fg', CircleCheck],
  warn: ['bg-warn-bg text-warn-fg', TriangleAlert],
  bad: ['bg-bad-bg text-bad-fg', CircleAlert],
};

/**
 * An inline message. `title` is the short headline, `children` the sentence,
 * `action` a node (usually a small Button) on the right. Warnings and errors
 * are announced at once; the rest politely.
 */
export function Alert({ tone = 'info', title, children, action, className }) {
  const [style, Icon] = TONES[tone] ?? TONES.info;
  return (
    <div
      role={tone === 'bad' || tone === 'warn' ? 'alert' : 'status'}
      className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel px-4 py-3', style, className)}
    >
      <Icon aria-hidden className="h-[18px] w-[18px] shrink-0 self-start sm:self-center" />
      <div className="min-w-0 flex-1 basis-60 text-[15px] leading-snug">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : undefined}>{children}</div>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
