import test from "node:test";
import assert from "node:assert/strict";

import { createLongPressDragController } from "../core/long-press-drag.js";

function createMockEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) {
      const bucket = listeners.get(name) || [];
      bucket.push(handler);
      listeners.set(name, bucket);
    },
    removeEventListener(name, handler) {
      const bucket = listeners.get(name) || [];
      listeners.set(
        name,
        bucket.filter((item) => item !== handler)
      );
    },
    emit(name, event) {
      const bucket = listeners.get(name) || [];
      for (const handler of [...bucket]) {
        handler(event);
      }
    },
    listenerCount(name) {
      return (listeners.get(name) || []).length;
    }
  };
}

function createMockTimerApi() {
  let nextId = 1;
  const pending = new Map();
  const delays = [];
  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      pending.set(id, callback);
      delays.push(delay);
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    runAll() {
      const entries = [...pending.entries()];
      pending.clear();
      for (const [, callback] of entries) {
        callback();
      }
    },
    pendingCount() {
      return pending.size;
    },
    lastDelay() {
      return delays[delays.length - 1];
    }
  };
}

function createMockCard() {
  const classSet = new Set();
  return {
    classList: {
      add(name) {
        classSet.add(name);
      },
      remove(name) {
        classSet.delete(name);
      }
    },
    hasClass(name) {
      return classSet.has(name);
    }
  };
}

test("createLongPressDragController blocks scheduling in edit mode", () => {
  const controller = createLongPressDragController({
    isEditMode: () => true
  });
  assert.equal(controller.schedule({ clientX: 1, clientY: 2, button: 0 }, null), false);
});

test("createLongPressDragController schedules and triggers drag callback", () => {
  const target = createMockEventTarget();
  const timers = createMockTimerApi();
  const card = createMockCard();
  const widgetState = { pending: false, pointerId: null };
  let triggerPayload = null;

  const controller = createLongPressDragController({
    card,
    widgetLongPressState: widgetState,
    isEditMode: () => false,
    onTrigger: (payload) => {
      triggerPayload = payload;
    },
    eventTarget: target,
    timerApi: timers
  });

  const scheduled = controller.schedule({ clientX: 15, clientY: 25, pointerId: 7, button: 0 }, { id: "node" });
  assert.equal(scheduled, true);
  assert.equal(widgetState.pending, true);
  assert.equal(widgetState.pointerId, 7);
  assert.equal(card.hasClass("longpress-drag-armed"), true);
  assert.equal(target.listenerCount("pointermove") > 0, true);

  timers.runAll();

  assert.deepEqual(triggerPayload, {
    target: { id: "node" },
    startX: 15,
    startY: 25
  });
  assert.equal(widgetState.pending, false);
  assert.equal(widgetState.pointerId, null);
  assert.equal(card.hasClass("longpress-drag-armed"), false);
});

test("createLongPressDragController cancels when pointer moves past tolerance", () => {
  const target = createMockEventTarget();
  const timers = createMockTimerApi();
  const widgetState = { pending: false, pointerId: null };
  let triggerCount = 0;

  const controller = createLongPressDragController({
    widgetLongPressState: widgetState,
    isEditMode: () => false,
    onTrigger: () => {
      triggerCount += 1;
    },
    eventTarget: target,
    timerApi: timers,
    baseMoveTolerance: 5
  });

  controller.schedule({ clientX: 0, clientY: 0, pointerId: 1, button: 0 }, null);
  target.emit("pointermove", { clientX: 20, clientY: 20, pointerId: 1 });
  assert.equal(widgetState.pending, false);
  assert.equal(timers.pendingCount(), 0);

  timers.runAll();
  assert.equal(triggerCount, 0);
});

test("createLongPressDragController uses shortcut delay and mouse listeners", () => {
  const target = createMockEventTarget();
  const timers = createMockTimerApi();
  const controller = createLongPressDragController({
    isEditMode: () => false,
    isShortcutTarget: (node) => Boolean(node?.closest?.(".shortcut-tile")),
    eventTarget: target,
    timerApi: timers,
    longPressDelayMs: 340,
    shortcutDelayMs: 220
  });

  const scheduleResult = controller.schedule(
    { clientX: 3, clientY: 4, button: 0 },
    { closest: (selector) => (selector === ".shortcut-tile" ? {} : null) }
  );
  assert.equal(scheduleResult, true);
  assert.equal(target.listenerCount("mousemove") > 0, true);
  assert.equal(timers.lastDelay(), 220);
});
