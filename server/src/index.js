import express from 'express';
import { securityHeaders, corsOriginAllowed, httpsRedirectFor } from './lib/security.js';
import { isAppPath, renderIndex, robotsTxt, siteOrigin, sitemapXml } from './lib/site.js';
import { errorResponse } from './lib/publicError.js';
import compression from 'compression';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, assertConfig } from './config.js';
import { router } from './routes/api.js';
import * as scheduler from './services/scheduler.js';
import * as retention from './services/retention.js';
import { connectMongo, closeMongo } from './lib/mongo.js';

assertConfig();

const app = express();
// Only trust X-Forwarded-For when a proxy is really in front (TRUST_PROXY=1).
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use((req, res, next) => {
  const secure = httpsRedirectFor(req);
  return secure ? res.redirect(301, secure) : next();
});
app.use(compression());
// No CORS by default: the built app and the Vite dev proxy are same-origin, and
// an open cors() let any website make your browser start analyses or delete
// watches. CORS_ORIGINS opts specific origins in.
if (config.corsOrigins.length) app.use(cors({ origin: (origin, cb) => cb(null, corsOriginAllowed(origin)) }));
// The largest accepted picture (100 KB) is about 135 KB as base64, over the default limit below, so this route reads its own body first.
app.use('/api/me/avatar', express.json({ limit: '200kb' }));
app.use(express.json({ limit: '128kb' }));

app.use('/api', router);
app.use('/api', (_req, res) => res.status(404).json({ error: 'No such API route.', code: 'NOT_FOUND' }));

app.get('/robots.txt', (req, res) => res.type('text/plain').send(robotsTxt(siteOrigin(req))));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(sitemapXml(siteOrigin(req))));

// In production the built SPA is served from the same origin as the API.
const webDist = path.resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));
if (fs.existsSync(webDist)) {
  // Vite puts a content hash in every file name under /assets, so they never change.
  app.use('/assets', express.static(path.join(webDist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(express.static(webDist, { index: false }));
  const indexHtml = fs.readFileSync(path.join(webDist, 'index.html'), 'utf8');
  // The app draws its own 404 page, but search engines read the status: an unknown address must say 404.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.status(isAppPath(req.path) ? 200 : 404).set('Cache-Control', 'no-cache').type('html').send(renderIndex(indexHtml, siteOrigin(req), req.path));
  });
}

// Central error handler: thrown errors carry status/code from their source, and
// only what lib/publicError.js allows reaches the caller.
app.use((err, _req, res, _next) => {
  const { status, body } = errorResponse(err);
  if (status >= 500) console.error('[error]', err);
  res.status(status).json(body);
});

// The database must be reachable before anything is served: every route reads it.
try {
  await connectMongo();
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
}

// Saved watches re-run themselves; see services/scheduler.js for why it is
// deliberately conservative about quota and concurrency.
// Held back (with the watch controls) until the quota audit: a run spends search calls unattended.
if (config.features.watches) scheduler.start();
retention.start();

const server = app.listen(config.port, () => {
  console.log(`  Gapstronaut API  http://localhost:${config.port}`);
  console.log(`  database: MongoDB Atlas (${config.mongo.dbName})`);
  console.log(`  models: ${config.deepseek.analysisModel} (analysis)`);
  console.log(config.firebase.projectId
    ? `  accounts: Firebase project ${config.firebase.projectId}`
    : '  accounts: NOT CONFIGURED (set FIREBASE_PROJECT_ID); analyses, briefs and watches answer 503');
  console.log(`  youtube budget: ${config.youtube.searchDailyCalls} searches + ${config.youtube.dailyUnitBudget} units/day; data kept ${config.store.maxDataDays} days`);
});

// Let in-flight requests finish and close the database cleanly on stop/redeploy.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => {
    server.close(() => closeMongo().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
