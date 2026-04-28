import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { createAppWidgetRuntime } from "../core/widget/app-runtime.js";

function createHarness(overrides = {}) {
  const state = {
    selectedWidgetId: "w-board",
    mode: "edit",
    instances: []
  };

  const runtimeMap = new Map();
  const calls = {
    createWidgetCard: [],
    dropFactoryDeps: null,
    stateFactoryDeps: null,
    cardFactoryDeps: null,
    clearWidgetDragGuideState: 0,
    clearContainerDropTargets: 0,
    boardReplaceChildren: 0,
    syncLauncherPagingState: [],
    normalizeDockedWidgetOrders: [],
    syncZCounterFromState: 0,
    applyGridLayout: [],
    setSelected: [],
    setBodyMode: 0,
    updateBoardBounds: 0,
    applyLayout: [],
    renderBoardViewport: [],
    renderSettings: 0,
    destroyCalls: 0,
    containerRefresh: 0
  };

  const widgetDropSurfaceRuntime = {
    tryContainerWidgetByDrop(instance, pointerEvent, options) {
      return { kind: "container", instance, pointerEvent, options };
    },
    tryDockWidgetByDrop(instance, pointerEvent, options) {
      return { kind: "dock", instance, pointerEvent, options };
    }
  };

  const widgetStateRuntime = {
    setWidgetContainer(instanceId, containerId, options) {
      return { method: "setWidgetContainer", instanceId, containerId, options };
    },
    releaseWidgetFromContainerByDrop(widgetId, payload) {
      return { method: "releaseWidgetFromContainerByDrop", widgetId, payload };
    },
    releaseWidgetFromDockByDrop(widgetId, payload) {
      return { method: "releaseWidgetFromDockByDrop", widgetId, payload };
    },
    patchWidgetLayout(instanceId, layoutPatch, options) {
      return { method: "patchWidgetLayout", instanceId, layoutPatch, options };
    },
    removeWidget(instanceId) {
      return { method: "removeWidget", instanceId };
    }
  };

  const deps = {
    getState: () => state,
    widgetRegistry: {},
    elements: {
      board: {
        replaceChildren() {
          calls.boardReplaceChildren += 1;
        }
      }
    },
    runtimeMap,
    modalState: { open: false, widgetId: "" },
    buildWidgetControllerContext() {
      return {};
    },
    gridMetrics() {
      return {};
    },
    patchWidgetConfig() {},
    reorderWidgetInContainerByIndex() {},
    createWidgetDropSilhouette() {},
    resolveContainerInsertIndexFromPointer() {
      return 0;
    },
    projectWidgetBoardDropLayout() {
      return null;
    },
    updateCrossSurfaceDropIndicators() {},
    renderBoardViewport(payload) {
      calls.renderBoardViewport.push(payload);
    },
    setActiveLauncherPage() {},
    currentLauncherActivePage: () => 0,
    currentLauncherPageCount: () => 3,
    registerContainerDropTarget() {},
    unregisterContainerDropTarget() {},
    createDragPreviewSession() {},
    createWidgetDragPreview() {},
    positionWidgetDragPreview() {},
    updateWidgetDragGuideAtPointer() {},
    clearWidgetDragGuideState() {
      calls.clearWidgetDragGuideState += 1;
    },
    queueSave() {},
    instanceById(id) {
      return state.instances.find((instance) => instance.id === id) || null;
    },
    setSelected(widgetId) {
      calls.setSelected.push(widgetId);
    },
    openWidgetModal() {},
    attachWidgetTypeActions() {},
    attachWidgetCardClickBehavior() {},
    startWidgetCardDragSession() {},
    closeBoardContextMenu() {},
    bringWidgetToFront() {},
    setWidgetDropSilhouetteVisible() {},
    setDragDeleteZoneActive() {},
    setLauncherDragPlaceholderPolicy() {},
    updateDragDeleteZoneHover() {},
    createNoneDropPlan() {},
    resolveEdgeDirectionFromPointer() {
      return null;
    },
    getLauncherViewportRect() {
      return null;
    },
    syncLauncherPagingState(payload) {
      calls.syncLauncherPagingState.push(payload);
      return { activePage: 0, pageCount: 1 };
    },
    isLauncherPlaceholderPolicyActive: () => false,
    isPlaceholderLauncherPage: () => false,
    setLauncherVirtualPage() {},
    setLauncherVirtualPageState() {},
    createDeferredEdgeSwitchScheduler() {},
    evaluateAndRenderWidgetDragIndicators() {},
    evaluateFinalWidgetDrop() {
      return null;
    },
    resolveDraftPlacementAtPointer() {
      return null;
    },
    applyLayout(card, layout, page) {
      calls.applyLayout.push({ card, layout, page });
    },
    isGridLayoutMode: () => false,
    recordHistorySnapshot() {},
    widgetDefaultGridSize() {
      return { w: 1, h: 1 };
    },
    normalizeGridLayout(layout) {
      return layout;
    },
    clamp(value) {
      return value;
    },
    resolveBoundedDragPositionFromDelta() {
      return null;
    },
    cleanupBoardDragSession() {},
    applyWidgetDropPlan() {},
    clearPendingPlaceholderDrop() {},
    normalizeWidgetPage: (page) => page,
    applyGridLayout(payload) {
      calls.applyGridLayout.push(payload);
    },
    compactEmptyLauncherPagesForUseMode() {
      return false;
    },
    updateBoardBounds() {
      calls.updateBoardBounds += 1;
    },
    renderSettings() {
      calls.renderSettings += 1;
    },
    resolveSnappedPosition() {
      return null;
    },
    snap: 20,
    windowObj: {},
    createLongPressDragController() {
      return {
        schedule() {}
      };
    },
    widgetLongPressState: {},
    longPressDelayMs: 100,
    shortcutDelayMs: 50,
    baseMoveTolerance: 10,
    startWidgetPaddingDragSession() {},
    widgetPaddingFallback: 12,
    resolveWidgetPadding() {
      return null;
    },
    normalizeContentPadding(value) {
      return value;
    },
    projectContentPaddingFromDrag() {
      return null;
    },
    hasContentPaddingChanged: () => false,
    setLastDragEndAt() {},
    attachWidgetCardInteractionEvents() {},
    openWidgetTitleRenameModal() {},
    attachWidgetResizeHandle() {},
    startGridResizeSession() {},
    startFreeResizeSession() {},
    applyCardVisual() {},
    applyCardStack() {},
    getLastDragEndAt: () => 0,
    containerDropTargetAtPoint() {
      return "";
    },
    normalizeContainerId: (value) => String(value || "").trim(),
    isBoardWidgetInstance(instance) {
      return !Number.isFinite(instance?.dockOrder) && !String(instance?.containerId || "");
    },
    isWidgetDocked(instance) {
      return Number.isFinite(instance?.dockOrder);
    },
    isWidgetInContainer(instance) {
      return Boolean(String(instance?.containerId || ""));
    },
    isDockDropPoint: () => false,
    isDockEligibleWidget: () => true,
    resolveDockDropSlotIndex: () => 0,
    touchUserMutationClock() {},
    moveWidgetToDockSlot() {},
    canPlaceWidgetInContainer: () => true,
    appendWidgetToContainerOrder() {},
    normalizeContainerAssignments() {},
    refreshWidgetsByType() {},
    commitPlaceholderPageDrop() {
      return false;
    },
    containerUnitLayoutSize: () => ({ w: 1, h: 1 }),
    closeWidgetModal() {},
    normalizeDockedWidgetOrders(instances) {
      calls.normalizeDockedWidgetOrders.push(instances);
    },
    renderDockWidgets() {},
    clearContainerDropTargets() {
      calls.clearContainerDropTargets += 1;
    },
    syncZCounterFromState() {
      calls.syncZCounterFromState += 1;
    },
    setBodyMode() {
      calls.setBodyMode += 1;
    },
    createWidgetDropSurfaceRuntime(factoryDeps) {
      calls.dropFactoryDeps = factoryDeps;
      return widgetDropSurfaceRuntime;
    },
    createWidgetStateRuntime(factoryDeps) {
      calls.stateFactoryDeps = factoryDeps;
      return widgetStateRuntime;
    },
    createWidgetCardRuntime(factoryDeps) {
      calls.cardFactoryDeps = factoryDeps;
      return {
        createWidgetCard(instance) {
          calls.createWidgetCard.push(instance.id);
          return { instanceId: instance.id };
        }
      };
    },
    ...overrides
  };

  return {
    state,
    runtimeMap,
    calls,
    runtime: createAppWidgetRuntime(deps)
  };
}

