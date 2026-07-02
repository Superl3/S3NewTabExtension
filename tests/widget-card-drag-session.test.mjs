import test from "node:test";
import assert from "node:assert/strict";

import { startWidgetCardDragSession } from "../core/widget-card-drag-session.js";

function createClassList(initial = []) {
  const set = new Set(initial);
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
    has(name) {
      return set.has(name);
    }
  };
}

function createCard() {
  return {
    classList: createClassList(),
    style: {
      setProperty() {},
      removeProperty() {}
    }
  };
}

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const current = listeners.get(type) || [];
      listeners.set(type, current.filter((entry) => entry !== handler));
    },
    firstListener(type) {
      return (listeners.get(type) || [])[0] || null;
    }
  };
}

function createPointerEvent({ button = 0, clientX = 0, clientY = 0, target = null } = {}) {
  let prevented = false;
  let stopped = false;
  return {
    button,
    clientX,
    clientY,
    target,
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      stopped = true;
    },
    get prevented() {
      return prevented;
    },
    get stopped() {
      return stopped;
    }
  };
}

function createBaseInstance() {
  return {
    id: "w1",
    type: "note",
    page: 0,
    layout: {
      x: 0,
      y: 0,
      w: 320,
      h: 200
    }
  };
}

test("startWidgetCardDragSession blocks when use mode drag not allowed", () => {
  const started = startWidgetCardDragSession({
    event: createPointerEvent({ button: 0, clientX: 10, clientY: 20 }),
    target: { closest: () => null },
    instance: createBaseInstance(),
    card: createCard(),
    isEditMode: () => false,
    windowObj: createEventTarget()
  });

  assert.equal(started, false);
});

test("startWidgetCardDragSession blocks interactive targets outside handle drag", () => {
  const started = startWidgetCardDragSession({
    event: createPointerEvent({ button: 0, clientX: 10, clientY: 20 }),
    target: { closest: () => ({ tagName: "BUTTON" }) },
    instance: createBaseInstance(),
    card: createCard(),
    isEditMode: () => true,
    windowObj: createEventTarget()
  });

  assert.equal(started, false);
});

test("startWidgetCardDragSession removes drag class when preview creation fails", () => {
  const card = createCard();

  const started = startWidgetCardDragSession({
    event: createPointerEvent({ button: 0, clientX: 10, clientY: 20 }),
    target: { closest: () => null },
    instance: createBaseInstance(),
    card,
    isEditMode: () => true,
    createDragPreviewSession: () => null,
    windowObj: createEventTarget()
  });

  assert.equal(started, false);
  assert.equal(card.classList.has("widget-drag-active"), false);
});

