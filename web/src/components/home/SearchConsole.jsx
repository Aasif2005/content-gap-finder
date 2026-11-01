import { useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
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
      <div className="search-console flex flex-col items-stretch gap-2 rounded-[2rem] p-2 pl-5 sm:flex-row sm:items-center sm:rounded-full">
        <Search aria-hidden className="search-icon hidden h-5 w-5 shrink-0 sm:block" strokeWidth={1.6} />
        <label htmlFor={id} className="sr-only">Your niche</label>
        <input
          ref={inputRef}
          id={id}
          name="niche"
          type="text"
          value={niche}
          onChange={(e) => { setNiche(e.target.value); if (error) setError(''); }}
          placeholder="Your niche, like sourdough starter"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={120}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-h-12 min-w-0 flex-1 rounded-control bg-transparent px-3.5 text-lg font-medium text-fg placeholder:font-normal placeholder:text-fg-3"
        />
        <ShinyButton type="submit" className="w-full shrink-0 sm:w-auto">
          Find gaps
        </ShinyButton>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-3 text-[15px] text-bad-fg">{error}</p>
      )}
    </form>
  );
}
