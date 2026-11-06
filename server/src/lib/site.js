import { config } from '../config.js';
import { renderSeoPage, seoPageFor } from './seoPages.js';

/**
 * What search engines and link previews read: the public address, the sitemap,
 * robots rules, and the absolute URLs in the page head. Everything hangs off one
 * value, SITE_URL. Until the domain exists it falls back to whatever host the
 * request came in on, so all of this already works on a preview address.
 */

// Every path the app's router knows (web/src/routes.jsx). A test keeps these in step.
const APP_PATHS = [
  /^\/$/, /^\/login$/, /^\/signup$/, /^\/reset-password$/, /^\/auth\/action$/, /^\/accept-terms$/, /^\/privacy$/, /^\/terms$/,
  /^\/dashboard$/, /^\/explore$/, /^\/channel$/, /^\/profile$/,
  /^\/r\/[a-zA-Z0-9_-]+$/, /^\/channel\/r\/[a-zA-Z0-9_-]+$/,
];

// Worth a search result. Everything else is an account page or someone's report.
export const SITEMAP_PATHS = ['/', '/privacy', '/terms', '/login', '/signup', '/reset-password'];

const trimSlashes = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

export const isAppPath = (path) => APP_PATHS.some((re) => re.test(trimSlashes(path)));

/**
 * The request's Host, only if it is a plain hostname[:port]. Without SITE_URL the
 * origin is built from it, and it lands in HTML attributes, the sitemap and the
 * https redirect: a crafted Host (quotes, slashes, @) must never get that far.
 */
export function safeHost(req) {
  const host = String(req.get('host') ?? '');
  return /^[a-z0-9.-]{1,253}(:\d{1,5})?$/i.test(host) ? host : 'localhost';
}

/** The site's public origin, with no trailing slash. */
export function siteOrigin(req, configured = config.site.url) {
  return configured ? configured.replace(/\/+$/, '') : `${req.protocol}://${safeHost(req)}`;
}

export function sitemapXml(origin) {
  const urls = SITEMAP_PATHS.map((p) => `  <url><loc>${origin}${p === '/' ? '/' : p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(origin) {
  return ['User-agent: *', 'Disallow: /api/', 'Disallow: /r/', 'Disallow: /channel/r/', 'Disallow: /dashboard', 'Disallow: /profile', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

/** Previews (og:image, twitter:image) need an absolute image URL. */
export const absoluteImages = (html, origin) => html.replaceAll('content="/og.png"', `content="${origin}/og.png"`);

/**
 * The built index.html for one request. Previews need an absolute image URL,
 * which a static file cannot know. Only paths from isAppPath get a canonical
 * link, so nothing from the URL reaches the page unchecked.
 */
export function renderIndex(html, origin, path) {
  const withImage = absoluteImages(html, origin);
  if (!isAppPath(path)) return withImage;
  // Public pages get their own title, tags and a plain-HTML snapshot (lib/seoPages.js).
  if (seoPageFor(path)) return renderSeoPage(withImage, origin, trimSlashes(path));
  const url = `${origin}${trimSlashes(path)}`;
  // Account screens and share links are not search results.
  return withImage.replace('</head>', `  <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n    <meta name="robots" content="noindex" />\n  </head>`);
}
