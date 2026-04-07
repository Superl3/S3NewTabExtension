import test from "node:test";
import assert from "node:assert/strict";

import { startDockWidgetDragSession } from "../core/dock-widget-drag-session.js";

function createEventHub() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((fn) => fn !== handler));
    },
    emit(type, event) {
      const list = listeners.get(type) || [];
      for (const handler of [...list]) {
        handler(event);
      }
    }
  };
}

function createClassList() {
  const set = new Set();
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
    toggle(name, force) {
      if (force) {
        set.add(name);
      } else {
        set.delete(name);
      }
    },
    has(name) {
      return set.has(name);
    }
  };
}

function createCard() {
  const classList = createClassList();
  return {
    classList,
    dataset: {},
    style: {
      animation: "",
      transformOrigin: "",
      removeProperty(name) {
        if (name === "animation") {
          this.animation = "";
        }
        if (name === "transform-origin") {
          this.transformOrigin = "";
        }
      }
    }
  };
}

function createPointerEvent({ button = 0, clientX = 100, clientY = 120, closest = null } = {}) {
  let prevented = false;
  let stopped = false;
  return {
    button,
    clientX,
    clientY,
    target: {
      closest: () => closest
    },
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

test("startDockWidgetDragSession ignores non-primary or interactive pointerdown", () => {
  const card = createCard();
  const item = { id: "w1" };
  const windowObj = createEventHub();

  const notPrimary = startDockWidgetDragSession({
    event: createPointerEvent({ button: 1 }),
    card,
    item,
    windowObj
  });
  assert.equal(notPrimary, false);

  const interactive = startDockWidgetDragSession({
    event: createPointerEvent({ button: 0, closest: {} }),
    card,
    item,
    windowObj
  });
  assert.equal(interactive, false);
});

test("startDockWidgetDragSession stops when preview session cannot be created", () => {
  const card = createCard();
  const event = createPointerEvent();

  const started = startDockWidgetDragSession({
    event,
    card,
    item: { id: "w2" },
    createDragPreviewSession: () => null,
    closeBoardContextMenu: () => {},
    windowObj: createEventHub()
  });

  assert.equal(started, false);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(card.classList.has("widget-drag-active"), false);
});

test("startDockWidgetDragSession runs drag lifecycle and releases on fallback", () => {
  const windowObj = createEventHub();
  const card = createCard();
  const sourceCard = createCard();
  const item = { id: "w3" };
  const releaseCalls = [];
  const placeholderPolicyCalls = [];
  const silhouetteVisibility = [];
  let disposed = 0;
  let dragEndAt = null;
  let dropped = 0;

  const previewSession = {
    update() {},
    dispose() {
      disposed += 1;
    }
  };

  const started = startDockWidgetDragSession({
    event: createPointerEvent({ clientX: 140, clientY: 160 }),
    card,
    item,
    closeBoardContextMenu: () => {},
    createDragPreviewSession: () => previewSession,
    runtimeMap: new Map([["w3", { card: sourceCard }]]),
    createWidgetDropSilhouette: () => ({ remove() {} }),
    setDragDeleteZoneActive: () => {},
    setLauncherDragPlaceholderPolicy: (value) => {
      placeholderPolicyCalls.push(value);
    },
    updateDragDeleteZoneHover: () => {},
    createNoneDropPlan: () => ({ kind: "none" }),
    resolveEdgeDirectionFromPointer: () => 0,
    getLauncherViewportRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    syncLauncherPagingState: () => ({ pageCount: 3 }),
    isLauncherPlaceholderPolicyActive: () => false,
    isPlaceholderLauncherPage: () => false,
    currentLauncherPageCount: () => 3,
    currentLauncherActivePage: () => 0,
    setLauncherVirtualPage: () => {},
    setLauncherVirtualPageState: () => {},
    setActiveLauncherPage: () => {},
    createDeferredEdgeSwitchScheduler: () => ({
      schedule() {},
      reset() {}
    }),
    isDockDropPoint: () => true,
    persistentDockElement: { classList: createClassList() },
    evaluateAndRenderWidgetDragIndicators: () => ({ dropPlan: { kind: "none" } }),
    evaluateFinalWidgetDrop: () => ({
      finalPayload: { x: 1, y: 2 },
      finalDropPlan: { kind: "none" }
    }),
    clearWidgetDragGuideState: () => {},
    setDockDropTargetActive: () => {},
    setContainerDropTargetActive: () => {},
    setWidgetDropSilhouetteVisible: (...args) => {
      silhouetteVisibility.push(args[1]);
    },
    applyWidgetDropPlan: () => {
      dropped += 1;
      return false;
    },
    releaseWidgetFromDockByDrop: (id, payload) => {
      releaseCalls.push({ id, payload });
    },
    setLastDragEndAt: (value) => {
      dragEndAt = value;
    },
    windowObj,
    nowMs: () => 12345,
    performanceNow: () => 900
  });

  assert.equal(started, true);
  windowObj.emit("pointerup", { clientX: 150, clientY: 170 });

  assert.equal(disposed, 1);
  assert.equal(dropped, 1);
  assert.deepEqual(releaseCalls, [{ id: "w3", payload: { x: 1, y: 2 } }]);
  assert.equal(card.dataset.suppressClick, "true");
  assert.equal(dragEndAt, 12345);
  assert.deepEqual(placeholderPolicyCalls, [true, false]);
  assert.deepEqual(silhouetteVisibility, [false]);
});

test("startDockWidgetDragSession preserves delete-zone plan at pointerup", () => {
  const windowObj = createEventHub();
  const card = createCard();
  const sourceCard = createCard();
  const item = { id: "w4" };
  let deleteZoneActive = false;
  const appliedPlans = [];

  const started = startDockWidgetDragSession({
    event: createPointerEvent({ clientX: 140, clientY: 160 }),
    card,
    item,
    closeBoardContextMenu: () => {},
    createDragPreviewSession: () => ({ update() {}, dispose() {} }),
    runtimeMap: new Map([["w4", { card: sourceCard }]]),
    createWidgetDropSilhouette: () => ({ remove() {} }),
    setDragDeleteZoneActive: (value) => {
      deleteZoneActive = value;
    },
    setLauncherDragPlaceholderPolicy: () => {},
    updateDragDeleteZoneHover: () => {},
    createNoneDropPlan: () => ({ kind: "NONE" }),
    resolveEdgeDirectionFromPointer: () => 0,
    getLauncherViewportRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    syncLauncherPagingState: () => ({ pageCount: 3 }),
    isLauncherPlaceholderPolicyActive: () => false,
    isPlaceholderLauncherPage: () => false,
    currentLauncherPageCount: () => 3,
    currentLauncherActivePage: () => 0,
    setLauncherVirtualPage: () => {},
    setLauncherVirtualPageState: () => {},
    setActiveLauncherPage: () => {},
    createDeferredEdgeSwitchScheduler: () => ({ schedule() {}, reset() {} }),
    isDockDropPoint: () => true,
    persistentDockElement: { classList: createClassList() },
    evaluateAndRenderWidgetDragIndicators: () => ({ dropPlan: { kind: "DELETE_ZONE" } }),
    evaluateFinalWidgetDrop: () => ({
      finalDropPlan: { kind: deleteZoneActive ? "DELETE_ZONE" : "NONE" },
      finalPayload: { x: 9, y: 7 }
    }),
    clearWidgetDragGuideState: () => {},
    setDockDropTargetActive: () => {},
    setContainerDropTargetActive: () => {},
    setWidgetDropSilhouetteVisible: () => {},
    applyWidgetDropPlan: (_item, plan) => {
      appliedPlans.push(plan);
      return true;
    },
    releaseWidgetFromDockByDrop: () => {},
    windowObj
  });

  assert.equal(started, true);
  windowObj.emit("pointerup", createPointerEvent({ clientX: 150, clientY: 170 }));
  assert.equal(appliedPlans[0]?.kind, "DELETE_ZONE");
});
