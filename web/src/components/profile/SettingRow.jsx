import { useId } from 'react';
import { cx } from '../../lib/cx.js';

/**
 * One row of the settings panel: what it is on the left, the control on the
 * right, a hairline underneath (the last row has none). Rows stack on narrow
 * screens. Rows live inside one Panel; they are never cards of their own.
 */
export function SettingRow({ title, description, danger = false, children, className }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cx('flex flex-wrap gap-x-10 gap-y-4 px-5 py-6 sm:px-8 sm:py-7', className)}>
      <div className="min-w-0 flex-1 basis-[220px]">
        <h2 id={id} className={cx('text-[17px] font-semibold', danger && 'text-bad-fg')}>{title}</h2>
        {description && <p className="mt-1 text-sm leading-normal text-fg-2">{description}</p>}
      </div>
      <div className="min-w-0 flex-[2] basis-[320px]">{children}</div>
    </section>
  );
}
