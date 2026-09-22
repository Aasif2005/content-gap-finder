import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const STATE_DIR = path.resolve(fileURLToPath(new URL('../../.state', import.meta.url)));
const LEDGER = path.join(STATE_DIR, 'quota.json');

// YouTube resets project quota at midnight Pacific, not UTC.
function quotaDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function read() {
  try {
    const raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    if (raw.day === quotaDay()) return raw;
  } catch { /* first run, or corrupt ledger -> start fresh */ }
  return { day: quotaDay(), used: 0, calls: {} };
}

function write(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(state, null, 2));
}

/** Reserve units before an API call. Throws if it would exceed the daily budget. */
export function spend(kind, times = 1) {
  const cost = (config.youtube.cost[kind] ?? 1) * times;
  const state = read();
  if (state.used + cost > config.youtube.dailyUnitBudget) {
    const err = new Error(
      `YouTube daily quota budget exhausted (${state.used}/${config.youtube.dailyUnitBudget} units used). ` +
      `Resets at midnight America/Los_Angeles. Cached results still work.`
    );
    err.code = 'QUOTA_EXHAUSTED';
    err.status = 429;
    throw err;
  }
  state.used += cost;
  state.calls[kind] = (state.calls[kind] ?? 0) + times;
  write(state);
  return state.used;
}

export function quotaStatus() {
  const state = read();
  return {
    day: state.day,
    used: state.used,
    budget: config.youtube.dailyUnitBudget,
    remaining: Math.max(0, config.youtube.dailyUnitBudget - state.used),
    searchesLeft: Math.floor(
      Math.max(0, config.youtube.dailyUnitBudget - state.used) / config.youtube.cost.search
    ),
    byCall: state.calls,
  };
}
