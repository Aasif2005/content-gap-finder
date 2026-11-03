import crypto from 'node:crypto';
import { col } from './mongo.js';
import { cacheKey } from './cache.js';

/**
 * Saved subjects to re-analyse on a schedule.
 *
 * Content planning is a weekly ritual, not a one-off query, and gap recurrence
 * (lib/recurrence.js) only gets more useful the longer the baseline is -- but it
 * can only build that baseline if something actually re-runs the analysis. A
 * watch is what does the re-running.
 *
 * One MongoDB document per watch (collection watches, _id = the watch id). Each
 * change is a single atomic update, so two concurrent edits can't clobber.
 */
const strip = ({ _id, ...w }) => w;

export async function list() {
  return (await col('watches').find({}).toArray()).map(strip);
}

export const countOwnedBy = (uid) => col('watches').countDocuments({ ownerUid: uid });

export async function get(id) {
  const d = await col('watches').findOne({ _id: id });
  return d ? strip(d) : null;
}

/**
 * `input` is a full, already-validated analysis input -- the same object
 * /api/analyze takes. Storing it whole means a watch re-runs the exact query
 * that was saved, including filters, rather than a reconstruction of it.
 */
export async function create({ input, intervalHours, label, ownerUid = null }) {
  const watch = {
    id: crypto.randomUUID(),
    // Who made it. A watch with none predates accounts: it keeps running and is
    // visible to nobody, so it cannot be edited or deleted through the API.
    ownerUid,
    label: String(label || input.channelId || input.niche || '').slice(0, 120),
    input: JSON.parse(JSON.stringify(input)), // exactly what JSON stored before (cacheKey() compares these)
    intervalHours,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastRunId: null,
    lastError: null,
    runCount: 0,
    // Staggered so several watches created together don't all fire at once and
    // drain the day's quota in one burst.
    nextRunAt: new Date(Date.now() + Math.random() * 60_000).toISOString(),
  };
  await col('watches').insertOne({ _id: watch.id, ...watch });
  return watch;
}

// ---- ownership (pure, over a list, so they are testable without the file) ----

export const ownedBy = (list, uid) => (uid ? list.filter((w) => w.ownerUid === uid) : []);

/** The watch when `uid` owns it, else null -- the same answer for "missing" and "not yours". */
export const ownedWatch = (list, id, uid) => ownedBy(list, uid).find((w) => w.id === id) ?? null;

/** Per-person cap; the global cap in routes/api.js still applies on top. */
export const atOwnerCap = (list, uid, max) => ownedBy(list, uid).length >= max;

/**
 * Whether `uid` already watches this exact query. Per owner: two people watching
 * the same niche is fine (each pays their own allowance), one person doing it
 * twice only double-spends it.
 */
export const hasDuplicate = (list, uid, input) => {
  const key = JSON.stringify(cacheKey(input));
  return ownedBy(list, uid).some((w) => JSON.stringify(cacheKey(w.input)) === key);
};

/** Deletes every watch an account owns; returns how many. */
export async function removeOwned(uid) {
  if (!uid) return 0;
  return (await col('watches').deleteMany({ ownerUid: uid })).deletedCount;
}

export async function update(id, patch) {
  const d = await col('watches').findOneAndUpdate({ _id: id }, { $set: patch }, { returnDocument: 'after' });
  return d ? strip(d) : null;
}

export async function remove(id) {
  return (await col('watches').deleteOne({ _id: id })).deletedCount > 0;
}

/** Watches that are enabled and whose next run time has passed. */
export async function due(now = Date.now()) {
  const iso = new Date(now).toISOString(); // ISO strings sort the same as the dates they name
  const rows = await col('watches')
    .find({ enabled: true, $or: [{ nextRunAt: null }, { nextRunAt: { $lte: iso } }] })
    .toArray();
  return rows.map(strip);
}

/** Records the outcome of a run and schedules the next one. */
export async function recordRun(id, { runId, error }) {
  const w = await get(id);
  if (!w) return null;
  const next = new Date(Date.now() + w.intervalHours * 3600_000).toISOString();
  return update(id, {
    lastRunAt: new Date().toISOString(),
    lastRunId: runId ?? w.lastRunId,
    lastError: error ?? null,
    runCount: w.runCount + (error ? 0 : 1),
    nextRunAt: next,
  });
}

/**
 * Pushes the next attempt out without counting it as a run. Used when a watch
 * is skipped for reasons that have nothing to do with the watch itself -- an
 * exhausted daily quota, say -- so a skip doesn't reset the cadence or look
 * like a failure.
 */
export async function defer(id, minutes, lastError) {
  return update(id, {
    nextRunAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    // Only set when the caller has a reason worth showing the owner.
    ...(lastError ? { lastError } : {}),
  });
}
