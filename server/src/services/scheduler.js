import { config } from '../config.js';
import * as watches from '../lib/watches.js';
import * as store from '../lib/store.js';
import { quotaStatus, unitsPerAnalysis } from '../lib/quota.js';
import { startAnalysis } from './runner.js';

/**
 * Re-runs saved watches on their interval.
 *
 * Deliberately conservative, because unlike every other code path in this app
 * nobody is watching when it fires:
 *
 * - It never starts a run it cannot afford. A scheduled run that trips the
 *   quota ceiling would burn the budget a person was saving for an interactive
 *   run, so a watch is deferred rather than attempted when the remaining units
 *   would not cover it.
 * - It runs one watch at a time. Several 50-video pipelines in parallel is a
 *   good way to hit YouTube's rate limits and DeepSeek's at once.
 * - It forces a fresh run (skipping the cache), because a watch exists to
 *   produce a NEW data point for recurrence. Serving it a cached report would
 *   append a duplicate of the previous run to the gap history and inflate every
 *   recurrence streak with evidence that is really just the same run counted
 *   twice.
 *
 * Single-instance, like lib/jobs.js: two servers running this would double every
 * watch. That is the same seam the README already documents for jobs and cache.
 */
let timer = null;
let running = false;

async function tick() {
  if (running) return; // a long pipeline outlasting the interval must not overlap itself
  running = true;
  try {
    const dueNow = watches.due();
    for (const w of dueNow) {
      const cost = unitsPerAnalysis({
        contentType: w.input.contentType,
        deepScan: w.input.deepScan,
        channelMode: Boolean(w.input.channelId),
      });
      const { remaining } = quotaStatus();

      if (remaining < cost) {
        // Try again after the Pacific-midnight reset rather than failing.
        watches.defer(w.id, 60);
        console.warn(`[scheduler] deferring watch "${w.label}": needs ${cost} units, ${remaining} left today`);
        continue;
      }

      console.log(`[scheduler] running watch "${w.label}" (every ${w.intervalHours}h)`);
      await new Promise((resolve) => {
        // force: true -- a watch needs a genuinely new data point, not the
        // cached copy of the last one. See the note above.
        startAnalysis(w.input, {
          force: true,
          onFinish: (err, result) => {
            if (err) {
              watches.recordRun(w.id, { error: err.message });
              console.error(`[scheduler] watch "${w.label}" failed:`, err.message);
            } else {
              watches.recordRun(w.id, { runId: result.runId });
              const newGaps = (result.gaps ?? []).filter((g) => g.recurrence?.status === 'new').length;
              const recurring = (result.gaps ?? []).filter((g) => g.recurrence?.status === 'recurring').length;
              console.log(
                `[scheduler] watch "${w.label}" done: ${result.gaps.length} gaps (${newGaps} new, ${recurring} recurring), ${result.resolvedGaps?.length ?? 0} closed`
              );
            }
            resolve();
          },
        });
      });
    }
  } catch (err) {
    // A scheduler that dies takes every watch with it silently.
    console.error('[scheduler] tick failed:', err.message);
  } finally {
    running = false;
  }
}

export function start() {
  if (timer || !config.scheduler.enabled) return;
  timer = setInterval(tick, config.scheduler.checkIntervalMs);
  timer.unref(); // never hold the process open just for the scheduler
  console.log(`  scheduler: checking saved watches every ${Math.round(config.scheduler.checkIntervalMs / 60000)}m`);
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * A change digest for a watch: what the newest run found that the one before it
 * did not. Reads from the stored reports rather than recomputing anything, so
 * asking for a digest costs no quota.
 */
export function digest(watchId) {
  const w = watches.get(watchId);
  if (!w?.lastRunId) return null;
  const latest = store.readRun(w.lastRunId);
  if (!latest) return null;

  const gaps = latest.gaps ?? [];
  return {
    watchId: w.id,
    label: w.label,
    runId: latest.runId,
    generatedAt: latest.generatedAt,
    runsCompared: latest.stats?.runsCompared ?? 0,
    newGaps: gaps.filter((g) => g.recurrence?.status === 'new').map((g) => ({ question: g.question, demandScore: g.demandScore, suggestedTitle: g.suggestedTitle })),
    risingGaps: gaps.filter((g) => g.recurrence?.trend === 'rising').map((g) => ({ question: g.question, demandScore: g.demandScore, previousDemandScore: g.recurrence.previousDemandScore })),
    // The ones worth acting on: asked for repeatedly, across multiple runs.
    provenGaps: gaps
      .filter((g) => g.recurrence?.status === 'recurring' && g.recurrence.timesSeen >= 3)
      .map((g) => ({ question: g.question, timesSeen: g.recurrence.timesSeen, demandScore: g.demandScore, suggestedTitle: g.suggestedTitle })),
    closedGaps: latest.resolvedGaps ?? [],
    objections: (latest.objections ?? []).length,
    thinPool: Boolean(latest.thinPool),
  };
}
