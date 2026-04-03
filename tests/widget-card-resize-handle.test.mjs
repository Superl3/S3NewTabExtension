import test from "node:test";
import assert from "node:assert/strict";

import { attachWidgetResizeHandle } from "../core/widget-card-resize-handle.js";

function createFakeHandle() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    trigger(type, event) {
      const handler = listeners.get(type);
      if (handler) {
        handler(event);
      }
    }
  };
}

function createPointerEvent({ button = 0, clientX = 0, clientY = 0 } = {}) {
  let prevented = false;
  let stopped = false;
  return {
    button,
    clientX,
    clientY,
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

test("attachWidgetResizeHandle ignores pointerdown outside edit mode", () => {
  const resizeHandle = createFakeHandle();
  let gridSessionCount = 0;
  let freeSessionCount = 0;

  attachWidgetResizeHandle({
    resizeHandle,
    instance: { id: "w1", type: "note", layout: { x: 0, y: 0, w: 120, h: 80 } },
    isEditMode: () => false,
    isGridLayoutMode: () => false,
    startGridResizeSession: () => {
      gridSessionCount += 1;
    },
    startFreeResizeSession: () => {
      freeSessionCount += 1;
    }
  });

  const event = createPointerEvent({ button: 0, clientX: 10, clientY: 10 });
  resizeHandle.trigger("pointerdown", event);

  assert.equal(gridSessionCount, 0);
  assert.equal(freeSessionCount, 0);
  assert.equal(event.prevented, false);
  assert.equal(event.stopped, false);
});

test("attachWidgetResizeHandle starts grid resize session in grid mode", () => {
  const resizeHandle = createFakeHandle();
  const instance = {
    id: "w2",
    type: "note",
    layout: { x: 30, y: 40, w: 200, h: 120 },
    gridLayout: { col: 1, row: 1, colSpan: 2, rowSpan: 2 }
  };
  let selectedId = "";
  let historyCalls = 0;
  let applyGridCalls = 0;
  let queueSaveCalls = 0;
  let lastDragEndAt = null;
  let sessionArgs = null;

  attachWidgetResizeHandle({
    resizeHandle,
    instance,
    isEditMode: () => true,
    setSelected: (id) => {
      selectedId = id;
    },
    isGridLayoutMode: () => true,
    recordHistorySnapshot: () => {
      historyCalls += 1;
    },
    gridMetrics: () => ({ cols: 8, rows: 6 }),
    normalizeGridLayout: (grid) => grid,
    widgetDefaultGridSize: () => ({ colSpan: 2, rowSpan: 2 }),
    widgetRegistry: { note: {} },
    startGridResizeSession: (args) => {
      sessionArgs = args;
    },
    applyGridLayout: () => {
      applyGridCalls += 1;
    },
    queueSave: () => {
      queueSaveCalls += 1;
    },
    setLastDragEndAt: (value) => {
      lastDragEndAt = value;
    },
    eventTarget: {}
  });

  const event = createPointerEvent({ button: 0, clientX: 100, clientY: 120 });
  resizeHandle.trigger("pointerdown", event);

  assert.equal(selectedId, "w2");
  assert.equal(historyCalls, 1);
  assert.equal(typeof sessionArgs, "object");
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);

  sessionArgs.onComplete();
  assert.equal(typeof lastDragEndAt, "number");
  assert.equal(applyGridCalls, 1);
  assert.equal(queueSaveCalls, 1);
});

test("attachWidgetResizeHandle starts free resize session in free mode", () => {
  const resizeHandle = createFakeHandle();
  const patchCalls = [];
  let freeSessionArgs = null;
  let lastDragEndAt = null;

  attachWidgetResizeHandle({
    resizeHandle,
    instance: {
      id: "w3",
      type: "note",
      layout: { x: 15, y: 25, w: 180, h: 140 }
    },
    isEditMode: () => true,
    setSelected: () => {},
    isGridLayoutMode: () => false,
    startFreeResizeSession: (args) => {
      freeSessionArgs = args;
    },
    patchWidgetLayout: (id, patch, options) => {
      patchCalls.push({ id, patch, options });
    },
    getBoardRect: () => ({ left: 0, top: 0, width: 900, height: 600 }),
    snap: 20,
    setLastDragEndAt: (value) => {
      lastDragEndAt = value;
    },
    eventTarget: {}
  });

  resizeHandle.trigger("pointerdown", createPointerEvent({ button: 0, clientX: 20, clientY: 30 }));

  assert.equal(typeof freeSessionArgs, "object");
  freeSessionArgs.patchSize({ w: 210, h: 160 }, { commit: false });
  freeSessionArgs.patchSize({ w: 220, h: 170 }, { commit: true });

  assert.equal(patchCalls.length, 2);
  assert.deepEqual(patchCalls[0], {
    id: "w3",
    patch: { w: 210, h: 160 },
    options: { record: false }
  });
  assert.deepEqual(patchCalls[1], {
    id: "w3",
    patch: { w: 220, h: 170 },
    options: { label: "Resize widget" }
  });

  freeSessionArgs.onComplete.afterCommit();
  assert.equal(typeof lastDragEndAt, "number");
});
