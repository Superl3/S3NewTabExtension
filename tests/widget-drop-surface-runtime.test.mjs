import test from "node:test";
import assert from "node:assert/strict";

import { createWidgetDropSurfaceRuntime } from "../core/widget-drop-surface-runtime.js";

function createHarness(overrides = {}) {
  const calls = {
    reorder: [],
    setWidgetContainer: [],
    compact: 0,
    renderBoard: 0,
    renderSettings: 0,
    save: 0,
    history: [],
    touched: 0,
    moveWidgetToDockSlot: [],
    renderDockWidgets: 0
  };

  const deps = {
    containerDropTargetAtPoint: () => "",
    resolveContainerInsertIndexFromPointer: () => 0,
    normalizeContainerId: (value) => String(value || "").trim(),
    reorderWidgetInContainerByIndex: (...args) => {
      calls.reorder.push(args);
      return true;
    },
    isBoardWidgetInstance: (instance) => Boolean(instance && !Number.isFinite(instance?.dockOrder) && !String(instance?.containerId || "")),
    normalizeWidgetPage: (value, pageCount, fallback) => {
      const page = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
      return Math.max(0, Math.min(Math.max(0, pageCount - 1), page));
    },
    currentLauncherPageCount: () => 4,
    currentLauncherActivePage: () => 1,
    setWidgetContainer: (...args) => {
      calls.setWidgetContainer.push(args);
      return true;
    },
    compactEmptyLauncherPagesForUseMode: () => {
      calls.compact += 1;
      return true;
    },
    renderBoard: () => {
      calls.renderBoard += 1;
    },
    renderSettings: () => {
      calls.renderSettings += 1;
    },
    queueSave: () => {
      calls.save += 1;
    },
    isDockDropPoint: () => true,
    isDockEligibleWidget: () => true,
    isWidgetDocked: (instance) => Number.isFinite(instance?.dockOrder),
    isWidgetInContainer: (instance) => Boolean(String(instance?.containerId || "")),
    resolveDockDropSlotIndex: () => 2,
    recordHistorySnapshot: (label) => {
      calls.history.push(label);
    },
    touchUserMutationClock: () => {
      calls.touched += 1;
    },
    moveWidgetToDockSlot: (instance, targetSlot, options) => {
      calls.moveWidgetToDockSlot.push({ instance, targetSlot, options });
      return true;
    },
    renderDockWidgets: () => {
      calls.renderDockWidgets += 1;
    },
    ...overrides
  };

  return {
    calls,
    runtime: createWidgetDropSurfaceRuntime(deps)
  };
}

test("tryContainerWidgetByDrop reorders when widget is already in target container", () => {
  const harness = createHarness({
    containerDropTargetAtPoint: () => "c1",
    resolveContainerInsertIndexFromPointer: () => 3
  });

  const moved = harness.runtime.tryContainerWidgetByDrop(
    { id: "w1", containerId: "c1", dockOrder: null, page: 0 },
    { clientX: 30, clientY: 40 }
  );

  assert.equal(moved, true);
  assert.deepEqual(harness.calls.reorder, [["w1", "c1", 3, { record: true, rerender: true, save: true }]]);
  assert.equal(harness.calls.setWidgetContainer.length, 0);
  assert.equal(harness.calls.renderBoard, 0);
  assert.equal(harness.calls.save, 0);
});

test("tryContainerWidgetByDrop moves board widget into container and persists", () => {
  const harness = createHarness({
    containerDropTargetAtPoint: () => "c1",
    resolveContainerInsertIndexFromPointer: () => 1
  });

  const moved = harness.runtime.tryContainerWidgetByDrop(
    { id: "w1", containerId: "", dockOrder: null, page: 2 },
    { clientX: 10, clientY: 20 }
  );

  assert.equal(moved, true);
  assert.deepEqual(harness.calls.setWidgetContainer, [["w1", "c1", { record: true, rerender: false, save: false }]]);
  assert.deepEqual(harness.calls.reorder, [["w1", "c1", 1, { record: false, rerender: false, save: false }]]);
  assert.equal(harness.calls.compact, 1);
  assert.equal(harness.calls.renderBoard, 1);
  assert.equal(harness.calls.renderSettings, 1);
  assert.equal(harness.calls.save, 1);
});

test("tryDockWidgetByDrop records folder-to-dock move label", () => {
  const harness = createHarness({
    resolveDockDropSlotIndex: () => 4
  });
  const instance = { id: "w1", containerId: "c1", dockOrder: null, page: 1 };

  const moved = harness.runtime.tryDockWidgetByDrop(instance, { clientX: 50, clientY: 60 });

  assert.equal(moved, true);
  assert.deepEqual(harness.calls.history, ["Move widget from folder to dock"]);
  assert.equal(harness.calls.touched, 0);
  assert.deepEqual(harness.calls.moveWidgetToDockSlot, [{ instance, targetSlot: 4, options: { record: false } }]);
  assert.equal(harness.calls.renderDockWidgets, 1);
  assert.equal(harness.calls.compact, 0);
});

test("tryDockWidgetByDrop touches mutation clock for non-recorded move", () => {
  const harness = createHarness({
    resolveDockDropSlotIndex: () => 1
  });
  const instance = { id: "w1", containerId: "", dockOrder: null, page: 3 };

  const moved = harness.runtime.tryDockWidgetByDrop(instance, { clientX: 5, clientY: 9 }, { record: false });

  assert.equal(moved, true);
  assert.equal(harness.calls.history.length, 0);
  assert.equal(harness.calls.touched, 1);
  assert.equal(harness.calls.renderDockWidgets, 1);
  assert.equal(harness.calls.compact, 1);
});

test("tryDockWidgetByDrop returns false when slot resolution fails", () => {
  const harness = createHarness({
    resolveDockDropSlotIndex: () => null
  });

  const moved = harness.runtime.tryDockWidgetByDrop(
    { id: "w1", containerId: "", dockOrder: null, page: 0 },
    { clientX: 5, clientY: 9 }
  );

  assert.equal(moved, false);
  assert.equal(harness.calls.history.length, 0);
  assert.equal(harness.calls.touched, 0);
  assert.equal(harness.calls.moveWidgetToDockSlot.length, 0);
  assert.equal(harness.calls.renderDockWidgets, 0);
  assert.equal(harness.calls.compact, 0);
});