test("createAppWidgetRuntime wires child runtimes through app-facing wrappers", () => {
  const harness = createHarness();

  assert.equal(typeof harness.calls.dropFactoryDeps.setWidgetContainer, "function");
  assert.equal(typeof harness.calls.stateFactoryDeps.renderBoard, "function");
  assert.equal(typeof harness.calls.cardFactoryDeps.tryContainerWidgetByDrop, "function");
  assert.equal(typeof harness.calls.cardFactoryDeps.removeWidget, "function");

  assert.deepEqual(
    harness.runtime.tryContainerWidgetByDrop({ id: "w1" }, { clientX: 1 }, { record: false }),
    { kind: "container", instance: { id: "w1" }, pointerEvent: { clientX: 1 }, options: { record: false } }
  );
  assert.deepEqual(
    harness.runtime.setWidgetContainer("w1", "c1", { save: false }),
    { method: "setWidgetContainer", instanceId: "w1", containerId: "c1", options: { save: false } }
  );
  assert.deepEqual(
    harness.runtime.patchWidgetLayout("w1", { x: 10 }, { record: false }),
    { method: "patchWidgetLayout", instanceId: "w1", layoutPatch: { x: 10 }, options: { record: false } }
  );
  assert.deepEqual(
    harness.runtime.createWidgetCard({ id: "w1" }),
    { instanceId: "w1" }
  );
});

