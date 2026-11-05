import { useEffect, useState } from 'react';

/**
 * False until the page has finished loading and the browser is idle (or the visitor scrolls, taps or
 * presses a key first), then true for good. Lets a page paint its first screen before it fetches the code
 * for everything lower down.
 */
export function useAfterLoad() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return undefined;
    let id;
    let idle = false;
    const go = () => setReady(true);
    const afterLoad = () => {
      if ('requestIdleCallback' in window) { idle = true; id = requestIdleCallback(go, { timeout: 2000 }); }
      else id = setTimeout(go, 1200);
    };
    if (document.readyState === 'complete') afterLoad(); else window.addEventListener('load', afterLoad, { once: true });
    const early = ['scroll', 'pointerdown', 'keydown', 'touchstart'];
    early.forEach((e) => window.addEventListener(e, go, { once: true, passive: true }));
    return () => {
      window.removeEventListener('load', afterLoad);
      early.forEach((e) => window.removeEventListener(e, go));
      if (idle) cancelIdleCallback(id); else clearTimeout(id);
    };
  }, [ready]);
  return ready;
}
