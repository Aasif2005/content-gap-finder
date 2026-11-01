import { MongoClient } from 'mongodb';
import { config } from '../config.js';

/**
 * The one MongoDB connection (Atlas). Everything the server remembers lives in
 * these collections; nothing is written to local disk any more, so the server
 * can run anywhere and be replaced without losing data.
 *
 *   users          accounts                         _id = Firebase uid
 *   usage          daily allowance counters         unique (uid, day)
 *   user_runs      which reports an account ran     unique (uid, runId)
 *   runs           finished reports + list summary  _id = runId, TTL backstop
 *   expired_runs   "this report was removed" markers
 *   briefs         "Make it" drafts                 TTL backstop
 *   niche_history  per-subject gap history          kept 36 months
 *   watches        saved searches
 *   quota          the shared YouTube budget ledger
 *   cache          query-hash result cache          TTL
 *   audit_runs     per-run audit logs               TTL
 *   waitlist       emails wanting a paid plan       unique (email, plan), no TTL
 *
 * YouTube data may be kept 30 days (Developer Policies III.E.4). The retention
 * sweep (services/retention.js) deletes by date and records what it removed;
 * every collection that holds YouTube data also has a TTL index as a backstop,
 * so a stopped sweeper can never leave data past the limit.
 */
const DAY = 24 * 3600;

let client = null;
let database = null;

/** Opens the connection (once) and makes sure the indexes exist. */
export async function connectMongo({ uri = config.mongo.uri, dbName = config.mongo.dbName } = {}) {
  if (database) return database;
  if (!uri) throw new Error('MONGODB_URI is not set. Add the Atlas connection string to .env (see .env.example).');
  const c = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000, appName: 'gapstronaut', ignoreUndefined: true });
  try {
    await c.connect();
    const d = c.db(dbName);
    await d.command({ ping: 1 });
    await ensureIndexes(d);
    client = c;
    database = d;
    return database;
  } catch (err) {
    await c.close().catch(() => {});
    throw describeConnectError(err);
  }
}

function describeConnectError(err) {
  const msg = String(err?.message ?? err);
  let hint = '';
  if (/auth/i.test(msg)) hint = ' Check the database user name and password in MONGODB_URI (Atlas → Database Access).';
  else if (/ENOTFOUND|querySrv|getaddrinfo/i.test(msg)) hint = ' Check the cluster host name in MONGODB_URI and your internet connection.';
  else if (/timed out|selection|ECONN/i.test(msg)) hint = ' Atlas probably blocks this machine: add its IP address under Atlas → Network Access.';
  return Object.assign(new Error(`Could not connect to MongoDB Atlas: ${msg.split('\n')[0]}.${hint}`), { cause: err });
}

export const db = () => {
  if (!database) throw new Error('MongoDB is not connected yet (connectMongo() runs at server start).');
  return database;
};
export const col = (name) => db().collection(name);

export async function closeMongo() {
  const c = client;
  client = null;
  database = null;
  if (c) await c.close().catch(() => {});
}

/** Tests point the layer at a throwaway database instead of the real one. */
export async function dropDatabase() {
  if (database) await database.dropDatabase();
}

export async function ensureIndexes(d = db()) {
  const ttl = (name, field, seconds) => d.collection(name).createIndex({ [field]: 1 }, { expireAfterSeconds: seconds });
  await Promise.all([
    d.collection('usage').createIndex({ uid: 1, day: 1 }, { unique: true }),
    ttl('usage', 'createdAt', 60 * DAY),
    d.collection('user_runs').createIndex({ uid: 1, runId: 1 }, { unique: true }),
    d.collection('user_runs').createIndex({ uid: 1, createdAt: -1 }),
    d.collection('runs').createIndex({ generatedAt: -1 }),
    d.collection('runs').createIndex({ nicheKey: 1, generatedAt: -1 }),
    d.collection('runs').createIndex({ channelId: 1, generatedAt: -1 }),
    ttl('runs', 'expireAt', 0),
    ttl('expired_runs', 'expiredAt', 365 * DAY),
    d.collection('briefs').createIndex({ runId: 1 }),
    ttl('briefs', 'expireAt', 0),
    d.collection('niche_history').createIndex({ nicheKey: 1, generatedAt: 1 }),
    ttl('niche_history', 'expireAt', 0),
    d.collection('watches').createIndex({ ownerUid: 1 }),
    d.collection('watches').createIndex({ enabled: 1, nextRunAt: 1 }),
    ttl('cache', 'expireAt', 0),
    d.collection('audit_runs').createIndex({ startedAt: -1 }),
    ttl('audit_runs', 'expireAt', 0),
    d.collection('waitlist').createIndex({ email: 1, plan: 1 }, { unique: true }),
  ]);
}