test("renderBoard keeps app-facing board composition localized", () => {
  const harness = createHarness({
    isGridLayoutMode: () => true
  });
  harness.state.instances = [
    { id: "w-board", enabled: true, dockOrder: null, containerId: "" },
    { id: "w-disabled", enabled: false, dockOrder: null, containerId: "" },
    { id: "w-dock", enabled: true, dockOrder: 1, containerId: "" },
    { id: "w-contained", enabled: true, dockOrder: null, containerId: "c1" }
  ];
  harness.runtimeMap.set("old-1", {
    controller: {
      destroy() {
        harness.calls.destroyCalls += 1;
      }
    }
  });

  harness.runtime.renderBoard();

  assert.equal(harness.calls.clearWidgetDragGuideState, 1);
  assert.equal(harness.calls.clearContainerDropTargets, 1);
  assert.equal(harness.calls.destroyCalls, 1);
  assert.equal(harness.runtimeMap.size, 0);
  assert.equal(harness.calls.boardReplaceChildren, 0);
  assert.deepEqual(harness.calls.syncLauncherPagingState, [{ expandToFitInstances: true }]);
  assert.equal(harness.calls.normalizeDockedWidgetOrders.length, 1);
  assert.equal(harness.calls.syncZCounterFromState, 1);
  assert.deepEqual(harness.calls.createWidgetCard, ["w-board"]);
  assert.deepEqual(harness.calls.applyGridLayout, [{ commitFreeLayout: false, shouldSave: false }]);
  assert.deepEqual(harness.calls.setSelected, ["w-board"]);
  assert.equal(harness.calls.setBodyMode, 1);
  assert.equal(harness.calls.updateBoardBounds, 1);
});

test("refreshBoardCardsAfterLauncherPageMutation only refreshes board cards", () => {
  const harness = createHarness();
  harness.state.instances = [
    { id: "w-board", type: "note", page: 0, layout: { x: 1 } },
    { id: "c-board", type: "container", page: 1, layout: { x: 2 } },
    { id: "w-dock", type: "note", dockOrder: 0, containerId: "", page: 0, layout: { x: 3 } },
    { id: "w-contained", type: "note", dockOrder: null, containerId: "c-board", page: 0, layout: { x: 4 } }
  ];
  harness.runtimeMap.set("w-board", { card: { id: "card-board" }, controller: {} });
  harness.runtimeMap.set("c-board", {
    card: { id: "card-container" },
    controller: {
      refresh() {
        harness.calls.containerRefresh += 1;
      }
    }
  });
  harness.runtimeMap.set("w-dock", { card: { id: "card-dock" }, controller: {} });
  harness.runtimeMap.set("w-contained", { card: { id: "card-contained" }, controller: {} });

  harness.runtime.refreshBoardCardsAfterLauncherPageMutation({ animate: false });

  assert.deepEqual(harness.calls.applyLayout, [
    { card: { id: "card-board" }, layout: { x: 1 }, page: 0 },
    { card: { id: "card-container" }, layout: { x: 2 }, page: 1 }
  ]);
  assert.equal(harness.calls.containerRefresh, 1);
  assert.deepEqual(harness.calls.renderBoardViewport, [{ animate: false, dragging: false, dragOffsetX: 0 }]);
  assert.equal(harness.calls.renderSettings, 1);
});

