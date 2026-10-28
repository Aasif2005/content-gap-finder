import crypto from 'node:crypto';
import { config } from '../config.js';
import { col } from './mongo.js';

// MongoDB-backed JSON cache, keyed by a hash of the query. Deliberately not Redis:
// the only thing cached is a few KB per niche + window. The call sites would stay
// the same if this were swapped for Redis.
const HOLD_MS = 24 * 3600 * 1000; // a TTL index deletes entries after this, whatever ttlSeconds a caller asks for

export function cacheKey(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

export async function get(key, { ttlSeconds = config.cache.ttlSeconds } = {}) {
  const entry = await col('cache').findOne({ _id: key });
  if (!entry) return null;
  const ageSeconds = (Date.now() - entry.storedAt) / 1000;
  if (ageSeconds > ttlSeconds) return null;
  return { value: entry.value, ageSeconds: Math.round(ageSeconds), storedAt: entry.storedAt };
}

export async function set(key, value) {
  const storedAt = Date.now();
  // Round-trip through JSON: stores exactly what the old file cache did (no undefined, no class instances).
  await col('cache').replaceOne(
    { _id: key },
    { storedAt, expireAt: new Date(storedAt + HOLD_MS), value: JSON.parse(JSON.stringify(value)) },
    { upsert: true }
  );
}

/**
 * Deletes entries stored before `cutoffMs`. An expired entry is never served,
 * but it would still hold YouTube data past the 30-day limit.
 */
export async function sweep(cutoffMs) {
  const r = await col('cache').deleteMany({ storedAt: { $lt: cutoffMs } });
  return r.deletedCount;
}

export async function stats() {
  return { entries: await col('cache').estimatedDocumentCount() };
}
