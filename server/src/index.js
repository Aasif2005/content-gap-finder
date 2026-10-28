import express from 'express';
import { securityHeaders, corsOriginAllowed } from './lib/security.js';
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
// No CORS by default: the built app and the Vite dev proxy are same-origin, and
// an open cors() let any website make your browser start analyses or delete
// watches. CORS_ORIGINS opts specific origins in.
if (config.corsOrigins.length) app.use(cors({ origin: (origin, cb) => cb(null, corsOriginAllowed(origin)) }));
app.use(express.json({ limit: '128kb' }));

app.use('/api', router);

// In production the built SPA is served from the same origin as the API.
const webDist = path.resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// Central error handler: every thrown error carries status/code from its source.
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'Internal error', code: err.code ?? 'INTERNAL' });
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
scheduler.start();
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
