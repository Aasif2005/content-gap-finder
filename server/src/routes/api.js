import express from 'express';
import * as jobs from '../lib/jobs.js';
import * as cache from '../lib/cache.js';
import { rateLimit } from '../lib/rateLimit.js';
import { quotaStatus } from '../lib/quota.js';
import { runPipeline } from '../services/pipeline.js';
import { config } from '../config.js';

export const router = express.Router();

const WINDOWS = new Set(['24h', '7d', '30d', '90d']);
const CONTENT_TYPES = new Set(['shorts', 'long', 'both']);
const GAP_MODES = new Set(['inclusive', 'strict']);

function validate(body) {
  const niche = String(body.niche ?? '').trim();
  if (niche.length < 2) throw Object.assign(new Error('Niche must be at least 2 characters.'), { status: 400 });
  if (niche.length > 100) throw Object.assign(new Error('Niche must be under 100 characters.'), { status: 400 });

  const window = body.window ?? '7d';
  if (!WINDOWS.has(window)) throw Object.assign(new Error(`window must be one of: ${[...WINDOWS].join(', ')}`), { status: 400 });

  const contentType = body.contentType ?? 'both';
  if (!CONTENT_TYPES.has(contentType)) throw Object.assign(new Error(`contentType must be one of: ${[...CONTENT_TYPES].join(', ')}`), { status: 400 });

  const gapMode = body.gapMode ?? 'inclusive';
  if (!GAP_MODES.has(gapMode)) throw Object.assign(new Error(`gapMode must be one of: ${[...GAP_MODES].join(', ')}`), { status: 400 });

  const minViews = Number(body.minViews ?? 0);
  if (!Number.isFinite(minViews) || minViews < 0) throw Object.assign(new Error('minViews must be a non-negative number.'), { status: 400 });

  // ISO 3166-1 alpha-2 / ISO 639-1 respectively; YouTube rejects anything else.
  const regionCode = body.regionCode ? String(body.regionCode).toUpperCase().slice(0, 2) : undefined;
  const relevanceLanguage = body.relevanceLanguage ? String(body.relevanceLanguage).toLowerCase().slice(0, 2) : undefined;

  return { niche, window, contentType, gapMode, minViews, regionCode, relevanceLanguage };
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, quota: quotaStatus(), cache: cache.stats(), phases: jobs.PHASES });
});

/**
 * Starts an analysis. Returns immediately with either a cached result or a job
 * id to poll -- the pipeline takes 20-60s and holding the request open that long
 * is how you collect proxy timeouts.
 */
router.post('/analyze', (req, res, next) => {
  let input;
  try {
    input = validate(req.body ?? {});
  } catch (err) {
    return next(err);
  }

  const key = cache.cacheKey(input);
  const force = req.body?.force === true;

  if (!force) {
    const hit = cache.get(key);
    if (hit) {
      return res.json({
        status: 'done',
        cached: true,
        cacheAgeSeconds: hit.ageSeconds,
        result: hit.value,
      });
    }
  }

  // Only uncached runs count against the per-IP limit and the YouTube quota,
  // so browsing cached reports stays free.
  rateLimit(req, res, () => {
    const id = jobs.create(input);
    res.status(202).json({ status: 'running', jobId: id, cached: false });

    runPipeline(input, jobs.reporter(id))
      .then((result) => {
        cache.set(key, result);
        jobs.finish(id, result);
      })
      .catch((err) => {
        console.error(`[job ${id}] failed:`, err.message);
        jobs.fail(id, err);
      });
  });
});

router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found or expired.', code: 'JOB_NOT_FOUND' });

  res.json({
    id: job.id,
    status: job.status,
    phase: job.phase,
    detail: job.detail,
    progress: job.progress,
    error: job.error,
    result: job.status === 'done' ? job.result : null,
    elapsedMs: Date.now() - job.createdAt,
  });
});

router.get('/quota', (_req, res) => {
  res.json({
    ...quotaStatus(),
    cache: cache.stats(),
    cacheTtlSeconds: config.cache.ttlSeconds,
    rateLimitPerHour: config.rateLimit.perHour,
  });
});
