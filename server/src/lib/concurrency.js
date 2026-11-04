/**
 * Runs `fn(item, index)` over `items` with at most `limit` calls in flight and
 * returns the results in input order. The first rejection rejects the whole
 * call and stops starting new items (ones already in flight finish on their own).
 */
export async function mapLimit(items, limit, fn) {
  const list = [...items];
  const results = new Array(list.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < list.length) {
      const i = next++;
      try {
        results[i] = await fn(list[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, worker));
  return results;
}

/** A lock for one process: calls passed to the returned function run one at a time, in order. */
export function serialized(fn) {
  let tail = Promise.resolve();
  return (...args) => {
    const run = tail.then(() => fn(...args));
    tail = run.catch(() => {});
    return run;
  };
}
