const fallbackQueues = new Map();

export function withPersistenceLock(storageKey, action, lockManager = globalThis.navigator?.locks) {
  const name = `s3newtab:persist:${storageKey}`;
  if (typeof lockManager?.request === "function") {
    return lockManager.request(name, { mode: "exclusive" }, action);
  }
  if (globalThis.location?.protocol === "chrome-extension:") {
    return Promise.reject(new Error("Safe dashboard storage is unavailable. Reopen this tab to retry."));
  }

  // Local previews and tests share a queue; real extension tabs require Web Locks.
  const previous = fallbackQueues.get(name) || Promise.resolve();
  const pending = previous.then(action, action);
  fallbackQueues.set(name, pending);
  const cleanup = () => {
    if (fallbackQueues.get(name) === pending) {
      fallbackQueues.delete(name);
    }
  };
  pending.then(cleanup, cleanup);
  return pending;
}
