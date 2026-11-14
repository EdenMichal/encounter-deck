/**
 * Small helpers for async work that must not overlap. Pure, so they can be tested without Foundry.
 */

/**
 * Wrap an async function so that calls made while one is still running share its result instead of starting their
 * own. Once it settles, the next call runs it again. Used to create a world document at most once when several
 * callers find it missing at the same moment.
 */
export function sharedInFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () => {
    running ??= fn().finally(() => { running = null; });
    return running;
  };
}

/**
 * A queue that runs async tasks one at a time, in the order they were added. A task that fails doesn't stop the ones
 * after it; its caller still gets the error.
 */
export function createQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(() => task());
    tail = run.catch(() => undefined);
    return run;
  };
}
