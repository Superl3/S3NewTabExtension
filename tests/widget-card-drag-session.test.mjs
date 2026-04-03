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
      options: { record: false }
    },
    {
      widgetId: "w1",
      patch: { x: 50, y: 60 },
      options: { label: "Move widget" }
    }
  ]);
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
      cellW: 100,
      cellH: 80,
      gapX: 10,
      gapY: 10,
      marginX: 0,
      marginY: 0,
      cols: 4,
      rows: 4
    }),
    widgetRegistry: {},
    widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 }),
    normalizeGridLayout: (_grid, fallback) => ({ ...fallback }),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
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
});
