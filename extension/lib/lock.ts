// Serialises async read-modify-write sections on chrome.storage (single service worker, async handlers).
// Each caller gets its own lock; never call one lock's function from inside the same lock.
export function createLock() {
  let tail: Promise<unknown> = Promise.resolve();
  return function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}
