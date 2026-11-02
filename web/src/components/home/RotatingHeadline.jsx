import { useEffect, useState } from 'react';

const PHRASES = ['asking for.', 'begging for.', 'waiting for.', 'coming back for.'];

/**
 * The hero line. One static sentence for assistive tech; the rotating word is
 * decoration. Under reduced motion the first phrase simply stays.
 */
export default function RotatingHeadline({ className, id }) {
  const [at, setAt] = useState(0);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setTimeout(() => setAt((n) => (n + 1) % PHRASES.length), 2600);
    return () => clearTimeout(t);
  }, [at]);

  return (
    <h1 id={id} className={className} aria-label={`Make the video your audience keeps ${PHRASES[0]}`}>
      <span aria-hidden className="text-balance">
        Make the video your{'\u00a0'}audience{'\u00a0'}keeps
        <br />
        <span className="rotator">
          {PHRASES.map((p, i) => (
            <span key={p} data-on={i === at} data-past={i < at}>{p}</span>
          ))}
        </span>
      </span>
    </h1>
  );
}
