import test from "node:test";
import assert from "node:assert/strict";

import {
  captureResetPreservedData,
  restoreResetPreservedData
} from "../core/reset-state-preservation.js";

test("captureResetPreservedData captures mutation clock, presets, and cloned default profile", () => {
  const source = {
    presets: [{ id: "p1" }],
    ui: {
      defaultProfileSnapshot: { instances: [{ id: "w1" }] },
      defaultProfileUpdatedAt: 1234
    }
  };

  const captured = captureResetPreservedData(source, {
    readUserMutationClock: () => 777,
    clonePresetSnapshot: (snapshot) => ({ ...snapshot, cloned: true })
  });

  assert.equal(captured.mutationClock, 777);
  assert.deepEqual(captured.presets, [{ id: "p1" }]);
  assert.deepEqual(captured.defaultProfileSnapshot, { instances: [{ id: "w1" }], cloned: true });
  assert.equal(captured.defaultProfileUpdatedAt, 1234);
});

test("restoreResetPreservedData restores preserved values to next state", () => {
  const restored = restoreResetPreservedData(
    { meta: {}, ui: {} },
    {
      mutationClock: 999,
      presets: [{ id: "p2" }],
      defaultProfileSnapshot: { instances: [{ id: "w2" }] },
      defaultProfileUpdatedAt: 4567
    }
  );

  assert.equal(restored.meta.lastUserMutationAt, 999);
  assert.deepEqual(restored.presets, [{ id: "p2" }]);
  assert.deepEqual(restored.ui.defaultProfileSnapshot, { instances: [{ id: "w2" }] });
  assert.equal(restored.ui.defaultProfileUpdatedAt, 4567);
});
