import { useEffect, useRef, useState } from 'react';

const ON = 24; // scrolled past this: the first-scroll flourish plays
const RANGE = 180; // px of scrolling over which a header condenses fully
const ARRIVE_MS = 1300; // how long the one-time flourish runs

const ease = (t) => t * t * (3 - 2 * t);

/**
 * Scroll-linked header state. Writes `--p` (0 at the top, 1 after RANGE px, eased) onto
 * `ref`'s element on every frame, so CSS can condense the header in step with the scroll
 * without re-rendering. `arriving` is true for a moment the first time the page is
 * scrolled, to play a one-off flourish.
 */
export function useScrolled(ref) {
  const [arriving, setArriving] = useState(false);
  const played = useRef(false);

  useEffect(() => {
    let raf = 0;
    let timer = 0;
    const read = () => {
      raf = 0;
      const y = Math.max(0, window.scrollY);
      ref.current?.style.setProperty('--p', ease(Math.min(1, y / RANGE)).toFixed(4));
      if (y > ON && !played.current) {
        played.current = true;
        setArriving(true);
        timer = window.setTimeout(() => setArriving(false), ARRIVE_MS);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [ref]);

  return { arriving };
}
