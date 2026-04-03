import test from "node:test";
import assert from "node:assert/strict";

import { createContainerOrderRuntime } from "../core/container-order-runtime.js";

function createHarness(overrides = {}) {
  const state = {
    instances: []
  };

  const calls = {
    history: [],
    touched: 0,
    renderBoard: 0,
    renderSettings: 0,
    refreshWidgets: [],
    save: 0
  };

  const deps = {
    getState: () => state,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    normalizeContainerId: (value) => String(value || "").trim(),
    instanceById: (id) => state.instances.find((item) => String(item?.id) === String(id)) || null,
    recordHistorySnapshot: (label) => {
      calls.history.push(label);
    },
    touchUserMutationClock: () => {
      calls.touched += 1;
    },
    renderBoard: () => {
      calls.renderBoard += 1;
    },
    renderSettings: () => {
      calls.renderSettings += 1;
    },
    refreshWidgetsByType: (type) => {
      calls.refreshWidgets.push(type);
    },
    queueSave: () => {
      calls.save += 1;
    },
    ...overrides
  };

  return {
    state,
    calls,
    runtime: createContainerOrderRuntime(deps)
  };
}

test("moveInstanceToStateIndex reorders by destination index", () => {
  const harness = createHarness();
  harness.state.instances = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "d" }
  ];

  const moved = harness.runtime.moveInstanceToStateIndex("b", 4);

  assert.equal(moved, true);
  assert.deepEqual(harness.state.instances.map((item) => item.id), ["a", "c", "d", "b"]);
});

test("appendWidgetToContainerOrder places widget after last sibling", () => {
  const harness = createHarness();
  harness.state.instances = [
    { id: "c1", type: "container" },
    { id: "w4", type: "search", containerId: "" },
    { id: "w1", type: "notes", containerId: "c1" },
    { id: "w2", type: "todo", containerId: "c1" },
    { id: "w3", type: "clock", containerId: "c1" }
  ];

  const moved = harness.runtime.appendWidgetToContainerOrder("w4", "c1");

  assert.equal(moved, true);
  assert.deepEqual(harness.state.instances.map((item) => item.id), ["c1", "w1", "w2", "w3", "w4"]);
});

test("reorderWidgetInContainerByIndex reorders and records history", () => {
  const harness = createHarness();
  harness.state.instances = [
    { id: "c1", type: "container" },
    { id: "w1", type: "notes", containerId: "c1" },
    { id: "w2", type: "todo", containerId: "c1" },
    { id: "w3", type: "clock", containerId: "c1" }
  ];

  const changed = harness.runtime.reorderWidgetInContainerByIndex("w3", "c1", 0);

  assert.equal(changed, true);
  assert.deepEqual(harness.state.instances.map((item) => item.id), ["c1", "w3", "w1", "w2"]);
  assert.deepEqual(harness.calls.history, ["Reorder folder widget"]);
  assert.equal(harness.calls.touched, 0);
  assert.equal(harness.calls.renderBoard, 1);
  assert.equal(harness.calls.renderSettings, 1);
  assert.equal(harness.calls.refreshWidgets.length, 0);
  assert.equal(harness.calls.save, 1);
});

test("reorderWidgetInContainerByIndex supports non-recorded non-rerender path", () => {
  const harness = createHarness();
  harness.state.instances = [
    { id: "c1", type: "container" },
    { id: "w1", type: "notes", containerId: "c1" },
    { id: "w2", type: "todo", containerId: "c1" }
  ];

  const changed = harness.runtime.reorderWidgetInContainerByIndex("w1", "c1", 2, {
    record: false,
    rerender: false,
    save: false
  });

  assert.equal(changed, true);
  assert.deepEqual(harness.state.instances.map((item) => item.id), ["c1", "w2", "w1"]);
  assert.deepEqual(harness.calls.history, []);
  assert.equal(harness.calls.touched, 1);
  assert.deepEqual(harness.calls.refreshWidgets, ["container"]);
  assert.equal(harness.calls.renderBoard, 0);
  assert.equal(harness.calls.renderSettings, 0);
  assert.equal(harness.calls.save, 0);
});
