import { useId } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { ShinyButton } from '../ui/index.js';
import { formatLabel, windowLabel } from '../../lib/runRows.js';

/**
 * The dashboard's search box. It only collects the niche: submitting hands off
 * to the Explorer with the form prefilled (a run spends allowance, so it is
 * started there, not from a link). The line beside the button says what the
 * Explorer will start with.
 */
export function QuickSearch({ value, onChange, onSubmit, error, inputRef }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <form onSubmit={onSubmit} noValidate className="mt-7">
      <div className="search-console flex items-center gap-1.5 rounded-full p-1.5 pl-4 sm:gap-2.5 sm:p-2 sm:pl-5">
        <Search aria-hidden className="search-icon h-5 w-5 shrink-0" strokeWidth={1.6} />
        <label htmlFor={id} className="sr-only">Niche</label>
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={100}
          autoComplete="off"
          placeholder="A specific niche, like cast iron restoration"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base sm:min-h-12 sm:px-3.5 sm:text-lg font-medium text-fg placeholder:font-normal placeholder:text-fg-3"
        />
        <p className="hidden items-center gap-3 border-l border-line pl-4 pr-2 text-[14px] text-fg-2 md:flex">
          <span>{windowLabel('7d')}</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-line-strong" />
          <span>{formatLabel('both')}</span>
        </p>
        <ShinyButton type="submit" aria-label="Find gaps" className="cta-fold shrink-0"><ArrowRight aria-hidden className="h-5 w-5 sm:hidden" /><span className="max-sm:sr-only">Find gaps</span></ShinyButton>
      </div>
      {error && <p id={errorId} role="alert" className="mt-2 text-[13px] leading-relaxed text-bad-fg">{error}</p>}
    </form>
  );
}
