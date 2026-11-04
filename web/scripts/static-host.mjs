/**
 * After `vite build`, for a static host (Vercel): writes what the Express server
 * otherwise answers itself -- robots.txt, sitemap.xml, absolute preview-image URLs
 * in index.html, and a 404.html the host serves with a real 404 status. The
 * content comes from the server's own lib/site.js, so the two hosts cannot drift.
 *
 * Runs only when SITE_URL is set (the Vercel project sets it). A local build is
 * served by the Express server, which does all of this per request.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { absoluteImages, robotsTxt, sitemapXml } from '../../server/src/lib/site.js';
import { SEO_PAGES, renderSeoPage } from '../../server/src/lib/seoPages.js';

const origin = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
const dist = path.resolve(fileURLToPath(new URL('../dist', import.meta.url)));
if (!origin) {
  // web/vercel.json sends private routes to /app.html, so it must exist on every build.
  fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, 'app.html'));
  console.log('[static-host] SITE_URL not set: wrote app.html only (the Express server handles the rest).');
  process.exit(0);
}

const html = absoluteImages(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), origin);
// The plain app shell: every private route (dashboard, reports...) and the 404 page get it.
fs.writeFileSync(path.join(dist, 'app.html'), html);
fs.writeFileSync(path.join(dist, '404.html'), html); // the app draws its own NotFound page
fs.writeFileSync(path.join(dist, 'robots.txt'), robotsTxt(origin));
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemapXml(origin));
// Public pages: their own tags and a plain-HTML snapshot for crawlers that run no JavaScript.
// The homepage IS index.html: Vercel serves a real file before any rewrite, so `/` would
// never reach a rewrite. The others live in /seo/ and web/vercel.json rewrites to them.
fs.mkdirSync(path.join(dist, 'seo'), { recursive: true });
for (const [route, page] of Object.entries(SEO_PAGES)) {
  const file = page.file ? path.join(dist, 'seo', `${page.file}.html`) : path.join(dist, 'index.html');
  fs.writeFileSync(file, renderSeoPage(html, origin, route));
}
console.log(`[static-host] wrote app.html, index.html (home) and ${Object.keys(SEO_PAGES).length - 1} seo pages,`);
console.log(`[static-host] wrote robots.txt, sitemap.xml and 404.html for ${origin}`);
