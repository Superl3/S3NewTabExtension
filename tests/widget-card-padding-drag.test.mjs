import test from "node:test";
import assert from "node:assert/strict";

import { startWidgetPaddingDragSession } from "../core/widget-card-padding-drag.js";

function createFakeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      const next = handlers.filter((item) => item !== handler);
      listeners.set(type, next);
    },
    firstListener(type) {
      return (listeners.get(type) || [])[0] || null;
    }
  };
}

function createPointerEvent({ button = 0, clientX = 0, clientY = 0, shiftKey = false } = {}) {
  let prevented = false;
  let stopped = false;
  return {
    button,
    clientX,
    clientY,
    shiftKey,
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

test("startWidgetPaddingDragSession returns false outside edit mode", () => {
  const started = startWidgetPaddingDragSession({
    event: createPointerEvent(),
    corner: "topRight",
    instance: { id: "w1", type: "note" },
    isEditMode: () => false,
    eventTarget: createFakeEventTarget()
  });

  assert.equal(started, false);
});

test("startWidgetPaddingDragSession updates padding and commits on pointerup", () => {
  const instance = {
    id: "w1",
    type: "note",
    contentPaddingTop: 8,
    contentPaddingRight: 8,
    contentPaddingBottom: 8,
    contentPaddingLeft: 8
  };
  const eventTarget = createFakeEventTarget();
  const modalState = {
    open: true,
    widgetId: "w1",
    draft: {}
  };
  const runtimeMap = new Map([["w1", { card: { id: "card" } }]]);
  let selectedId = "";
  let recordedCount = 0;
  let visualUpdates = 0;
  let renderSettingsCount = 0;
  let queueSaveCount = 0;
  let dragEndValue = null;

  const started = startWidgetPaddingDragSession({
    event: createPointerEvent({ button: 0, clientX: 100, clientY: 100 }),
    corner: "topRight",
    instance,
    isEditMode: () => true,
    setSelected: (id) => {
      selectedId = id;
    },
    widgetPaddingFallback: () => 10,
    resolveWidgetPadding: () => ({ top: 8, right: 8, bottom: 8, left: 8 }),
    normalizeContentPadding: (value, fallback) => {
      const next = Number(value);
      return Number.isFinite(next) ? next : fallback;
    },
    projectContentPaddingFromDrag: () => ({
      top: 12,
      right: 12,
      bottom: 12,
      left: 12,
      topRight: 12,
      bottomLeft: 12,
      all: 12
    }),
    hasContentPaddingChanged: () => true,
    recordHistorySnapshot: () => {
      recordedCount += 1;
    },
    runtimeMap,
    applyCardVisual: () => {
      visualUpdates += 1;
    },
    modalState,
    renderSettings: () => {
      renderSettingsCount += 1;
    },
    queueSave: () => {
      queueSaveCount += 1;
    },
    setLastDragEndAt: (value) => {
      dragEndValue = value;
    },
    eventTarget
  });

  assert.equal(started, true);
  assert.equal(selectedId, "w1");

  const move = eventTarget.firstListener("pointermove");
  const up = eventTarget.firstListener("pointerup");
  assert.equal(typeof move, "function");
  assert.equal(typeof up, "function");

  move(createPointerEvent({ clientX: 130, clientY: 120 }));

  assert.equal(recordedCount, 1);
  assert.equal(visualUpdates, 1);
  assert.equal(instance.contentPaddingTop, 12);
  assert.equal(instance.contentPaddingRight, 12);
  assert.equal(instance.contentPaddingBottom, 12);
  assert.equal(instance.contentPaddingLeft, 12);
  assert.equal(instance.contentPaddingTopRight, 12);
  assert.equal(instance.contentPaddingBottomLeft, 12);
  assert.equal(instance.contentPadding, 12);
  assert.equal(modalState.draft.contentPaddingTop, 12);
  assert.equal(modalState.draft.contentPadding, 12);

  up();

  assert.equal(typeof dragEndValue, "number");
  assert.equal(renderSettingsCount, 1);
  assert.equal(queueSaveCount, 1);
});
