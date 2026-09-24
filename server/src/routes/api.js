import express from 'express';
import * as jobs from '../lib/jobs.js';
import * as cache from '../lib/cache.js';
import { rateLimit } from '../lib/rateLimit.js';
import { quotaStatus } from '../lib/quota.js';
import { runPipeline } from '../services/pipeline.js';
import { config } from '../config.js';
import { MAX_CUSTOM_WINDOW_DAYS } from '../services/youtube.js';
import { listRuns, readRunLog } from '../lib/auditLog.js';

export const router = express.Router();

/** A client-fixable input problem: 400 with a code that says so. */
const bad = (message) => Object.assign(new Error(message), { status: 400, code: 'VALIDATION' });

const WINDOWS = new Set(['24h', '7d', '30d', '90d', 'custom']);
const CONTENT_TYPES = new Set(['shorts', 'long', 'both']);
const GAP_MODES = new Set(['inclusive', 'strict']);

function validate(body) {
  const niche = String(body.niche ?? '').trim();
  if (niche.length < 2) throw bad('Niche must be at least 2 characters.');
  if (niche.length > 100) throw bad('Niche must be under 100 characters.');

  const window = body.window ?? '7d';
  if (!WINDOWS.has(window)) throw bad(`window must be one of: ${[...WINDOWS].join(', ')}`);

  // A custom range carries its own start date; everything else is a preset.
  let customAfter;
  if (window === 'custom') {
    const at = new Date(body.customAfter ?? '');
    if (Number.isNaN(at.getTime())) throw bad('A custom range needs a valid start date (ISO 8601).');
    if (at.getTime() >= Date.now()) throw bad('The custom start date must be in the past.');
    const daysBack = (Date.now() - at.getTime()) / 86_400_000;
    if (daysBack > MAX_CUSTOM_WINDOW_DAYS) {
      throw bad(`A custom range can reach back at most ${MAX_CUSTOM_WINDOW_DAYS} days.`);
    }
    customAfter = at.toISOString();
  }

  const contentType = body.contentType ?? 'both';
  if (!CONTENT_TYPES.has(contentType)) throw bad(`contentType must be one of: ${[...CONTENT_TYPES].join(', ')}`);

  const gapMode = body.gapMode ?? 'inclusive';
  if (!GAP_MODES.has(gapMode)) throw bad(`gapMode must be one of: ${[...GAP_MODES].join(', ')}`);

  const minViews = Number(body.minViews ?? 0);
  if (!Number.isFinite(minViews) || minViews < 0) throw bad('minViews must be a non-negative number.');

  // Opt-in: doubles the search.list slices to widen the candidate pool. Costs
  // real quota, so it is never on by default -- see lib/searchPlan.js.
  const deepScan = body.deepScan === true;

  // ISO 3166-1 alpha-2 / ISO 639-1 respectively; YouTube rejects anything else.
  const regionCode = body.regionCode ? String(body.regionCode).toUpperCase().slice(0, 2) : undefined;
  const relevanceLanguage = body.relevanceLanguage ? String(body.relevanceLanguage).toLowerCase().slice(0, 2) : undefined;

  return { niche, window, customAfter, contentType, gapMode, minViews, regionCode, relevanceLanguage, deepScan };
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

    runPipeline(input, jobs.reporter(id), id)
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

router.get('/quota', (req, res) => {
  res.json({
    ...quotaStatus({
      contentType: req.query.contentType,
      deepScan: req.query.deepScan === 'true',
      channelMode: req.query.channelMode === 'true',
    }),
    cache: cache.stats(),
    cacheTtlSeconds: config.cache.ttlSeconds,
    rateLimitPerHour: config.rateLimit.perHour,
  });
});

/**
 * Audit trail: what each run actually extracted, and whether it stayed on the
 * requested niche. One row per run, newest first, with the relevance summary
 * so drift is visible without opening every log.
 */
router.get('/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  res.json({ runs: listRuns(limit) });
});

/** The full human-readable log for one run -- the thing to actually read. */
router.get('/logs/:runId', (req, res) => {
  const text = readRunLog(req.params.runId);
  if (text === null) return res.status(404).json({ error: 'Log not found or expired.', code: 'LOG_NOT_FOUND' });
  res.type('text/plain').send(text);
});