test("releaseWidgetFromContainerByDrop can drive board rebuild through app-facing render wiring", () => {
  const order = [];
  const harness = createHarness({
    createWidgetStateRuntime(factoryDeps) {
      return {
        setWidgetContainer() {
          return false;
        },
        releaseWidgetFromContainerByDrop(widgetId, payload) {
          order.push(["release", widgetId, payload]);
          factoryDeps.clearPendingPlaceholderDrop();
          order.push("cleared-placeholder");
          harness.state.instances = [
            { id: "released-board", enabled: true, dockOrder: null, containerId: "", type: "note" },
            { id: "released-dock", enabled: true, dockOrder: 0, containerId: "", type: "note" }
          ];
          factoryDeps.renderBoard();
          order.push("rendered-board");
          factoryDeps.queueSave();
          order.push("saved");
          return { ok: true };
        },
        releaseWidgetFromDockByDrop() {
          return false;
        },
        patchWidgetLayout() {
          return false;
        },
        removeWidget() {
          return false;
        }
      };
    },
    clearPendingPlaceholderDrop() {
      order.push("clearPendingPlaceholderDrop");
    },
    queueSave() {
      order.push("queueSave");
    }
  });

  const result = harness.runtime.releaseWidgetFromContainerByDrop("w-folder", { page: 2, clientX: 10, clientY: 20 });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(order, [
    ["release", "w-folder", { page: 2, clientX: 10, clientY: 20 }],
    "clearPendingPlaceholderDrop",
    "cleared-placeholder",
    "rendered-board",
    "queueSave",
    "saved"
  ]);
  assert.deepEqual(harness.calls.createWidgetCard, ["released-board"]);
  assert.equal(harness.calls.clearWidgetDragGuideState, 1);
  assert.equal(harness.calls.clearContainerDropTargets, 1);
  assert.equal(harness.calls.boardReplaceChildren, 0);
});

test("app.js wires board visibility predicates into createAppWidgetRuntime", async () => {
  const source = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
  const start = source.indexOf("const appWidgetRuntimeCapabilities = {");
  const end = source.indexOf("function setWidgetContainer(", start);

  assert.notEqual(start, -1, "expected createAppWidgetRuntime capability wiring block in app.js");
  assert.notEqual(end, -1, "expected app widget runtime wrapper definitions in app.js");

  const wiringBlock = source.slice(start, end);
  assert.match(wiringBlock, /\bclearContainerDropTargets\b/, "expected clearContainerDropTargets to be passed to app widget runtime");
  assert.match(wiringBlock, /\bisWidgetDocked\b/, "expected isWidgetDocked to be passed to app widget runtime");
  assert.match(wiringBlock, /\bisWidgetInContainer\b/, "expected isWidgetInContainer to be passed to app widget runtime");
  assert.match(wiringBlock, /\bnormalizeDockedWidgetOrders\b/, "expected normalizeDockedWidgetOrders to be passed to app widget runtime");
  assert.match(wiringBlock, /\bsyncZCounterFromState\b/, "expected z-index sync to be passed to app widget runtime");
});

test("app.js keeps viewport container refresh lightweight", async () => {
  const source = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
  const start = source.indexOf("function renderBoardViewport(");
  const end = source.indexOf("function setActiveLauncherPage(", start);

  assert.notEqual(start, -1, "expected renderBoardViewport in app.js");
  assert.notEqual(end, -1, "expected setActiveLauncherPage after renderBoardViewport");

  const renderBoardViewportBlock = source.slice(start, end);
  assert.match(renderBoardViewportBlock, /refreshContainerPanelPositions\(\)/);
  assert.doesNotMatch(renderBoardViewportBlock, /refreshWidgetsByType\("container"\)/);
});

