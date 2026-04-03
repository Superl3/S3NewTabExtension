import test from "node:test";
import assert from "node:assert/strict";

import { createHistoryUndoRuntime } from "../core/history-undo-runtime.js";

function createHarness() {
  const state = { id: "state" };
  const undoState = {
    undoStack: [],
    redoStack: [],
    isRestoring: false
  };

  const calls = {
    touch: 0,
    restore: []
  };

  const runtime = createHistoryUndoRuntime({
    getState: () => state,
    getUndoState: () => undoState,
    historyLimit: 2,
    buildHistorySnapshot: () => ({ seq: calls.touch + undoState.undoStack.length + undoState.redoStack.length }),
    snapshotFingerprint: (snapshot) => JSON.stringify(snapshot),
    touchUserMutationClock: () => {
      calls.touch += 1;
    },
    materializeHistorySnapshot: (snapshot) => ({ ...snapshot, materialized: true }),
    restoreFromSnapshot: (snapshot, options) => {
      calls.restore.push({ snapshot, options });
    }
  });

  return { state, undoState, calls, runtime };
}

test("recordHistorySnapshot pushes undo and clears redo", () => {
  const harness = createHarness();
  harness.undoState.redoStack.push({ snapshot: { seq: 99 }, fingerprint: "x" });

  harness.runtime.recordHistorySnapshot("Update one");

  assert.equal(harness.undoState.undoStack.length, 1);
  assert.equal(harness.undoState.undoStack[0].label, "Update one");
  assert.equal(harness.undoState.redoStack.length, 0);
  assert.equal(harness.calls.touch, 1);
});

test("recordHistorySnapshot enforces history limit", () => {
  const harness = createHarness();

  harness.runtime.recordHistorySnapshot("A");
  harness.runtime.recordHistorySnapshot("B");
  harness.runtime.recordHistorySnapshot("C");

  assert.equal(harness.undoState.undoStack.length, 2);
});

test("undoLastChange restores previous snapshot and pushes redo", () => {
  const harness = createHarness();
  harness.undoState.undoStack.push({ label: "A", snapshot: { seq: 1 }, fingerprint: "1" });

  harness.runtime.undoLastChange();

  assert.equal(harness.undoState.redoStack.length, 1);
  assert.equal(harness.calls.restore.length, 1);
  assert.equal(harness.calls.restore[0].snapshot.materialized, true);
  assert.deepEqual(harness.calls.restore[0].options, { markAsUserMutation: true });
  assert.equal(harness.undoState.isRestoring, false);
});

test("redoLastChange restores redo snapshot and pushes undo", () => {
  const harness = createHarness();
  harness.undoState.redoStack.push({ label: "R", snapshot: { seq: 2 }, fingerprint: "2" });

  harness.runtime.redoLastChange();

  assert.equal(harness.undoState.undoStack.length, 1);
  assert.equal(harness.calls.restore.length, 1);
  assert.equal(harness.calls.restore[0].snapshot.materialized, true);
  assert.equal(harness.undoState.isRestoring, false);
});
