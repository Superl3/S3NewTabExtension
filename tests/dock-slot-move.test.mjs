import test from "node:test";
import assert from "node:assert/strict";

import { moveWidgetToDockSlotRuntime } from "../core/dock-slot-move.js";

function createHarness(overrides = {}) {
  const state = {
    selectedWidgetId: "",
    ui: {
      home: {
        dockLength: 6
      }
    },
    instances: []
  };

  const calls = {
    history: [],
    touched: 0,
    setWidgetContainer: [],
    normalizeDocked: 0,
    setDockActive: [],
    closeModal: 0
  };

  const deps = {
    getState: () => state,
    buildDockConfig: () => ({ lengthUnits: 6 }),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    isDockEligibleWidget: () => true,
    normalizeDockOrder: (value, fallback) => {
      if (value === null || value === undefined || value === "") {
        return fallback;
      }
      const num = Number(value);
      return Number.isFinite(num) ? Math.floor(num) : fallback;
    },
    dockSlotOccupants: () => new Map(),
    firstAvailableDockSlot: () => 0,
    recordHistorySnapshot: (label) => {
      calls.history.push(label);
    },
    touchUserMutationClock: () => {
      calls.touched += 1;
    },
    isWidgetInContainer: (instance) => Boolean(String(instance?.containerId || "")),
    setWidgetContainer: (...args) => {
      calls.setWidgetContainer.push(args);
      return true;
    },
    normalizeDockedWidgetOrders: () => {
      calls.normalizeDocked += 1;
    },
    setDockActiveId: (id, options) => {
      calls.setDockActive.push({ id, options });
    },
    modalState: {
      open: false,
      widgetId: ""
    },
    closeWidgetModal: () => {
      calls.closeModal += 1;
    },
    ...overrides
  };

  return { state, calls, deps };
}

test("moveWidgetToDockSlotRuntime swaps occupied dock slot with previous slot", () => {
  const harness = createHarness();
  const movedInstance = { id: "w1", dockOrder: 4, containerId: "", type: "notes" };
  const occupant = { id: "w2", dockOrder: 1, containerId: "", type: "todo" };
  harness.state.instances = [movedInstance, occupant];
  harness.state.selectedWidgetId = "w1";
  harness.deps.modalState = { open: true, widgetId: "w1" };
  harness.deps.dockSlotOccupants = () => new Map([[1, occupant]]);

  const moved = moveWidgetToDockSlotRuntime(movedInstance, 1, { record: true }, harness.deps);

  assert.equal(moved, true);
  assert.equal(movedInstance.dockOrder, 1);
  assert.equal(occupant.dockOrder, 4);
  assert.equal(harness.state.selectedWidgetId, "");
  assert.deepEqual(harness.calls.history, ["Dock widget"]);
  assert.equal(harness.calls.touched, 0);
  assert.equal(harness.calls.normalizeDocked, 1);
  assert.deepEqual(harness.calls.setDockActive, [{ id: "w1", options: { rerender: false } }]);
  assert.equal(harness.calls.closeModal, 1);
});

test("moveWidgetToDockSlotRuntime undocks from container and touches clock when record is false", () => {
  const harness = createHarness();
  const movedInstance = { id: "w1", dockOrder: 2, containerId: "c1", type: "notes" };
  harness.state.instances = [movedInstance];

  const moved = moveWidgetToDockSlotRuntime(movedInstance, 2, { record: false }, harness.deps);

  assert.equal(moved, true);
  assert.equal(harness.calls.history.length, 0);
  assert.equal(harness.calls.touched, 1);
  assert.equal(harness.calls.setWidgetContainer.length, 1);
  assert.deepEqual(harness.calls.setWidgetContainer[0], [
    "w1",
    "",
    { record: false, rerender: false, save: false }
  ]);
  assert.equal(movedInstance.dockOrder, 2);
  assert.equal(harness.calls.normalizeDocked, 1);
});

test("moveWidgetToDockSlotRuntime returns false when fallback slot is unavailable", () => {
  const harness = createHarness({
    firstAvailableDockSlot: () => null
  });
  const movedInstance = { id: "w1", dockOrder: null, containerId: "", type: "notes" };
  const occupant = { id: "w2", dockOrder: 3, containerId: "", type: "todo" };
  harness.state.instances = [movedInstance, occupant];
  harness.deps.dockSlotOccupants = () => new Map([[3, occupant]]);

  const moved = moveWidgetToDockSlotRuntime(movedInstance, 3, { record: true }, harness.deps);

  assert.equal(moved, false);
  assert.equal(movedInstance.dockOrder, null);
  assert.equal(occupant.dockOrder, 3);
  assert.equal(harness.calls.history.length, 0);
  assert.equal(harness.calls.normalizeDocked, 0);
  assert.equal(harness.calls.setDockActive.length, 0);
});

test("moveWidgetToDockSlotRuntime ignores no-op move for already docked widget", () => {
  const harness = createHarness();
  const movedInstance = { id: "w1", dockOrder: 2, containerId: "", type: "notes" };
  harness.state.instances = [movedInstance];

  const moved = moveWidgetToDockSlotRuntime(movedInstance, 2, { record: true }, harness.deps);

  assert.equal(moved, false);
  assert.deepEqual(harness.calls.history, []);
  assert.equal(harness.calls.touched, 0);
  assert.equal(harness.calls.normalizeDocked, 0);
  assert.equal(harness.calls.setDockActive.length, 0);
});
