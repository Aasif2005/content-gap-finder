import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/**
 * Accounts and allowances. Reports, briefs and watches stay flat files (they are
 * YouTube data on a 30-day clock); this holds what is about PEOPLE, which has to
 * be counted atomically (a daily allowance read-then-written by two requests
 * would let both through) and deleted by uid on request.
 *
 * Built-in node:sqlite, so no native module to compile. WAL keeps readers from
 * blocking the one writer.
 */
const STATE_DIR = path.resolve(fileURLToPath(new URL('../../.state', import.meta.url)));
export const DEFAULT_DB_FILE = path.join(STATE_DIR, 'app.db');

// Appended to, never edited: `PRAGMA user_version` records how many have run.
const MIGRATIONS = [
  `CREATE TABLE users (
     uid TEXT PRIMARY KEY,
     email TEXT,
     name TEXT,
     photo_url TEXT,
     provider TEXT,
     email_verified INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     last_seen_at TEXT NOT NULL,
     terms_accepted_at TEXT
   );
   CREATE TABLE user_runs (
     uid TEXT NOT NULL,
     run_id TEXT NOT NULL,
     created_at TEXT NOT NULL,
     PRIMARY KEY (uid, run_id)
   );
   CREATE TABLE usage (
     uid TEXT NOT NULL,
     day TEXT NOT NULL,
     analyses INTEGER NOT NULL DEFAULT 0,
     briefs INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (uid, day)
   );`,
];

export function openDb(file = DEFAULT_DB_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // The scheduler and requests share one process, but a second process (a dev
  // server left running) must wait for the write lock rather than fail.
  db.exec('PRAGMA busy_timeout = 3000');
  db.exec('PRAGMA journal_mode = WAL');
  const { user_version: have } = db.prepare('PRAGMA user_version').get();
  for (let v = have; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

let shared;
/** The process-wide database, opened on first use. */
export const getDb = () => (shared ??= openDb());

const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------------ users ---

const userFromRow = (r) => !r ? null : {
  uid: r.uid,
  email: r.email,
  name: r.name,
  photoUrl: r.photo_url,
  provider: r.provider,
  emailVerified: Boolean(r.email_verified),
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
  termsAcceptedAt: r.terms_accepted_at,
};

/** Creates the account row on first sight and refreshes the profile after. */
export function upsertUser(u, db = getDb()) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (uid, email, name, photo_url, provider, email_verified, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(uid) DO UPDATE SET
       email = excluded.email, name = excluded.name, photo_url = excluded.photo_url,
       provider = excluded.provider, email_verified = excluded.email_verified,
       last_seen_at = excluded.last_seen_at`
  ).run(u.uid, u.email ?? null, u.name ?? null, u.picture ?? u.photoUrl ?? null, u.provider ?? null, u.emailVerified ? 1 : 0, now, now);
  return getUser(u.uid, db);
}

export const getUser = (uid, db = getDb()) => userFromRow(db.prepare('SELECT * FROM users WHERE uid = ?').get(uid));

/** Records consent. Overwritten each time, so re-accepting changed terms is possible. */
export function acceptTerms(uid, db = getDb(), at = nowIso()) {
  const r = db.prepare('UPDATE users SET terms_accepted_at = ? WHERE uid = ?').run(at, uid);
  return r.changes ? at : null;
}

// ------------------------------------------------------------------- runs ---

/**
 * Idempotent: linking the same run twice (a cache hit, then a join) is one row.
 * Only for an account that exists: a run finishing after its owner deleted their
 * account must not quietly write their uid back into the database.
 */
export function linkRun(uid, runId, db = getDb()) {
  if (!uid || !runId) return false;
  const r = db.prepare(
    'INSERT OR IGNORE INTO user_runs (uid, run_id, created_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE uid = ?)'
  ).run(uid, runId, nowIso(), uid);
  return r.changes > 0;
}

export const runIdsFor = (uid, db = getDb()) =>
  db.prepare('SELECT run_id FROM user_runs WHERE uid = ? ORDER BY created_at DESC').all(uid).map((r) => r.run_id);

// ------------------------------------------------------------------ usage ---

// Column names are interpolated into SQL below, so they come from this list and
// never from a caller.
const KINDS = { analyses: 'analyses', briefs: 'briefs' };
const column = (kind) => {
  if (!KINDS[kind]) throw new Error(`Unknown usage kind: ${kind}`);
  return KINDS[kind];
};

export function usageFor(uid, day, db = getDb()) {
  const r = db.prepare('SELECT analyses, briefs FROM usage WHERE uid = ? AND day = ?').get(uid, day);
  return { day, analyses: r?.analyses ?? 0, briefs: r?.briefs ?? 0 };
}

/**
 * Takes one unit of today's allowance, only if there is one left. The check and
 * the increment are ONE statement (`WHERE col < limit`), so two concurrent
 * requests cannot both read "2 of 3 used" and both proceed. The cost of
 * spending first and checking after would be paid in YouTube quota.
 */
export function tryConsume(uid, day, kind, limit, db = getDb()) {
  const col = column(kind);
  db.prepare('INSERT OR IGNORE INTO usage (uid, day) VALUES (?, ?)').run(uid, day);
  const r = db.prepare(`UPDATE usage SET ${col} = ${col} + 1 WHERE uid = ? AND day = ? AND ${col} < ?`).run(uid, day, limit);
  const used = usageFor(uid, day, db)[col];
  return { ok: r.changes > 0, used, limit };
}

/** Gives one unit back (a run that failed through no fault of the person). Never below 0. */
export function refund(uid, day, kind, db = getDb()) {
  const col = column(kind);
  db.prepare(`UPDATE usage SET ${col} = MAX(${col} - 1, 0) WHERE uid = ? AND day = ?`).run(uid, day);
}

/** Erases everything held about one account. Run files are not touched; see routes/api.js. */
export function deleteUserData(uid, db = getDb()) {
  db.exec('BEGIN');
  try {
    const users = db.prepare('DELETE FROM users WHERE uid = ?').run(uid).changes;
    const runs = db.prepare('DELETE FROM user_runs WHERE uid = ?').run(uid).changes;
    const usage = db.prepare('DELETE FROM usage WHERE uid = ?').run(uid).changes;
    db.exec('COMMIT');
    return { users, runs, usage };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
