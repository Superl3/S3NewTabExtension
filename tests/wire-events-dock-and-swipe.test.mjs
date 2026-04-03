import test from "node:test";
import assert from "node:assert/strict";

import { wireDockAndSwipeEvents } from "../core/wire-events-dock-and-swipe.js";

function createEventHub() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    first(type) {
      return listeners.get(type)?.[0] || null;
    },
    emit(type, event) {
      const handlers = listeners.get(type) || [];
      for (const handler of handlers) {
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
    has(name) {
      return set.has(name);
    }
  };
}

test("wireDockAndSwipeEvents positions edit dock on init", () => {
  const applyCalls = [];
  const elements = {
    editDock: {
      classList: createClassList(),
      getBoundingClientRect: () => ({ left: 0, top: 0 })
    },
    editDockGrip: createEventHub(),
    workspace: createEventHub()
  };
  const dockDragState = { active: false, pointerId: null };

  wireDockAndSwipeEvents({
    elements,
    windowObj: { innerWidth: 1200, addEventListener() {} },
    requestAnimationFrameFn: (cb) => cb(),
    dockDragState,
    applyEditDockPosition: (left, top) => {
      applyCalls.push({ left, top });
    }
  });

  assert.deepEqual(applyCalls, [{ left: 430, top: 10 }]);
});

test("wireDockAndSwipeEvents updates dock drag state and position", () => {
  const applyCalls = [];
  const windowObj = { innerWidth: 800, ...createEventHub() };
  const classList = createClassList();
  const grip = {
    ...createEventHub(),
    setPointerCapture() {}
  };
  const elements = {
    editDock: {
      classList,
      getBoundingClientRect: () => ({ left: 20, top: 30 })
    },
    editDockGrip: grip,
    workspace: createEventHub()
  };
  const dockDragState = { active: false, pointerId: null };

  wireDockAndSwipeEvents({
    elements,
    windowObj,
    requestAnimationFrameFn: () => {},
    dockDragState,
    applyEditDockPosition: (left, top) => {
      applyCalls.push({ left, top });
    },
    moveBoardSwipe: () => {},
    endBoardSwipe: () => {}
  });

  const event = {
    button: 0,
    pointerId: 5,
    clientX: 100,
    clientY: 120,
    preventDefault() {},
    stopPropagation() {}
  };
  grip.first("pointerdown")(event);
  assert.equal(dockDragState.active, true);
  assert.equal(classList.has("is-dragging"), true);

  windowObj.emit("pointermove", { pointerId: 5, clientX: 140, clientY: 170 });
  assert.deepEqual(applyCalls, [{ left: 60, top: 80 }]);

  windowObj.emit("pointerup", { pointerId: 5 });
  assert.equal(dockDragState.active, false);
  assert.equal(dockDragState.pointerId, null);
  assert.equal(classList.has("is-dragging"), false);
});

test("wireDockAndSwipeEvents wires board swipe callbacks", () => {
  const windowObj = { innerWidth: 800, ...createEventHub() };
  const workspace = createEventHub();
  const begin = [];
  const move = [];
  const end = [];

  wireDockAndSwipeEvents({
    elements: {
      editDock: null,
      editDockGrip: null,
      workspace
    },
    windowObj,
    requestAnimationFrameFn: () => {},
    dockDragState: { active: false, pointerId: null },
    beginBoardSwipe: (event) => {
      begin.push(event);
    },
    moveBoardSwipe: (event) => {
      move.push(event);
    },
    endBoardSwipe: (event, options) => {
      end.push({ event, options });
    }
  });

  workspace.emit("pointerdown", { type: "down" });
  windowObj.emit("pointermove", { type: "move" });
  windowObj.emit("pointerup", { type: "up" });
  windowObj.emit("pointercancel", { type: "cancel" });

  assert.equal(begin.length, 1);
  assert.equal(move.length, 1);
  assert.equal(end.length, 2);
  assert.deepEqual(end[0].options, { cancelled: false });
  assert.deepEqual(end[1].options, { cancelled: true });
});
