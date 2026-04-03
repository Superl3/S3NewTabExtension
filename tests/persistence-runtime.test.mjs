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