test("startWidgetCardDragSession preserves long-press top-left anchor before active styling", () => {
  const instance = createBaseInstance();
  const card = createCard();
  const windowObj = createEventTarget();
  let previewOptions = null;
  let activeDuringPreviewCreation = null;
  let activeDuringSilhouetteCreation = null;
  const previewSession = {
    update() {},
    getPointerOffset() {
      return { x: 0, y: 0 };
    },
    dispose() {}
  };

  const started = startWidgetCardDragSession({
    event: null,
    target: { closest: () => null },
    fromLongPress: true,
    startX: 240,
    startY: 180,
    allowUseMode: true,
    instance,
    card,
    isEditMode: () => false,
    closeBoardContextMenu: () => {},
    bringWidgetToFront: () => {},
    createDragPreviewSession: (_instance, options) => {
      previewOptions = options;
      activeDuringPreviewCreation = card.classList.has("widget-drag-active");
      return previewSession;
    },
    createWidgetDropSilhouette: () => {
      activeDuringSilhouetteCreation = card.classList.has("widget-drag-active");
      return { remove() {} };
    },
    setWidgetDropSilhouetteVisible: () => {},
    setDragDeleteZoneActive: () => {},
    setLauncherDragPlaceholderPolicy: () => {},
    updateDragDeleteZoneHover: () => {},
    createNoneDropPlan: () => ({ kind: "none" }),
    resolveEdgeDirectionFromPointer: () => 0,
    getLauncherViewportRect: () => ({ left: 0, right: 1200, top: 0, width: 1200, height: 800 }),
    syncLauncherPagingState: () => ({ pageCount: 1 }),
    isLauncherPlaceholderPolicyActive: () => false,
    isPlaceholderLauncherPage: () => false,
    currentLauncherPageCount: () => 1,
    currentLauncherActivePage: () => 0,
    setLauncherVirtualPage: () => {},
    setLauncherVirtualPageState: () => {},
    applyActiveDragPage: () => {},
    renderBoardViewport: () => {},
    createDeferredEdgeSwitchScheduler: () => ({
      schedule() {
        return false;
      },
      reset() {}
    }),
    getBoardRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    evaluateAndRenderWidgetDragIndicators: () => ({ dropPlan: { kind: "none" } }),
    evaluateFinalWidgetDrop: () => ({
      finalPayload: { clientX: 240, clientY: 180, page: 0 },
      finalDropPlan: { kind: "none" }
    }),
    resolveDraftPlacementAtPointer: () => ({ x: 0, y: 0 }),
    patchWidgetLayout: () => false,
    runtimeMap: new Map(),
    applyLayout: () => {},
    isGridLayoutMode: () => false,
    recordHistorySnapshot: () => {},
    gridMetrics: () => ({ cellW: 100, cellH: 80, gapX: 10, gapY: 10, marginX: 0, marginY: 0, cols: 4, rows: 4 }),
    widgetRegistry: {},
    widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 }),
    normalizeGridLayout: (_grid, fallback) => ({ ...fallback }),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    resolveBoundedDragPositionFromDelta: (layout) => layout,
    cleanupBoardDragSession: () => {},
    applyWidgetDropPlan: () => false,
    clearPendingPlaceholderDrop: () => {},
    normalizeWidgetPage: (page) => page,
    applyGridLayout: () => {},
    compactEmptyLauncherPagesForUseMode: () => {},
    queueSave: () => {},
    updateBoardBounds: () => {},
    renderSettings: () => {},
    resolveSnappedPosition: (x, y) => ({ x, y, changed: false }),
    snap: 20,
    windowObj
  });

  assert.equal(started, true);
  assert.equal(activeDuringPreviewCreation, false);
  assert.equal(activeDuringSilhouetteCreation, false);
  assert.equal(card.classList.has("widget-drag-active"), true);
  assert.equal(previewOptions.pointerEvent, null);
  assert.equal(previewOptions.pointerX, 240);
  assert.equal(previewOptions.pointerY, 180);
  assert.equal(previewOptions.fallbackPointerAnchor, "top-left");
});

