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

const origin = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
if (!origin) {
  console.log('[static-host] SITE_URL not set: skipped (the Express server handles these).');
  process.exit(0);
}

const dist = path.resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const html = absoluteImages(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), origin);
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.writeFileSync(path.join(dist, '404.html'), html); // the app draws its own NotFound page
fs.writeFileSync(path.join(dist, 'robots.txt'), robotsTxt(origin));
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemapXml(origin));
console.log(`[static-host] wrote robots.txt, sitemap.xml and 404.html for ${origin}`);
