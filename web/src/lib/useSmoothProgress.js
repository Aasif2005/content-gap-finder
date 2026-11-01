import { useEffect, useRef, useState } from 'react';

// Where each step must stop creeping. The server reports milestones, not a
// stream (searching ~5-10, stats 22-33, comments 32-52, clustering 55, gaps 78,
// done 100), and the two model steps can sit silent for a long while. So the
// shown number eases toward the last real value, then crawls toward the next
// milestone's start without ever reaching it. It only hits 100 when the job is done.
const CEILING = { searching: 21, stats: 31, comments: 51, clustering: 77, gaps: 99 };
const CREEP_PER_SEC = 0.9; // points per second at full distance from the ceiling

/**
 * A live 0-100 percentage for a running analysis: honest (never ahead of the
 * next milestone), smooth (eased, not stepped) and monotonic (never backwards).
 * Under reduced motion it shows the real value only.
 */
export function useSmoothProgress({ phase, progress, done = false }) {
  const [shown, setShown] = useState(0);
  const cur = useRef(0);
  const target = useRef({ real: 0, ceiling: 0, done: false });

  target.current = {
    real: Math.max(0, Math.min(100, Number(progress) || 0)),
    ceiling: CEILING[phase] ?? 0,
    done: done || phase === 'done',
  };

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();

    const frame = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const { real, ceiling, done: finished } = target.current;
      let next = cur.current;

      if (finished) {
        next = reduced ? 100 : next + (100 - next) * Math.min(1, dt * 8);
        if (100 - next < 0.5) next = 100;
      } else if (reduced) {
        next = Math.max(next, real);
      } else {
        // Catch up to the real value, then creep toward the ceiling, slower the closer it gets.
        if (real > next) next += (real - next) * Math.min(1, dt * 4);
        const cap = Math.max(real, ceiling);
        if (cap > next) next += Math.min(cap - next, ((cap - next) / 20 + 0.05) * CREEP_PER_SEC * dt * 4);
        next = Math.min(next, Math.max(real, ceiling));
      }

      cur.current = Math.max(cur.current, next);
      setShown((s) => {
        const v = Math.min(100, Math.floor(cur.current + 1e-6));
        return v === s ? s : v;
      });
      if (cur.current < 100) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return shown;
}