test("startWidgetCardDragSession runs free drag lifecycle and commits snapped patch", () => {
  const instance = createBaseInstance();
  const card = createCard();
  const windowObj = createEventTarget();
  const scheduler = {
    scheduleCalls: 0,
    resetCalls: 0,
    schedule() {
      this.scheduleCalls += 1;
      return false;
    },
    reset() {
      this.resetCalls += 1;
    }
  };
  const previewSession = {
    updates: [],
    disposed: 0,
    update(x, y) {
      this.updates.push({ x, y });
    },
    getPointerOffset() {
      return { x: 12, y: 10 };
    },
    dispose() {
      this.disposed += 1;
    }
  };
  const dropSilhouette = {
    removed: 0,
    remove() {
      this.removed += 1;
    }
  };

  const patchCalls = [];
  let clearPlaceholderCalls = 0;
  let cleanupCalls = 0;

  const started = startWidgetCardDragSession({
    event: createPointerEvent({ button: 0, clientX: 10, clientY: 20, target: {} }),
    target: { closest: () => null },
    instance,
    card,
    isEditMode: () => true,
    setSelected: () => {},
    closeBoardContextMenu: () => {},
    bringWidgetToFront: () => {},
    createDragPreviewSession: () => previewSession,
    createWidgetDropSilhouette: () => dropSilhouette,
    setWidgetDropSilhouetteVisible: () => {},
    setDragDeleteZoneActive: () => {},
    setLauncherDragPlaceholderPolicy: () => {},
    updateDragDeleteZoneHover: () => {},
    createNoneDropPlan: () => ({ kind: "none" }),
    resolveEdgeDirectionFromPointer: () => 0,
    getLauncherViewportRect: () => ({ left: 0, right: 1200, top: 0, width: 1200, height: 800 }),
    syncLauncherPagingState: () => ({ pageCount: 3 }),
    isLauncherPlaceholderPolicyActive: () => false,
    isPlaceholderLauncherPage: () => false,
    currentLauncherPageCount: () => 3,
    currentLauncherActivePage: () => 0,
    setLauncherVirtualPage: () => {},
    setLauncherVirtualPageState: () => {},
    applyActiveDragPage: () => {},
    renderBoardViewport: () => {},
    createDeferredEdgeSwitchScheduler: () => scheduler,
    getBoardRect: () => ({ width: 1200, height: 800 }),
    evaluateAndRenderWidgetDragIndicators: () => ({ dropPlan: { kind: "none" } }),
    evaluateFinalWidgetDrop: () => ({
      finalPayload: { clientX: 90, clientY: 100, page: 0 },
      finalDropPlan: { kind: "none" }
    }),
    resolveDraftPlacementAtPointer: () => ({ x: 48, y: 52 }),
    patchWidgetLayout: (widgetId, patch, options) => {
      patchCalls.push({ widgetId, patch, options });
      instance.layout = {
        ...instance.layout,
        ...patch
      };
    },
    runtimeMap: new Map(),
    applyLayout: () => {},
    isGridLayoutMode: () => false,
    recordHistorySnapshot: () => {},
    gridMetrics: () => ({ cellW: 120, cellH: 100, gapX: 12, gapY: 12, marginX: 0, marginY: 0, cols: 6, rows: 5 }),
    widgetRegistry: {},
    widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 }),
    normalizeGridLayout: (_grid, fallback) => ({ ...fallback }),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    resolveBoundedDragPositionFromDelta: () => ({ x: 30, y: 40 }),
    cleanupBoardDragSession: ({ resetPendingPageSwitch, hideAndRemoveDropSilhouette, previewSession: session }) => {
      cleanupCalls += 1;
      resetPendingPageSwitch?.();
      hideAndRemoveDropSilhouette?.();
      session?.dispose?.();
    },
    applyWidgetDropPlan: () => false,
    clearPendingPlaceholderDrop: () => {
      clearPlaceholderCalls += 1;
    },
    normalizeWidgetPage: (page) => page,
    applyGridLayout: () => {},
    compactEmptyLauncherPagesForUseMode: () => {},
    queueSave: () => {},
    updateBoardBounds: () => {},
    renderSettings: () => {},
    resolveSnappedPosition: () => ({ x: 50, y: 60, changed: true }),
    snap: 20,
    windowObj
  });

  assert.equal(started, true);
  assert.equal(typeof windowObj.firstListener("pointermove"), "function");
  assert.equal(typeof windowObj.firstListener("pointerup"), "function");

  windowObj.firstListener("pointermove")(createPointerEvent({ clientX: 30, clientY: 40 }));
  windowObj.firstListener("pointerup")(createPointerEvent({ clientX: 95, clientY: 105 }));

  assert.equal(cleanupCalls, 1);
  assert.equal(clearPlaceholderCalls, 1);
  assert.equal(scheduler.resetCalls, 1);
  assert.equal(dropSilhouette.removed, 1);
  assert.equal(previewSession.disposed, 1);
  assert.deepEqual(patchCalls, [
    {
      widgetId: "w1",
      patch: { x: 30, y: 40 },
      options: {
        record: false,
        touch: false,
        updateBounds: false,
        renderSettings: false,
        save: false
      }
    },
    {
      widgetId: "w1",
      patch: { x: 50, y: 60 },
      options: { label: "Move widget" }
    }
  ]);
});

