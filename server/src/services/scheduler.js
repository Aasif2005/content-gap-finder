import { config } from '../config.js';
import * as watches from '../lib/watches.js';
import * as store from '../lib/store.js';
import { quotaStatus, canAfford, quotaDay, nextQuotaReset } from '../lib/quota.js';
import { getUser, tryConsume, refund, linkRun } from '../lib/db.js';
import { limitsFor } from '../lib/limits.js';
import { publicMessage, RUN_FAILED } from '../lib/publicError.js';
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
    const dueNow = await watches.due();
    for (const w of dueNow) {
      const shape = {
        contentType: w.input.contentType,
        deepScan: w.input.deepScan,
        channelMode: Boolean(w.input.channelId),
      };

      if (!(await canAfford(shape))) {
        // Try again after the Pacific-midnight reset rather than failing.
        await watches.defer(w.id, 60);
        const q = await quotaStatus(shape);
        console.warn(`[scheduler] deferring watch "${w.label}": needs ${q.unitsPerAnalysis} units + ${q.searchCallsPerAnalysis} searches, ${q.remaining} units + ${q.searchRemaining} searches left today`);
        continue;
      }

      // A watch an account created spends THAT account's daily analyses, like a
      // click would: otherwise two watches on a 6-hour interval would be eight
      // free analyses a day, far past the allowance. Legacy watches (no owner)
      // are not metered. Checked after canAfford so a day the quota cannot cover
      // does not also cost the person an analysis they never got.
      let consumed = null;
      if (w.ownerUid) {
        const day = quotaDay();
        const got = await tryConsume(w.ownerUid, day, 'analyses', limitsFor(await getUser(w.ownerUid)).analyses);
        if (!got.ok) {
          // Allowances reset with the quota, so there is no point asking again before then.
          const minutes = Math.ceil((Date.parse(nextQuotaReset()) - Date.now()) / 60_000) + 1;
          await watches.defer(w.id, minutes, `Skipped: your ${got.limit} analyses for today are used up. This watch tries again after the reset at midnight Pacific.`);
          console.warn(`[scheduler] deferring watch "${w.label}": owner has used ${got.used}/${got.limit} analyses today`);
          continue;
        }
        consumed = day;
      }

      console.log(`[scheduler] running watch "${w.label}" (every ${w.intervalHours}h)`);
      // A run that never reports back (a hung request) must not freeze every
      // other watch behind it, so the wait is bounded.
      let timeout;
      await Promise.race([new Promise((resolve) => {
        // force: true -- a watch needs a genuinely new data point, not the
        // cached copy of the last one. See the note above.
        startAnalysis(w.input, {
          force: true,
          onFinish: async (err, result) => {
            try {
              if (err) {
                // Same policy as an interactive run: a failure gives the analysis back.
                if (consumed) await refund(w.ownerUid, consumed, 'analyses');
                await watches.recordRun(w.id, { error: publicMessage(err, RUN_FAILED) }); // shown to the owner
                console.error(`[scheduler] watch "${w.label}" failed:`, err.message);
              } else {
                await watches.recordRun(w.id, { runId: result.runId });
                // Without this the owner's report history would never show what their watch found.
                if (w.ownerUid) await linkRun(w.ownerUid, result.runId);
                const newGaps = (result.gaps ?? []).filter((g) => g.recurrence?.status === 'new').length;
                const recurring = (result.gaps ?? []).filter((g) => g.recurrence?.status === 'recurring').length;
                console.log(
                  `[scheduler] watch "${w.label}" done: ${(result.gaps ?? []).length} gaps (${newGaps} new, ${recurring} recurring), ${result.resolvedGaps?.length ?? 0} closed`
                );
              }
            } catch (e) {
              console.error(`[scheduler] bookkeeping for watch "${w.label}" failed:`, e.message);
            } finally {
              resolve();
            }
          },
        }).catch(async (e) => {
          // The run never started (a storage error, say): give the analysis back and move on.
          console.error(`[scheduler] watch "${w.label}" could not start:`, e.message);
          if (consumed) await refund(w.ownerUid, consumed, 'analyses').catch(() => {});
          // Its next run time has not moved, so without this it fires again on the next tick.
          await watches.defer(w.id, 60, RUN_FAILED).catch(() => {});
          resolve();
        });
      }), new Promise((resolve) => {
        timeout = setTimeout(async () => {
          console.error(`[scheduler] watch "${w.label}" did not finish within ${config.scheduler.runTimeoutMinutes} min; moving on.`);
          // Same reason: an unmoved watch would start, and charge, a second run on the next tick.
          await watches.recordRun(w.id, { error: 'This run took too long. It tries again at its next scheduled time.' }).catch(() => {});
          resolve();
        }, config.scheduler.runTimeoutMinutes * 60 * 1000);
        timeout.unref?.();
      })]);
      clearTimeout(timeout);
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
  const ms = config.scheduler.checkIntervalMs;
  // Sub-minute intervals (used when testing) rounded to a bare-faced "every 0m".
  const every = ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`;
  console.log(`  scheduler: checking saved watches every ${every}`);
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
export async function digest(watchId) {
  const w = await watches.get(watchId);
  if (!w?.lastRunId) return null;
  const latest = await store.readRun(w.lastRunId);
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
