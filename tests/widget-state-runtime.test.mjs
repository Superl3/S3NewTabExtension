import test from "node:test";
import assert from "node:assert/strict";

import { createWidgetStateRuntime } from "../core/widget-state-runtime.js";

function createHarness(overrides = {}) {
  const state = {
    selectedWidgetId: "",
    ui: {
      home: {
        activePage: 0
      }
    },
    instances: []
  };

  const runtimeMap = new Map();
  const calls = {
    history: [],
    touched: 0,
    appended: 0,
    normalizeContainerAssignments: 0,
    renderBoard: 0,
    renderSettings: 0,
    refreshWidgets: [],
    save: 0,
    placeholderCommits: [],
    clearPending: 0,
    normalizeDocked: 0,
    applyLayout: [],
    updateBoardBounds: 0,
    closeWidgetModal: 0,
    renderDockWidgets: 0,
    controllerDestroyed: 0,
    cardRemoved: 0
  };

  const deps = {
    getState: () => state,
    elements: {
      board: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 })
      }
    },
    runtimeMap,
    modalState: { open: false, widgetId: "" },
    instanceById: (id) => state.instances.find((instance) => String(instance.id) === String(id)) || null,
    normalizeContainerId: (value) => String(value || "").trim(),
    canPlaceWidgetInContainer: () => true,
    recordHistorySnapshot: (label) => {
      calls.history.push(label);
    },
    touchUserMutationClock: () => {
      calls.touched += 1;
    },
    appendWidgetToContainerOrder: () => {
      calls.appended += 1;
    },
    normalizeContainerAssignments: () => {
      calls.normalizeContainerAssignments += 1;
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
    normalizeWidgetPage: (value, pageCount, fallback) => {
      const page = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
      return Math.max(0, Math.min(Math.max(0, pageCount - 1), page));
    },
    currentLauncherPageCount: () => 3,
    currentLauncherActivePage: () => 1,
    isLauncherPlaceholderPolicyActive: () => false,
    isPlaceholderLauncherPage: (page, pageCount) => page < 0 || page >= pageCount,
    commitPlaceholderPageDrop: (widgetId, payload, page) => {
      calls.placeholderCommits.push({ widgetId, payload, page });
      return true;
    },
    clearPendingPlaceholderDrop: () => {
      calls.clearPending += 1;
    },
    projectWidgetBoardDropLayout: () => ({
      page: 1,
      layout: { x: 10, y: 20, w: 300, h: 220 },
      gridLayout: null
    }),
    isWidgetDocked: (instance) => Number.isFinite(instance?.dockOrder),
    normalizeDockedWidgetOrders: () => {
      calls.normalizeDocked += 1;
    },
    applyLayout: (card, layout, page) => {
      calls.applyLayout.push({ card, layout: { ...layout }, page });
    },
    containerUnitLayoutSize: () => ({ w: 111, h: 222 }),
    updateBoardBounds: () => {
      calls.updateBoardBounds += 1;
    },
    closeWidgetModal: () => {
      calls.closeWidgetModal += 1;
    },
    compactEmptyLauncherPagesForUseMode: () => false,
    renderDockWidgets: () => {
      calls.renderDockWidgets += 1;
    },
    isBoardWidgetInstance: (instance) => Boolean(instance && !Number.isFinite(instance?.dockOrder) && !String(instance?.containerId || "")),
    isWidgetInContainer: (instance) => Boolean(String(instance?.containerId || "")),
    ...overrides
  };

  return {
    state,
    runtimeMap,
    calls,
    runtime: createWidgetStateRuntime(deps)
  };
}

test("setWidgetContainer moves widget into container and updates state", () => {
  const harness = createHarness();
  harness.state.instances = [
    { id: "w1", type: "note", containerId: "", dockOrder: 2 },
    { id: "c1", type: "container" }
  ];
  harness.state.selectedWidgetId = "w1";

  const moved = harness.runtime.setWidgetContainer("w1", "c1");

  assert.equal(moved, true);
  assert.equal(harness.state.instances[0].containerId, "c1");
  assert.equal(harness.state.instances[0].dockOrder, null);
  assert.equal(harness.state.selectedWidgetId, "");
  assert.deepEqual(harness.calls.history, ["Move widget to folder"]);
  assert.equal(harness.calls.appended, 1);
  assert.equal(harness.calls.normalizeContainerAssignments, 1);
  assert.equal(harness.calls.renderBoard, 1);
  assert.equal(harness.calls.renderSettings, 1);
  assert.equal(harness.calls.save, 1);
});

test("releaseWidgetFromDockByDrop immediately commits placeholder page drops", () => {
  const harness = createHarness({
    isLauncherPlaceholderPolicyActive: () => true,
    isPlaceholderLauncherPage: () => true
  });
  harness.state.instances = [{ id: "w1", type: "note", dockOrder: 1, containerId: "", layout: { x: 0, y: 0, w: 100, h: 80 } }];

  const released = harness.runtime.releaseWidgetFromDockByDrop("w1", { page: 99, clientX: 10, clientY: 20 });

  assert.equal(released, true);
  assert.equal(harness.calls.placeholderCommits.length, 1);
  assert.equal(harness.calls.history.length, 0);
  assert.equal(harness.calls.renderBoard, 0);
  assert.equal(harness.calls.save, 0);
});

