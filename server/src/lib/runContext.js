import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * What a running analysis carries to the code it calls, without threading
 * arguments through every function: its cancel signal, and whether it was
 * asked for fresh data (`fresh` skips the YouTube source cache).
 */
const store = new AsyncLocalStorage();

export const withRun = (ctx, fn) => store.run(ctx, fn);
export const currentRun = () => store.getStore() ?? null;

export class CancelledError extends Error {
  constructor() {
    super('Analysis cancelled.');
    this.code = 'CANCELLED';
  }
}

/** Throws CancelledError if the person stopped the run in flight. A no-op outside a run. */
export function throwIfCancelled() {
  if (currentRun()?.signal?.aborted) throw new CancelledError();
}

/** A timeout that also fires when the run is cancelled, so a stopped run abandons its in-flight request. */
export function signalWithTimeout(ms) {
  const timeout = AbortSignal.timeout(ms);
  const own = currentRun()?.signal;
  return own ? AbortSignal.any([timeout, own]) : timeout;
}
