import { useEffect, useId, useRef } from 'react';
import { cx } from '../../lib/cx.js';

/**
 * A modal over the platform `<dialog>`: focus is trapped, the page behind is
 * inert, and Escape closes it, all by the browser. `open` drives it; `onClose`
 * is called when it closes by Escape, the backdrop or `dismissible` actions.
 *
 *   <Dialog open={open} onClose={() => setOpen(false)} title="Delete account?"
 *           actions={<><Button variant="ghost">Cancel</Button><Button>Delete</Button></>}>
 *     ...body...
 *   </Dialog>
 *
 * `dismissible={false}` blocks Escape and backdrop clicks (use while a request is running).
 * Children only mount while it is open, so a form inside starts fresh each time.
 */
export function Dialog({ open, onClose, title, description, actions, children, dismissible = true, className }) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    return undefined;
  }, [open]);

  // Stop the page behind from scrolling under the modal.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => { if (!dismissible) e.preventDefault(); }}
      // Chrome honours preventDefault on cancel only once per user activation, so
      // a second Escape would still close it: stop the key itself as well.
      onKeyDown={(e) => { if (!dismissible && e.key === 'Escape') e.preventDefault(); }}
      onClose={() => {
        // Closed anyway while it must stay (a request is running): put it back.
        if (!dismissible && open) { ref.current?.showModal(); return; }
        onClose?.();
      }}
      // The backdrop is the dialog element itself, and so is its scrollbar: only
      // a press outside the box counts as a backdrop click.
      onMouseDown={(e) => {
        if (!dismissible || e.target !== ref.current) return;
        const r = ref.current.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) ref.current.close();
      }}
      className={cx(
        'm-auto w-[min(30rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-panel border border-line bg-surface p-0 text-fg',
        'shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5)] backdrop:bg-[#0F1E2E]/60',
        className
      )}
    >
      {open && (
        <>
          <div className="fade-in p-6">
            {title && <h2 id={titleId} className="text-xl font-semibold tracking-tight">{title}</h2>}
            {description && <p id={descId} className="mt-2 text-[15px] leading-relaxed text-fg-2">{description}</p>}
            {children && <div className={title || description ? 'mt-4' : undefined}>{children}</div>}
          </div>
          {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{actions}</div>}
        </>
      )}
    </dialog>
  );
}