test("startWidgetCardDragSession flushes deferred live drag effects once", () => {
  const instance = createBaseInstance();
  const card = createCard();
  const windowObj = createEventTarget();
  const previewSession = {
    update() {},
    getPointerOffset() {
      return { x: 10, y: 10 };
    },
    dispose() {}
  };

  let touchCalls = 0;
  let updateBoundsCalls = 0;
  let renderSettingsCalls = 0;
  let queueSaveCalls = 0;
  let recordCalls = 0;

  const started = startWidgetCardDragSession({
    event: createPointerEvent({ button: 0, clientX: 10, clientY: 20, target: {} }),
    target: { closest: () => null },
    instance,
    card,
    isEditMode: () => true,
    setSelected: () => {},
    closeBoardContextMenu: () => {},
    bringWidgetToFront: () => {},
    createDragPreviewSession: () => previewSession,
    createWidgetDropSilhouette: () => ({ remove() {} }),
    setWidgetDropSilhouetteVisible: () => {},
    setDragDeleteZoneActive: () => {},
    setLauncherDragPlaceholderPolicy: () => {},
    updateDragDeleteZoneHover: () => {},
    createNoneDropPlan: () => ({ kind: "none" }),
    resolveEdgeDirectionFromPointer: () => 0,
    getLauncherViewportRect: () => ({ left: 0, right: 1200, top: 0, width: 1200, height: 800 }),
    syncLauncherPagingState: () => ({ pageCount: 1 }),
    isLauncherPlaceholderPolicyActive: () => false,
    isPlaceholderLauncherPage: () => false,
    currentLauncherPageCount: () => 1,
    currentLauncherActivePage: () => 0,
    setLauncherVirtualPage: () => {},
    setLauncherVirtualPageState: () => {},
    applyActiveDragPage: () => {},
    renderBoardViewport: () => {},
    createDeferredEdgeSwitchScheduler: () => ({
      schedule() {
        return false;
      },
      reset() {}
    }),
    getBoardRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    evaluateAndRenderWidgetDragIndicators: () => ({ dropPlan: { kind: "none" } }),
    evaluateFinalWidgetDrop: () => ({
      finalPayload: { clientX: 40, clientY: 50, page: 0 },
      finalDropPlan: { kind: "none" }
    }),
    resolveDraftPlacementAtPointer: () => ({ x: 30, y: 40 }),
    patchWidgetLayout: (_widgetId, patch) => {
      instance.layout = {
        ...instance.layout,
        ...patch
      };
      return true;
    },
    runtimeMap: new Map(),
    applyLayout: () => {},
    isGridLayoutMode: () => false,
    recordHistorySnapshot: () => {
      recordCalls += 1;
    },
    gridMetrics: () => ({ cellW: 100, cellH: 80, gapX: 10, gapY: 10, marginX: 0, marginY: 0, cols: 4, rows: 4 }),
    widgetRegistry: {},
    widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 }),
    normalizeGridLayout: (_grid, fallback) => ({ ...fallback }),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    resolveBoundedDragPositionFromDelta: () => ({ x: 30, y: 40 }),
    cleanupBoardDragSession: ({ resetPendingPageSwitch, hideAndRemoveDropSilhouette, previewSession: session }) => {
      resetPendingPageSwitch?.();
      hideAndRemoveDropSilhouette?.();
      session?.dispose?.();
    },
    applyWidgetDropPlan: () => false,
    clearPendingPlaceholderDrop: () => {},
    normalizeWidgetPage: (page) => page,
    applyGridLayout: () => {},
    compactEmptyLauncherPagesForUseMode: () => {},
    queueSave: () => {
      queueSaveCalls += 1;
    },
    touchUserMutationClock: () => {
      touchCalls += 1;
    },
    updateBoardBounds: () => {
      updateBoundsCalls += 1;
    },
    renderSettings: () => {
      renderSettingsCalls += 1;
    },
    resolveSnappedPosition: (x, y) => ({ x, y, changed: false }),
    snap: 20,
    windowObj
  });

  assert.equal(started, true);

  windowObj.firstListener("pointermove")(createPointerEvent({ clientX: 35, clientY: 45 }));
  windowObj.firstListener("pointerup")(createPointerEvent({ clientX: 35, clientY: 45 }));

  assert.equal(recordCalls, 0);
  assert.equal(touchCalls, 1);
  assert.equal(updateBoundsCalls, 1);
  assert.equal(renderSettingsCalls, 1);
  assert.equal(queueSaveCalls, 1);
});

