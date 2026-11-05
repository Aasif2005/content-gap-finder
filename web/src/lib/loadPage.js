// A page's code is fetched when it is first opened. If that fetch fails (a tab left open across a deploy asks
// for a file name that no longer exists, or the network dropped), the browser remembers the failure, so
// trying the same address again cannot work. A fresh page load gets the current file names: reload once,
// then give up to the error screen rather than loop.
const RELOADED = 'gs:chunk-reload';
const isChunkError = (e) => /dynamically imported module|importing a module script|error loading dynamically|ChunkLoadError/i.test(String(e?.message ?? e));
export function loadPage(importer, { reload = () => window.location.reload() } = {}) {
  return importer().then(
    (mod) => { try { sessionStorage.removeItem(RELOADED); } catch { /* private mode */ } return mod; },
    (err) => {
      if (!isChunkError(err)) throw err;
      let already = true;
      try { const at = Number(sessionStorage.getItem(RELOADED)); already = at && Date.now() - at < 30_000; if (!already) sessionStorage.setItem(RELOADED, String(Date.now())); } catch { already = true; }
      if (already) throw err;
      reload();
      return new Promise(() => {}); // the page is going away; show the skeleton until it does
    },
  );
}
