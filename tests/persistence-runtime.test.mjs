import test from "node:test";
import assert from "node:assert/strict";

import { createPersistenceRuntime } from "../core/persistence-runtime.js";

function createHarness(overrides = {}) {
  const state = {
    meta: { lastUserMutationAt: 0 },
    instances: []
  };

  const persist = {
    saveTimer: null,
    saveAllowsNonUserMutation: false,
    lastSavedFingerprint: "",
    lastSavedUserMutationAt: 0,
    saveInFlightFingerprint: "",
    saveChain: Promise.resolve()
  };

  const calls = {
    saveState: [],
    restore: [],
    clearUndoRedo: 0,
    onChangedHandlers: []
  };

  const storage = {
    dashboard: null
  };

  let timerId = 0;
  const timers = new Map();

  const runtime = createPersistenceRuntime({
    storageKey: "dashboard",
    getState: () => state,
    getSaveTimer: () => persist.saveTimer,
    setSaveTimer: (value) => {
      persist.saveTimer = value;
    },
    getSaveAllowsNonUserMutation: () => persist.saveAllowsNonUserMutation,
    setSaveAllowsNonUserMutation: (value) => {
      persist.saveAllowsNonUserMutation = value;
    },
    getLastSavedFingerprint: () => persist.lastSavedFingerprint,
    setLastSavedFingerprint: (value) => {
      persist.lastSavedFingerprint = value;
    },
    getLastSavedUserMutationAt: () => persist.lastSavedUserMutationAt,
    setLastSavedUserMutationAt: (value) => {
      persist.lastSavedUserMutationAt = value;
    },
    getSaveInFlightFingerprint: () => persist.saveInFlightFingerprint,
    setSaveInFlightFingerprint: (value) => {
      persist.saveInFlightFingerprint = value;
    },
    getSaveChain: () => persist.saveChain,
    setSaveChain: (value) => {
      persist.saveChain = value;
    },
    setTimeout: (fn) => {
      timerId += 1;
      timers.set(timerId, fn);
      return timerId;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    now: () => 1000,
    randomToken: () => "abc123",
    structuredClone,
    applyRuntimeOnlyPolicyToSnapshot: () => {},
    chromeStorageLocalGet: async () => ({ dashboard: storage.dashboard }),
    chromeStorageOnChangedAddListener: (handler) => {
      calls.onChangedHandlers.push(handler);
    },
    saveState: async (snapshot) => {
      storage.dashboard = structuredClone(snapshot);
      calls.saveState.push(snapshot);
    },
    clearUndoRedo: () => {
      calls.clearUndoRedo += 1;
    },
    restoreFromSnapshot: (snapshot, options) => {
      calls.restore.push({ snapshot, options });
    },
    buildPersistSnapshot: () => ({ meta: { ...state.meta }, instances: state.instances.slice() }),
    onPersistError: () => {},
    ...overrides
  });

  return { state, persist, calls, storage, timers, runtime };
}

test("touchUserMutationClock initializes and increments mutation clock", () => {
  const harness = createHarness();
  harness.state.meta = null;

  const value = harness.runtime.touchUserMutationClock();
  assert.equal(value, 1000);
  assert.equal(harness.runtime.readUserMutationClock(harness.state), 1000);
});

test("persistLatestSnapshot saves when allowed without user mutation", async () => {
  const harness = createHarness();

  harness.runtime.persistLatestSnapshot({ allowNonUserMutation: true });
  await harness.persist.saveChain;

  assert.equal(harness.calls.saveState.length, 1);
  assert.ok(harness.persist.lastSavedFingerprint.length > 0);
});

test("queueSave schedules and flushes pending save", async () => {
  const harness = createHarness();

  harness.runtime.queueSave({ allowWithoutUserMutation: true });
  const callback = harness.timers.get(harness.persist.saveTimer);
  assert.equal(typeof callback, "function");

  callback();
  await harness.persist.saveChain;

  assert.equal(harness.calls.saveState.length, 1);
  assert.equal(harness.persist.saveAllowsNonUserMutation, false);
});

test("queueSave supports timeout functions that require global this binding", () => {
  let scheduledCallback = null;

  const harness = createHarness({
    setTimeout(fn) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      scheduledCallback = fn;
      return 77;
    },
    clearTimeout(id) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return id;
    }
  });

  assert.doesNotThrow(() => {
    harness.runtime.queueSave({ allowWithoutUserMutation: true });
  });
  assert.equal(harness.persist.saveTimer, 77);
  assert.equal(typeof scheduledCallback, "function");
});

test("syncFromExternalSnapshot supports structuredClone that requires global this binding", () => {
  const harness = createHarness({
    structuredClone(value) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return JSON.parse(JSON.stringify(value));
    }
  });

  assert.doesNotThrow(() => {
    harness.runtime.syncFromExternalSnapshot({
      meta: { lastUserMutationAt: 20 },
      instances: [{ id: "clock-1" }]
    });
  });
  assert.equal(harness.calls.restore.length, 1);
});

test("syncFromExternalSnapshot restores newer incoming state", () => {
  const harness = createHarness();
  harness.state.meta.lastUserMutationAt = 10;
  harness.persist.lastSavedFingerprint = "old";

  const changed = harness.runtime.syncFromExternalSnapshot({
    meta: { lastUserMutationAt: 20 },
    instances: [{ id: "clock-1" }]
  });

  assert.equal(changed, true);
  assert.equal(harness.calls.clearUndoRedo, 1);
  assert.equal(harness.calls.restore.length, 1);
  assert.deepEqual(harness.calls.restore[0].options, { shouldSave: false });
});