test("startWidgetCardDragSession runs grid drag fallback commit when no drop plan applied", () => {
  const instance = createBaseInstance();
  const card = createCard();
  const windowObj = createEventTarget();
  const scheduler = {
    schedule() {
      return false;
    },
    reset() {}
  };
  const previewSession = {
    update() {},
    dispose() {},
    getPointerOffset() {
      return { x: 8, y: 8 };
    }
  };

  let recordCalls = 0;
  let clearPlaceholderCalls = 0;
  let applyGridLayoutCalls = 0;
  let compactCalls = 0;
  let queueSaveCalls = 0;

  const started = startWidgetCardDragSession({
    event: createPointerEvent({ button: 0, clientX: 10, clientY: 20, target: {} }),
    target: { closest: () => null },
    instance,
    card,
    isEditMode: () => true,
    createDragPreviewSession: () => previewSession,
    createWidgetDropSilhouette: () => ({ remove() {} }),
    setWidgetDropSilhouetteVisible: () => {},
    setDragDeleteZoneActive: () => {},
    setLauncherDragPlaceholderPolicy: () => {},
    updateDragDeleteZoneHover: () => {},
    createNoneDropPlan: () => ({ kind: "none" }),
    resolveEdgeDirectionFromPointer: () => 0,
    getLauncherViewportRect: () => ({ left: 0, right: 1200, top: 0, width: 1200, height: 800 }),
    syncLauncherPagingState: () => ({ pageCount: 3 }),
    isLauncherPlaceholderPolicyActive: () => false,
    isPlaceholderLauncherPage: () => false,
    currentLauncherPageCount: () => 3,
    currentLauncherActivePage: () => 0,
    setLauncherVirtualPage: () => {},
    setLauncherVirtualPageState: () => {},
    applyActiveDragPage: () => {},
    renderBoardViewport: () => {},
    createDeferredEdgeSwitchScheduler: () => scheduler,
    getBoardRect: () => ({ width: 1200, height: 800 }),
    evaluateAndRenderWidgetDragIndicators: () => ({ dropPlan: { kind: "none" } }),
    evaluateFinalWidgetDrop: () => ({
      finalPayload: { clientX: 120, clientY: 180, page: 0 },
      finalDropPlan: { kind: "none" }
    }),
    resolveDraftPlacementAtPointer: () => ({ x: 60, y: 70 }),
    patchWidgetLayout: () => {},
    runtimeMap: new Map(),
    applyLayout: () => {},
    isGridLayoutMode: () => true,
    recordHistorySnapshot: () => {
      recordCalls += 1;
    },
    gridMetrics: () => ({
      cellW: "100",
      cellH: "80",
      gapX: "10",
      gapY: "10",
      marginX: "0",
      marginY: "0",
      cols: "4",
      rows: "4"
    }),
    widgetRegistry: {},
    widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 }),
    normalizeGridLayout: (_grid, fallback) => ({ ...fallback }),
    resolveBoundedDragPositionFromDelta: () => ({ x: 55, y: 66 }),
    cleanupBoardDragSession: ({ resetPendingPageSwitch, hideAndRemoveDropSilhouette, previewSession: session }) => {
      resetPendingPageSwitch?.();
      hideAndRemoveDropSilhouette?.();
      session?.dispose?.();
    },
    applyWidgetDropPlan: () => false,
    clearPendingPlaceholderDrop: () => {
      clearPlaceholderCalls += 1;
    },
    normalizeWidgetPage: (page) => page,
    applyGridLayout: () => {
      applyGridLayoutCalls += 1;
    },
    compactEmptyLauncherPagesForUseMode: () => {
      compactCalls += 1;
    },
    queueSave: () => {
      queueSaveCalls += 1;
    },
    updateBoardBounds: () => {},
    renderSettings: () => {},
    resolveSnappedPosition: () => ({ x: 0, y: 0, changed: false }),
    snap: 20,
    windowObj
  });

  assert.equal(started, true);
  assert.equal(recordCalls, 1);

  windowObj.firstListener("pointermove")(createPointerEvent({ clientX: 20, clientY: 30 }));
  windowObj.firstListener("pointerup")(createPointerEvent({ clientX: 21, clientY: 31 }));

  assert.equal(clearPlaceholderCalls, 1);
  assert.equal(applyGridLayoutCalls, 1);
  assert.equal(compactCalls, 1);
  assert.equal(queueSaveCalls, 1);
  assert.deepEqual(instance.gridLayout, { col: 0.5, row: 0.5, colSpan: 1, rowSpan: 1 });
  assert.deepEqual(instance.layout, { x: 55, y: 45, w: 100, h: 80 });
});

