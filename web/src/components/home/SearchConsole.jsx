import { useId, useRef, useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { ShinyButton } from '../ui/index.js';
import { navigate } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';

/**
 * The homepage search. It does not run anything itself: it carries the niche to
 * the Explorer, through sign-up first when the visitor has no account.
 */
export default function SearchConsole() {
  const { user } = useAuth();
  const id = useId();
  const inputRef = useRef(null);
  const [niche, setNiche] = useState('');
  const [error, setError] = useState('');
  const errorId = `${id}-error`;

  const submit = (e) => {
    e.preventDefault();
    const value = niche.trim().replace(/\s+/g, ' ');
    if (!value) {
      setError('Type a niche first, like “sourdough starter” or “budget travel in Japan”.');
      inputRef.current?.focus();
      return;
    }
    const target = `/explore?niche=${encodeURIComponent(value)}`;
    navigate(user ? target : `/signup?next=${encodeURIComponent(target)}`);
  };

  return (
    <form
      role="search"
      onSubmit={submit}
      noValidate
      className="mt-7 max-w-[780px] md:mt-11"
    >
      <div className="search-console flex items-center gap-1.5 rounded-full p-1.5 pl-4 sm:gap-2 sm:p-2 sm:pl-5">
        <Search aria-hidden className="search-icon h-5 w-5 shrink-0" strokeWidth={1.6} />
        <label htmlFor={id} className="sr-only">Your niche</label>
        <input
          ref={inputRef}
          id={id}
          name="niche"
          type="text"
          value={niche}
          onChange={(e) => { setNiche(e.target.value); if (error) setError(''); }}
          placeholder="A niche, like sourdough"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={120}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-control bg-transparent px-2 text-base sm:min-h-12 sm:px-3.5 sm:text-lg font-medium text-fg placeholder:font-normal placeholder:text-fg-3"
        />
        <ShinyButton type="submit" aria-label="Find gaps" className="cta-fold shrink-0">
          <ArrowRight aria-hidden className="h-5 w-5 sm:hidden" /><span className="max-sm:sr-only">Find gaps</span>
        </ShinyButton>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-3 text-[15px] text-bad-fg">{error}</p>
      )}
    </form>
  );
}