test("wireStorageSync listens only local storage changes", () => {
  const harness = createHarness();
  harness.runtime.wireStorageSync();
  assert.equal(harness.calls.onChangedHandlers.length, 1);

  harness.calls.onChangedHandlers[0]({ dashboard: { newValue: { meta: { lastUserMutationAt: 30 } } } }, "local");
  assert.equal(harness.calls.restore.length, 1);

  harness.calls.onChangedHandlers[0]({ dashboard: { newValue: { meta: { lastUserMutationAt: 40 } } } }, "sync");
  assert.equal(harness.calls.restore.length, 1);
});

test("a delayed newer write cannot be overwritten by an older tab", async () => {
  let stored = { meta: { lastUserMutationAt: 0 }, instances: [] };
  let releaseWrite;
  let signalWrite;
  const writeStarted = new Promise((resolve) => { signalWrite = resolve; });
  const gate = new Promise((resolve) => { releaseWrite = resolve; });
  const writes = [];
  const sharedDeps = {
    chromeStorageLocalGet: async () => ({ dashboard: structuredClone(stored) }),
    saveState: async (snapshot) => {
      writes.push(snapshot.meta.lastUserMutationAt);
      signalWrite();
      await gate;
      stored = structuredClone(snapshot);
    }
  };
  const newer = createHarness(sharedDeps);
  const older = createHarness(sharedDeps);
  newer.state.meta.lastUserMutationAt = 200;
  older.state.meta.lastUserMutationAt = 100;
  const newWrite = newer.runtime.saveSnapshotIfNotStale(newer.state, "new", 200);
  await writeStarted;
  const oldWrite = older.runtime.saveSnapshotIfNotStale(older.state, "old", 100);
  releaseWrite();
  assert.deepEqual(await Promise.all([newWrite, oldWrite]), [true, false]);
  assert.deepEqual(writes, [200]);
  assert.equal(stored.meta.lastUserMutationAt, 200);
  assert.equal(older.calls.restore.length, 1);
});

test("simultaneous revisions keep the first saved dashboard and report the conflict", async () => {
  let conflicts = 0;
  const harness = createHarness({ onPersistConflict: () => { conflicts += 1; } });
  harness.state.meta.lastUserMutationAt = 100;
  harness.state.instances = [{ id: "local" }];
  harness.storage.dashboard = { meta: { lastUserMutationAt: 100 }, instances: [{ id: "other-tab" }] };
  const saved = await harness.runtime.saveSnapshotIfNotStale(harness.state, "local", 100);
  assert.equal(saved, false);
  assert.equal(harness.calls.saveState.length, 0);
  assert.equal(conflicts, 1);
  assert.equal(harness.calls.restore[0].snapshot.instances[0].id, "other-tab");
});

test("an identical saved revision is not reported as a conflict", async () => {
  const harness = createHarness({ onPersistConflict: () => assert.fail("identical snapshot is not a conflict") });
  harness.state.meta.lastUserMutationAt = 100;
  harness.storage.dashboard = structuredClone(harness.state);
  assert.equal(await harness.runtime.saveSnapshotIfNotStale(harness.state, "same", 100), true);
});

test("non-user cache updates can save at the existing revision", async () => {
  const harness = createHarness();
  harness.state.meta.lastUserMutationAt = 100;
  harness.state.cache = "fresh";
  harness.storage.dashboard = { meta: { lastUserMutationAt: 100 }, instances: [], cache: "old" };
  assert.equal(await harness.runtime.saveSnapshotIfNotStale(harness.state, "cache", 100, { allowNonUserMutation: true }), true);
  assert.equal(harness.storage.dashboard.cache, "fresh");
});

test("failed storage reads block writes and leave the mutation retryable", async () => {
  let failed = true;
  const errors = [];
  const harness = createHarness({
    chromeStorageLocalGet: async () => {
      if (failed) throw new Error("read failed");
      return {};
    },
    onPersistError: (error) => errors.push(error)
  });
  harness.state.meta.lastUserMutationAt = 100;
  harness.runtime.persistLatestSnapshot();
  await harness.persist.saveChain;
  assert.equal(harness.calls.saveState.length, 0);
  assert.equal(harness.persist.lastSavedUserMutationAt, 0);
  assert.equal(errors.length, 1);
  failed = false;
  harness.runtime.persistLatestSnapshot();
  await harness.persist.saveChain;
  assert.equal(harness.calls.saveState.length, 1);
  assert.equal(harness.persist.lastSavedUserMutationAt, 100);
});

test("a stale queued save does not replace a newer unsaved local edit", async () => {
  const harness = createHarness();
  harness.state.meta.lastUserMutationAt = 300;
  harness.storage.dashboard = { meta: { lastUserMutationAt: 200 }, instances: [] };
  assert.equal(await harness.runtime.saveSnapshotIfNotStale({ meta: { lastUserMutationAt: 100 } }, "old", 100), false);
  assert.equal(harness.calls.restore.length, 0);
  assert.equal(harness.state.meta.lastUserMutationAt, 300);
});
