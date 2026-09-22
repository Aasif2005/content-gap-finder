import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, assertConfig } from './config.js';
import { router } from './routes/api.js';

assertConfig();

const app = express();
app.set('trust proxy', 1); // so req.ip is the real client behind a proxy
app.use(cors());
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

app.listen(config.port, () => {
  console.log(`  Content Gap Finder API  http://localhost:${config.port}`);
  console.log(`  models: ${config.deepseek.analysisModel} (analysis)`);
  console.log(`  youtube budget: ${config.youtube.dailyUnitBudget} units/day (~${Math.floor(config.youtube.dailyUnitBudget / 100)} searches)`);
});
