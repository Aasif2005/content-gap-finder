import { col } from './mongo.js';

/**
 * The waitlist for plans that are not on sale yet. One row per (email, plan);
 * joining twice is a quiet success, so the form never reveals who is on the
 * list. Rows hold no YouTube data, so they have no TTL: they stay until the
 * owner deletes them (or the person asks).
 */

export const PLANS = ['creator', 'studio'];

/** Lower-cased, trimmed address, or null when it is not one. */
export function normalizeEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/** Adds the address to the plan's list. Returns `{ created }` (false when it was already there). */
export async function joinWaitlist({ email, plan, uid = null }) {
  const r = await col('waitlist').updateOne(
    { email, plan },
    { $setOnInsert: { email, plan, uid, createdAt: new Date() } },
    { upsert: true },
  );
  return { created: r.upsertedCount > 0 };
}
