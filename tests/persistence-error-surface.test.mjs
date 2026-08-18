import assert from "node:assert/strict";
import test from "node:test";

import { QUOTA_WARN_RATIO, STORAGE_KEY, readStorageUsage, saveState } from "../storage.js";

function withGlobals(overrides, run) {
  const saved = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, globalThis[key]);
    if (value === undefined) {
      delete globalThis[key];
    } else {
      globalThis[key] = value;
    }
  }
  try {
    return run();
  } finally {
    for (const [key, value] of saved.entries()) {
      if (value === undefined) {
        delete globalThis[key];
      } else {
        globalThis[key] = value;
      }
    }
  }
}

test("saveState rejects with a typed quota error when storage is full", async () => {
  const quotaError = new Error("QUOTA_BYTES quota exceeded");

  await withGlobals(
    {
      chrome: {
        storage: {
          local: {
            QUOTA_BYTES: 5242880,
            set: () => Promise.reject(quotaError)
          }
        }
      }
    },
    async () => {
      await assert.rejects(
        () => saveState({ ok: true }),
        (error) => {
          assert.equal(error.name, "PersistQuotaError");
          assert.match(error.message, /storage is full/i);
          return true;
        }
      );
    }
  );
});

test("saveState rejects with a generic persist error for other failures", async () => {
  await withGlobals(
    {
      chrome: {
        storage: {
          local: {
            set: () => Promise.reject(new Error("extension context invalidated"))
          }
        }
      }
    },
    async () => {
      await assert.rejects(
        () => saveState({ ok: true }),
        (error) => {
          assert.equal(error.name, "PersistError");
          return true;
        }
      );
    }
  );
});

test("saveState resolves normally when storage accepts the write", async () => {
  const writes = [];

  await withGlobals(
    {
      chrome: {
        storage: {
          local: {
            set: (payload) => {
              writes.push(payload);
              return Promise.resolve();
            }
          }
        }
      }
    },
    async () => {
      await saveState({ ok: true });
    }
  );

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0][STORAGE_KEY], { ok: true });
});

test("saveState surfaces localStorage quota failures in fallback mode", async () => {
  const quotaError = new Error("QuotaExceededError");
  quotaError.name = "QuotaExceededError";

  await withGlobals(
    {
      chrome: undefined,
      localStorage: {
        setItem: () => {
          throw quotaError;
        }
      }
    },
    async () => {
      await assert.rejects(
        () => saveState({ ok: true }),
        (error) => {
          assert.equal(error.name, "PersistQuotaError");
          return true;
        }
      );
    }
  );
});

test("saveState stays silent when no storage backend exists", async () => {
  await withGlobals({ chrome: undefined, localStorage: undefined }, async () => {
    await saveState({ ok: true });
  });
});

test("readStorageUsage flags usage above the warning ratio", async () => {
  const quotaBytes = 1000;
  const usage = await withGlobals(
    {
      chrome: {
        storage: {
          local: {
            QUOTA_BYTES: quotaBytes,
            getBytesInUse: () => Promise.resolve(quotaBytes * QUOTA_WARN_RATIO + 1)
          }
        }
      }
    },
    () => readStorageUsage()
  );

  assert.equal(usage.nearQuota, true);
  assert.equal(usage.quotaBytes, quotaBytes);
});

test("readStorageUsage stays quiet below the warning ratio", async () => {
  const usage = await withGlobals(
    {
      chrome: {
        storage: {
          local: {
            QUOTA_BYTES: 1000,
            getBytesInUse: () => Promise.resolve(100)
          }
        }
      }
    },
    () => readStorageUsage()
  );

  assert.equal(usage.nearQuota, false);
});

test("readStorageUsage returns null when the API is unavailable", async () => {
  const usage = await withGlobals({ chrome: undefined, localStorage: undefined }, () =>
    readStorageUsage()
  );
  assert.equal(usage, null);
});

test("readStorageUsage returns null when getBytesInUse throws", async () => {
  const usage = await withGlobals(
    {
      chrome: {
        storage: {
          local: {
            QUOTA_BYTES: 1000,
            getBytesInUse: () => Promise.reject(new Error("unavailable"))
          }
        }
      }
    },
    () => readStorageUsage()
  );
  assert.equal(usage, null);
});