test("startWidgetCardDragSession preserves delete-zone plan at pointerup", () => {
  const instance = createBaseInstance();
  const card = createCard();
  const windowObj = createEventTarget();
  const previewSession = {
    update() {},
    dispose() {},
    getPointerOffset() {
      return { x: 0, y: 0 };
    }
  };

  let deleteZoneActive = false;
  let appliedPlanKind = "";

  const started = startWidgetCardDragSession({
    event: createPointerEvent({ button: 0, clientX: 10, clientY: 20, target: {} }),
    target: { closest: () => null },
    instance,
    card,
    isEditMode: () => true,
    setSelected: () => {},
    closeBoardContextMenu: () => {},
    bringWidgetToFront: () => {},
    createDragPreviewSession: () => previewSession,
    createWidgetDropSilhouette: () => ({ remove() {} }),
    setWidgetDropSilhouetteVisible: () => {},
    setDragDeleteZoneActive: (active) => {
      deleteZoneActive = Boolean(active);
    },
    setLauncherDragPlaceholderPolicy: () => {},
    updateDragDeleteZoneHover: () => {},
    createNoneDropPlan: () => ({ kind: "NONE" }),
    resolveEdgeDirectionFromPointer: () => 0,
    getLauncherViewportRect: () => ({ left: 0, right: 1200, top: 0, width: 1200, height: 800 }),
    syncLauncherPagingState: () => ({ pageCount: 1 }),
    isLauncherPlaceholderPolicyActive: () => false,
    isPlaceholderLauncherPage: () => false,
    currentLauncherPageCount: () => 1,
    currentLauncherActivePage: () => 0,
    setLauncherVirtualPage: () => {},
    setLauncherVirtualPageState: () => {},
    applyActiveDragPage: () => {},
    renderBoardViewport: () => {},
    createDeferredEdgeSwitchScheduler: () => ({
      schedule() {
        return false;
      },
      reset() {}
    }),
    getBoardRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    evaluateAndRenderWidgetDragIndicators: () => ({
      dropPlan: { kind: "DELETE_ZONE" }
    }),
    evaluateFinalWidgetDrop: () => ({
      finalPayload: { clientX: 10, clientY: 20, page: 0 },
      finalDropPlan: { kind: deleteZoneActive ? "DELETE_ZONE" : "NONE" }
    }),
    resolveDraftPlacementAtPointer: () => ({ x: 10, y: 10 }),
    patchWidgetLayout: () => {},
    runtimeMap: new Map(),
    applyLayout: () => {},
    isGridLayoutMode: () => false,
    recordHistorySnapshot: () => {},
    gridMetrics: () => ({ cellW: 100, cellH: 80, gapX: 10, gapY: 10, marginX: 0, marginY: 0, cols: 4, rows: 4 }),
    widgetRegistry: {},
    widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 }),
    normalizeGridLayout: (_grid, fallback) => ({ ...fallback }),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    resolveBoundedDragPositionFromDelta: () => ({ x: 10, y: 10 }),
    cleanupBoardDragSession: ({ previewSession: session }) => {
      deleteZoneActive = false;
      session?.dispose?.();
    },
    applyWidgetDropPlan: (_targetInstance, plan) => {
      appliedPlanKind = plan?.kind || "";
      return true;
    },
    clearPendingPlaceholderDrop: () => {},
    normalizeWidgetPage: (page) => page,
    applyGridLayout: () => {},
    compactEmptyLauncherPagesForUseMode: () => {},
    queueSave: () => {},
    updateBoardBounds: () => {},
    renderSettings: () => {},
    resolveSnappedPosition: (x, y) => ({ x, y, changed: false }),
    snap: 20,
    windowObj
  });

  assert.equal(started, true);

  windowObj.firstListener("pointerup")(createPointerEvent({ button: 0, clientX: 10, clientY: 20, target: {} }));

  assert.equal(appliedPlanKind, "DELETE_ZONE");
});
