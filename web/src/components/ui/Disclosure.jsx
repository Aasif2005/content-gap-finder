import { Children, cloneElement, isValidElement, useId, useState } from 'react';
import { cx } from '../../lib/cx.js';

const EASE = 'duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]';

/**
 * A <details> that animates: the body opens by growing its grid row from 0fr to
 * 1fr while fading in, and with `stagger` its direct children rise in one after
 * another. It sets `open` on its wrapper, so the existing `group-open:` classes
 * (chevron rotation, "Hide" label swaps) keep working unchanged.
 */
export function Disclosure({ summary, summaryClassName, className, bodyClassName, stagger = false, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const items = stagger
    ? Children.map(children, (child, i) => {
        if (!isValidElement(child)) return child;
        return cloneElement(child, {
          className: cx(
            child.props.className,
            'transition-[opacity,translate] motion-reduce:transition-none',
            EASE,
            open ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
          ),
          style: { ...child.props.style, transitionDelay: open ? `${i * 75}ms` : '0ms' },
        });
      })
    : children;

  return (
    <div className={cx('group', className)} open={open ? '' : undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className={cx('w-full text-left', summaryClassName)}
      >
        {summary}
      </button>
      <div
        id={bodyId}
        inert={!open}
        className={cx(
          'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none print:grid-rows-[1fr] print:opacity-100',
          EASE,
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden print:overflow-visible">
          <div className={bodyClassName}>{items}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The same reveal without a header, for content a separate button controls
 * ("Show all 5"): the extra rows grow in and fade, and stay out of the tab
 * order while hidden.
 */
export function Collapse({ open, className, children }) {
  return (
    <div
      inert={!open}
      className={cx(
        'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none print:grid-rows-[1fr] print:opacity-100',
        EASE,
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      <div className="min-h-0 overflow-hidden print:overflow-visible">
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