test("app.js positions board cards with transform variables", async () => {
  const [appSource, styleSource, dragMotionSource] = await Promise.all([
    fs.readFile(new URL("../app.js", import.meta.url), "utf8"),
    fs.readFile(new URL("../styles.css", import.meta.url), "utf8"),
    fs.readFile(new URL("../widget-drag-motion.css", import.meta.url), "utf8")
  ]);
  const start = appSource.indexOf("function applyLayout(");
  const end = appSource.indexOf("function isGridLayoutMode(", start);

  assert.notEqual(start, -1, "expected applyLayout in app.js");
  assert.notEqual(end, -1, "expected isGridLayoutMode after applyLayout");

  const applyLayoutBlock = appSource.slice(start, end);
  assert.match(applyLayoutBlock, /--widget-layout-x/);
  assert.match(applyLayoutBlock, /--widget-layout-y/);
  assert.doesNotMatch(applyLayoutBlock, /style\.left = `\$\{Math\.round/);
  assert.match(styleSource, /transform:\s*translate3d\(var\(--widget-layout-x\), var\(--widget-layout-y\), 0\)/);
  assert.match(
    dragMotionSource,
    /transform:\s*translate3d\(var\(--widget-layout-x\), var\(--widget-layout-y\), 0\)/
  );
  assert.doesNotMatch(dragMotionSource, /transform:\s*translate3d\(0,\s*0,\s*0\)/);
});

test("removeWidget can reuse app-facing renderBoard after normalization-sensitive mutation", () => {
  const order = [];
  const harness = createHarness({
    createWidgetStateRuntime(factoryDeps) {
      return {
        setWidgetContainer() {
          return false;
        },
        releaseWidgetFromContainerByDrop() {
          return false;
        },
        releaseWidgetFromDockByDrop() {
          return false;
        },
        patchWidgetLayout() {
          return false;
        },
        removeWidget(instanceId) {
          order.push(["remove", instanceId]);
          harness.state.instances = [
            { id: "remaining-board", enabled: true, dockOrder: null, containerId: "", type: "note" },
            { id: "remaining-contained", enabled: true, dockOrder: null, containerId: "folder-1", type: "note" }
          ];
          factoryDeps.normalizeDockedWidgetOrders(harness.state.instances);
          order.push("normalized-dock");
          factoryDeps.renderDockWidgets();
          order.push("rendered-dock");
          factoryDeps.renderSettings();
          order.push("rendered-settings");
          factoryDeps.renderBoard();
          order.push("rendered-board");
          return { removed: instanceId };
        }
      };
    },
    normalizeDockedWidgetOrders(instances) {
      order.push(["normalizeDockedWidgetOrders", instances.map((item) => item.id)]);
      harness.calls.normalizeDockedWidgetOrders.push(instances);
    },
    renderDockWidgets() {
      order.push("renderDockWidgets");
    },
    renderSettings() {
      order.push("renderSettings");
      harness.calls.renderSettings += 1;
    }
  });

  const result = harness.runtime.removeWidget("deleted-widget");

  assert.deepEqual(result, { removed: "deleted-widget" });
  assert.deepEqual(order, [
    ["remove", "deleted-widget"],
    ["normalizeDockedWidgetOrders", ["remaining-board", "remaining-contained"]],
    "normalized-dock",
    "renderDockWidgets",
    "rendered-dock",
    "renderSettings",
    "rendered-settings",
    ["normalizeDockedWidgetOrders", ["remaining-board", "remaining-contained"]],
    "rendered-board"
  ]);
  assert.deepEqual(harness.calls.createWidgetCard, ["remaining-board"]);
  assert.equal(harness.calls.boardReplaceChildren, 0);
  assert.equal(harness.calls.renderSettings, 1);
  assert.equal(harness.calls.normalizeDockedWidgetOrders.length, 2);
});

test("releaseWidgetFromDockByDrop preserves placeholder commit wiring through app layer", () => {
  const order = [];
  const harness = createHarness({
    createWidgetStateRuntime(factoryDeps) {
      return {
        setWidgetContainer() {
          return false;
        },
        releaseWidgetFromContainerByDrop() {
          return false;
        },
        releaseWidgetFromDockByDrop(widgetId, payload) {
          order.push(["releaseDock", widgetId, payload]);
          if (factoryDeps.isLauncherPlaceholderPolicyActive() && factoryDeps.isPlaceholderLauncherPage(payload.page, factoryDeps.currentLauncherPageCount())) {
            return factoryDeps.commitPlaceholderPageDrop(widgetId, payload, payload.page);
          }
          return false;
        },
        patchWidgetLayout() {
          return false;
        },
        removeWidget() {
          return false;
        }
      };
    },
    isLauncherPlaceholderPolicyActive: () => true,
    isPlaceholderLauncherPage: (page, pageCount) => page >= pageCount,
    currentLauncherPageCount: () => 3,
    commitPlaceholderPageDrop(widgetId, payload, page) {
      order.push(["commitPlaceholder", widgetId, payload, page]);
      return { committed: true, widgetId, page };
    }
  });

  const result = harness.runtime.releaseWidgetFromDockByDrop("dock-widget", { page: 3, clientX: 50 });

  assert.deepEqual(result, { committed: true, widgetId: "dock-widget", page: 3 });
  assert.deepEqual(order, [
    ["releaseDock", "dock-widget", { page: 3, clientX: 50 }],
    ["commitPlaceholder", "dock-widget", { page: 3, clientX: 50 }, 3]
  ]);
  assert.equal(harness.calls.boardReplaceChildren, 0);
  assert.deepEqual(harness.calls.createWidgetCard, []);
});