test("releaseWidgetFromContainerByDrop immediately commits placeholder page drops", () => {
  const harness = createHarness({
    isLauncherPlaceholderPolicyActive: () => true,
    isPlaceholderLauncherPage: () => true
  });
  harness.state.instances = [
    { id: "w1", type: "note", page: 0, containerId: "c1", layout: { x: 0, y: 0, w: 100, h: 80 } },
    { id: "c1", type: "container", page: 1, containerId: "" }
  ];

  const released = harness.runtime.releaseWidgetFromContainerByDrop("w1", { page: 99, clientX: 10, clientY: 20 });

  assert.equal(released, true);
  assert.equal(harness.calls.placeholderCommits.length, 1);
  assert.equal(harness.calls.history.length, 0);
  assert.equal(harness.calls.renderBoard, 0);
  assert.equal(harness.calls.save, 0);
});

test("patchWidgetLayout enforces container unit dimensions and refreshes", () => {
  const harness = createHarness();
  harness.state.instances = [{ id: "c1", type: "container", page: 0, layout: { x: 0, y: 0, w: 80, h: 80 } }];
  harness.runtimeMap.set("c1", {
    card: { id: "card-c1" },
    controller: {
      refresh() {
      }
    }
  });

  harness.runtime.patchWidgetLayout("c1", { x: 7, y: 8, w: 999, h: 999 });

  const instance = harness.state.instances[0];
  assert.equal(instance.layout.x, 7);
  assert.equal(instance.layout.y, 8);
  assert.equal(instance.layout.w, 111);
  assert.equal(instance.layout.h, 222);
  assert.deepEqual(harness.calls.history, ["Move widget"]);
  assert.equal(harness.calls.applyLayout.length, 1);
  assert.equal(harness.calls.updateBoardBounds, 1);
  assert.equal(harness.calls.renderSettings, 1);
  assert.equal(harness.calls.save, 1);
});

test("patchWidgetLayout can apply live layout without expensive side effects", () => {
  const harness = createHarness();
  harness.state.instances = [{ id: "w1", type: "note", page: 0, layout: { x: 0, y: 0, w: 80, h: 80 } }];
  harness.runtimeMap.set("w1", {
    card: { id: "card-w1" },
    controller: {}
  });

  const changed = harness.runtime.patchWidgetLayout("w1", { x: 12, y: 14 }, {
    record: false,
    touch: false,
    updateBounds: false,
    renderSettings: false,
    save: false
  });

  assert.equal(changed, true);
  assert.equal(harness.state.instances[0].layout.x, 12);
  assert.equal(harness.state.instances[0].layout.y, 14);
  assert.equal(harness.calls.applyLayout.length, 1);
  assert.equal(harness.calls.touched, 0);
  assert.equal(harness.calls.updateBoardBounds, 0);
  assert.equal(harness.calls.renderSettings, 0);
  assert.equal(harness.calls.save, 0);
});

test("removeWidget removes container and clears child container links", () => {
  const harness = createHarness({
    modalState: { open: true, widgetId: "c1" }
  });
  harness.state.instances = [
    { id: "c1", type: "container", page: 0, containerId: "" },
    { id: "w1", type: "note", page: 0, containerId: "c1" }
  ];
  harness.state.selectedWidgetId = "c1";
  harness.runtimeMap.set("c1", {
    card: {
      remove() {
        harness.calls.cardRemoved += 1;
      }
    },
    controller: {
      destroy() {
        harness.calls.controllerDestroyed += 1;
      }
    }
  });

  harness.runtime.removeWidget("c1");

  assert.equal(harness.state.instances.length, 1);
  assert.equal(harness.state.instances[0].id, "w1");
  assert.equal(harness.state.instances[0].containerId, "");
  assert.equal(harness.state.selectedWidgetId, "");
  assert.deepEqual(harness.calls.history, ["Remove widget"]);
  assert.equal(harness.calls.controllerDestroyed, 1);
  assert.equal(harness.calls.cardRemoved, 1);
  assert.equal(harness.calls.closeWidgetModal, 1);
  assert.equal(harness.calls.normalizeDocked, 1);
  assert.equal(harness.calls.normalizeContainerAssignments, 1);
  assert.equal(harness.calls.renderDockWidgets, 1);
  assert.equal(harness.calls.renderSettings, 1);
  assert.equal(harness.calls.renderBoard, 1);
  assert.equal(harness.calls.updateBoardBounds, 0);
  assert.equal(harness.calls.save, 1);
  assert.equal(harness.runtimeMap.has("c1"), false);
});
