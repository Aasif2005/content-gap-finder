import { useId, useRef, useState } from 'react';
import { Button } from '../ui/index.js';
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
      <div
        className="flex flex-col gap-2 rounded-[14px] border border-line-strong bg-surface-2 p-2 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_24px_48px_-24px_rgba(0,0,0,0.6)] has-[input:focus-visible]:border-focus has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-focus sm:flex-row sm:rounded-2xl"
      >
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
          className="min-h-[52px] min-w-0 flex-1 rounded-control bg-transparent px-3 text-lg font-medium text-fg outline-none placeholder:text-fg-3 sm:px-4 sm:text-xl"
        />
        <Button type="submit" size="lg" className="w-full !text-[17px] sm:w-auto sm:!px-[26px] !rounded-[11px]">
          Find gaps
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-3 text-[15px] text-bad-fg">{error}</p>
      )}
    </form>
  );
}
