import { useEffect, useState } from 'react';

const PHRASES = ['asking for.', 'waiting for.', 'searching for.', 'commenting about.'];

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
    <h1 id={id} className={className} aria-label={`Find the video your audience is still ${PHRASES[0]}`}>
      <span aria-hidden>
        Find the video your audience is still
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
