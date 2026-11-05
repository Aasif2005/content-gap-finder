import { lazy, useState } from 'react';
import { loadPage } from './loadPage.js';

/**
 * A page whose code is fetched when it is wanted, like `React.lazy`, with one difference: once the code is here
 * (fetched early by `.preload()`, e.g. while someone signs in) the page draws at once. `React.lazy` still shows its
 * Suspense fallback the first time it renders, even for code already downloaded, and React keeps a fallback up for
 * about 300 ms once shown: that was the skeleton between signing in and the dashboard or the agree step.
 */
export function lazyPage(importer) {
  let Ready = null;
  let pending = null;
  const preload = () => {
    pending ??= loadPage(importer).then((mod) => { Ready = mod.default; return mod; }, (err) => { pending = null; throw err; });
    return pending;
  };
  const Lazy = lazy(preload);
  function Page(props) {
    // Chosen once per mount: swapping Lazy for Ready later would remount the page and lose its state.
    const [Shown] = useState(() => Ready ?? Lazy);
    return <Shown {...props} />;
  }
  Page.preload = preload;
  return Page;
}
