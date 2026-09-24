import fs from 'node:fs';

/**
 * A tiny cross-process mutex for a state file guarded by a sibling `.lock`
 * file. Node's main thread does not interleave JS between two synchronous
 * statements, so a single process never needs this -- quota.js's read-then-
 * write was always atomic *within one process*. The real gap was across
 * processes: nothing stopped a second server instance (or a leftover dev
 * process still holding the port) from reading the same `used` value and
 * writing its own increment on top, silently dropping the other one.
 *
 * `fs.openSync(path, 'wx')` is the primitive this leans on: 'wx' creates the
 * file only if it does not already exist and throws EEXIST otherwise, which
 * is atomic at the OS level -- two processes racing to create the same lock
 * file can never both succeed.
 */
const STALE_MS = 5000; // a holder that crashed mid-lock shouldn't wedge every future call forever
const SPIN_MS = 5;
const MAX_WAIT_MS = 2000;

function tryAcquire(lockPath) {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    try {
      if (Date.now() - fs.statSync(lockPath).mtimeMs > STALE_MS) {
        fs.unlinkSync(lockPath); // previous holder almost certainly crashed -- clear it and retry
      }
    } catch { /* lock vanished between the stat and the unlink -- fine, next loop iteration retries */ }
    return false;
  }
}

// A real (non-busy-looping-the-CPU) synchronous sleep. Node's main thread
// permits Atomics.wait, unlike a browser's -- this is what makes a genuinely
// synchronous mutex possible here without an external dependency.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Runs `fn` while holding an exclusive lock on `${path}.lock`. Spins with a
 * short sleep between attempts; if the lock still can't be acquired after
 * MAX_WAIT_MS (only plausible if a lock is stuck and younger than STALE_MS,
 * or the filesystem itself is failing), runs `fn` anyway rather than hanging
 * the request forever -- a rare lost increment is the pre-existing behavior,
 * not a regression, and is far better than every analysis wedging.
 */
export function withLock(path, fn) {
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + MAX_WAIT_MS;
  let acquired = false;

  while (!acquired && Date.now() < deadline) {
    acquired = tryAcquire(lockPath);
    if (!acquired) sleepSync(SPIN_MS);
  }

  try {
    return fn();
  } finally {
    if (acquired) {
      try { fs.unlinkSync(lockPath); } catch { /* already gone -- fine */ }
    }
  }
}
