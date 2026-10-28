import { cx } from '../../lib/cx.js';

/**
 * The one level of container: a surface, a hairline, a large faint shadow. Never put
 * a Panel inside a Panel; separate things inside it with hairline rows instead.
 * `padding="none"` is for panels whose rows carry their own padding.
 */
export function Panel({ as: Tag = 'div', padding = 'md', className, children, ...rest }) {
  return (
    <Tag
      className={cx(
        'min-w-0 rounded-panel border border-line bg-surface shadow-panel',
        padding === 'md' && 'p-5 sm:p-6',
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
