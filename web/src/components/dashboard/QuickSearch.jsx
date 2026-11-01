import { useId } from 'react';
import { Search } from 'lucide-react';
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
      <div className="flex flex-wrap gap-2.5 search-console items-center rounded-full p-2 pl-5">
        <Search aria-hidden className="search-icon h-5 w-5 shrink-0" strokeWidth={1.6} />
        <label htmlFor={id} className="sr-only">Niche</label>
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={100}
          autoComplete="off"
          placeholder="Try something specific: cast iron restoration beats cooking"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-h-12 min-w-0 flex-[1_1_300px] bg-transparent px-3.5 text-lg font-medium text-fg placeholder:font-normal placeholder:text-fg-3"
        />
        <p className="hidden items-center gap-3 border-l border-line pl-4 pr-2 text-[14px] text-fg-2 md:flex">
          <span>{windowLabel('7d')}</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-line-strong" />
          <span>{formatLabel('both')}</span>
        </p>
        <ShinyButton type="submit" className="max-sm:w-full">Find gaps</ShinyButton>
      </div>
      {error && <p id={errorId} role="alert" className="mt-2 text-[13px] leading-relaxed text-bad-fg">{error}</p>}
    </form>
  );
}
