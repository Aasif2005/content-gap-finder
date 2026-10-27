import { useCallback, useEffect, useState } from 'react';

/**
 * A countdown for "Resend": `left` seconds remain, `start()` begins one.
 * Stops quietly when the component goes away.
 */
export function useCooldown(seconds = 30) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const start = useCallback(() => setLeft(seconds), [seconds]);
  return { left, start, active: left > 0 };
}
