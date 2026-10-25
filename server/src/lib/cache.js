import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

// Disk-backed JSON cache. Deliberately not Redis: the only thing we cache is a
// handful of KB per niche+window, and a file cache means no extra service to run.
// Swap this module for a Redis client and the call sites stay identical.
const CACHE_DIR = path.resolve(fileURLToPath(new URL('../../.cache', import.meta.url)));

export function cacheKey(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

function file(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

export function get(key, { ttlSeconds = config.cache.ttlSeconds } = {}) {
  try {
    const entry = JSON.parse(fs.readFileSync(file(key), 'utf8'));
    const ageSeconds = (Date.now() - entry.storedAt) / 1000;
    if (ageSeconds > ttlSeconds) return null;
    return { value: entry.value, ageSeconds: Math.round(ageSeconds), storedAt: entry.storedAt };
  } catch {
    return null;
  }
}

export function set(key, value) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = `${file(key)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ storedAt: Date.now(), value }));
  fs.renameSync(tmp, file(key)); // atomic swap so a crash can't leave a half-written entry
}

/**
 * Deletes entries stored before `cutoffMs`. An expired entry is never served,
 * but it still sat on disk holding YouTube data past the 30-day limit.
 */
export function sweep(cutoffMs) {
  let n = 0;
  try {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      const p = path.join(CACHE_DIR, f);
      try {
        if (fs.statSync(p).mtimeMs < cutoffMs) { fs.unlinkSync(p); n += 1; }
      } catch { /* raced with another delete */ }
    }
  } catch { /* no cache directory yet */ }
  return n;
}

export function stats() {
  try {
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    return { entries: files.length, dir: CACHE_DIR };
  } catch {
    return { entries: 0, dir: CACHE_DIR };
  }
}
