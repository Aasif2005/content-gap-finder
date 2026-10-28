import { col } from './mongo.js';

/**
 * Accounts and allowances (MongoDB collections users, usage, user_runs).
 * This holds what is about PEOPLE, which has to be counted atomically (a daily
 * allowance read-then-written by two requests would let both through) and
 * deleted by uid on request. Reports, drafts and watches live in their own
 * collections (lib/store.js, lib/watches.js).
 */
const now = () => new Date();
const isDuplicate = (err) => err?.code === 11000;

// ------------------------------------------------------------------ users ---

const userFromDoc = (d) => !d ? null : {
  uid: d._id,
  email: d.email ?? null,
  name: d.name ?? null,
  photoUrl: d.photoUrl ?? null,
  provider: d.provider ?? null,
  emailVerified: Boolean(d.emailVerified),
  createdAt: d.createdAt.toISOString(),
  lastSeenAt: d.lastSeenAt.toISOString(),
  termsAcceptedAt: d.termsAcceptedAt ?? null,
};

/** Creates the account on first sight and refreshes the profile after. */
export async function upsertUser(u) {
  const at = now();
  const doc = await col('users').findOneAndUpdate(
    { _id: u.uid },
    {
      $set: {
        email: u.email ?? null,
        name: u.name ?? null,
        photoUrl: u.picture ?? u.photoUrl ?? null,
        provider: u.provider ?? null,
        emailVerified: Boolean(u.emailVerified),
        lastSeenAt: at,
      },
      $setOnInsert: { createdAt: at, termsAcceptedAt: null },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return userFromDoc(doc);
}

export const getUser = async (uid) => userFromDoc(await col('users').findOne({ _id: uid }));

/** Records consent. Overwritten each time, so re-accepting changed terms is possible. */
export async function acceptTerms(uid, at = now().toISOString()) {
  const r = await col('users').updateOne({ _id: uid }, { $set: { termsAcceptedAt: at } });
  return r.matchedCount ? at : null;
}

// ------------------------------------------------------------------- runs ---

/**
 * Idempotent: linking the same run twice (a cache hit, then a join) is one row.
 * Only for an account that exists: a run finishing after its owner deleted their
 * account must not quietly write their uid back into the database.
 */
export async function linkRun(uid, runId) {
  if (!uid || !runId) return false;
  const exists = await col('users').countDocuments({ _id: uid }, { limit: 1 });
  if (!exists) return false;
  try {
    await col('user_runs').insertOne({ uid, runId, createdAt: now() });
    return true;
  } catch (err) {
    if (isDuplicate(err)) return false;
    throw err;
  }
}

export async function runIdsFor(uid) {
  const rows = await col('user_runs').find({ uid }, { projection: { runId: 1 } }).sort({ createdAt: -1 }).toArray();
  return rows.map((r) => r.runId);
}

// ------------------------------------------------------------------ usage ---

// Field names come from this list and never from a caller.
const KINDS = { analyses: 'analyses', briefs: 'briefs' };
const field = (kind) => {
  if (!KINDS[kind]) throw new Error(`Unknown usage kind: ${kind}`);
  return KINDS[kind];
};

export async function usageFor(uid, day) {
  const r = await col('usage').findOne({ uid, day });
  return { day, analyses: r?.analyses ?? 0, briefs: r?.briefs ?? 0 };
}

/**
 * Takes one unit of today's allowance, only if there is one left. The check and
 * the increment are ONE atomic operation (`{field: {$lt: limit}}` in the filter),
 * so two concurrent requests cannot both read "2 of 3 used" and both proceed.
 * The cost of spending first and checking after would be paid in YouTube quota.
 */
export async function tryConsume(uid, day, kind, limit) {
  const f = field(kind);
  try {
    await col('usage').updateOne({ uid, day }, { $setOnInsert: { analyses: 0, briefs: 0, createdAt: now() } }, { upsert: true });
  } catch (err) {
    if (!isDuplicate(err)) throw err; // two first requests raced to create the row: the other one won, which is fine
  }
  const r = await col('usage').findOneAndUpdate({ uid, day, [f]: { $lt: limit } }, { $inc: { [f]: 1 } }, { returnDocument: 'after' });
  if (r) return { ok: true, used: r[f], limit };
  return { ok: false, used: (await usageFor(uid, day))[f], limit };
}

/** Gives one unit back (a run that failed through no fault of the person). Never below 0. */
export async function refund(uid, day, kind) {
  const f = field(kind);
  await col('usage').updateOne({ uid, day, [f]: { $gt: 0 } }, { $inc: { [f]: -1 } });
}

/** Erases everything held about one account. Reports are not touched; see routes/api.js. */
export async function deleteUserData(uid) {
  const [users, runs, usage] = await Promise.all([
    col('users').deleteOne({ _id: uid }),
    col('user_runs').deleteMany({ uid }),
    col('usage').deleteMany({ uid }),
  ]);
  return { users: users.deletedCount, runs: runs.deletedCount, usage: usage.deletedCount };
}
