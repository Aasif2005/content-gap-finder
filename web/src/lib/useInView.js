import { useEffect, useState } from 'react';

/**
 * True once the element has scrolled into view, and then stays true: the
 * highlighter sweep plays once and the page never replays it on scroll back.
 * Without IntersectionObserver (or in a test) it reports true straight away so
 * nothing stays hidden.
 */
export function useInView(ref, { threshold = 0.5, rootMargin = '0px 0px -8% 0px' } = {}) {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, threshold, rootMargin]);

  return seen;
}
