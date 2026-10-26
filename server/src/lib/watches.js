import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { withLock } from './fileLock.js';
import { cacheKey } from './cache.js';

/**
 * Saved subjects to re-analyse on a schedule.
 *
 * Content planning is a weekly ritual, not a one-off query, and gap recurrence
 * (lib/recurrence.js) only gets more useful the longer the baseline is -- but it
 * can only build that baseline if something actually re-runs the analysis. A
 * watch is what does the re-running.
 *
 * Flat JSON under a lock, like the quota ledger: there are a handful of these,
 * they change rarely, and a watch list is not worth a database.
 */
const STATE_DIR = path.resolve(fileURLToPath(new URL('../../.state', import.meta.url)));
const FILE = path.join(STATE_DIR, 'watches.json');

function read() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(raw.watches) ? raw.watches : [];
  } catch {
    return [];
  }
}

function write(watches) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ watches }, null, 2));
  fs.renameSync(tmp, FILE);
}

/** Mutates the list under a lock, so two concurrent edits can't clobber. */
function mutate(fn) {
  return withLock(FILE, () => {
    const watches = read();
    const result = fn(watches);
    write(watches);
    return result;
  });
}

export const list = () => read();

export function get(id) {
  return read().find((w) => w.id === id) ?? null;
}

/**
 * `input` is a full, already-validated analysis input -- the same object
 * /api/analyze takes. Storing it whole means a watch re-runs the exact query
 * that was saved, including filters, rather than a reconstruction of it.
 */
export function create({ input, intervalHours, label, ownerUid = null }) {
  const watch = {
    id: crypto.randomUUID(),
    // Who made it. A watch with none predates accounts: it keeps running and is
    // visible to nobody, so it cannot be edited or deleted through the API.
    ownerUid,
    label: String(label || input.channelId || input.niche || '').slice(0, 120),
    input,
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
  mutate((watches) => watches.push(watch));
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
export function removeOwned(uid) {
  let n = 0;
  if (!uid) return 0;
  mutate((watches) => {
    for (let i = watches.length - 1; i >= 0; i--) {
      if (watches[i].ownerUid === uid) { watches.splice(i, 1); n += 1; }
    }
  });
  return n;
}

export function update(id, patch) {
  return mutate((watches) => {
    const w = watches.find((x) => x.id === id);
    if (!w) return null;
    Object.assign(w, patch);
    return w;
  });
}

export function remove(id) {
  let removed = false;
  mutate((watches) => {
    const i = watches.findIndex((w) => w.id === id);
    if (i >= 0) { watches.splice(i, 1); removed = true; }
  });
  return removed;
}

/** Watches that are enabled and whose next run time has passed. */
export function due(now = Date.now()) {
  return read().filter((w) => w.enabled && (!w.nextRunAt || new Date(w.nextRunAt).getTime() <= now));
}

/** Records the outcome of a run and schedules the next one. */
export function recordRun(id, { runId, error }) {
  const w = get(id);
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
export function defer(id, minutes, lastError) {
  return update(id, {
    nextRunAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    // Only set when the caller has a reason worth showing the owner.
    ...(lastError ? { lastError } : {}),
  });
}
