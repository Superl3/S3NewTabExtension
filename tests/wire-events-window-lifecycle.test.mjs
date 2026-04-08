import test from "node:test";
import assert from "node:assert/strict";

import { wireWindowLifecycleEvents } from "../core/wire-events-window-lifecycle.js";

function createEventHub(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    emit(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler(event);
      }
    }
  };
}

test("wireWindowLifecycleEvents handles resize dock + bounds sync", () => {
  const windowObj = createEventHub();
  const documentObj = createEventHub({ visibilityState: "visible" });
  const elements = {
    editDock: {
      style: { left: "120px", top: "48px" },
      classList: {
        contains: (name) => name === "is-positioned"
      }
    }
  };
  const calls = {
    close: 0,
    applyDock: [],
    bounds: 0,
    syncDock: 0
  };

  wireWindowLifecycleEvents({
    elements,
    documentObj,
    windowObj,
    closeBoardContextMenu: () => {
      calls.close += 1;
    },
    applyEditDockPosition: (left, top) => {
      calls.applyDock.push({ left, top });
    },
    updateBoardBounds: () => {
      calls.bounds += 1;
    },
    syncPersistentDock: () => {
      calls.syncDock += 1;
    },
    flushPendingSave: () => {}
  });

  windowObj.emit("resize");

  assert.equal(calls.close, 1);
  assert.deepEqual(calls.applyDock, [{ left: 120, top: 48 }]);
  assert.equal(calls.bounds, 1);
  assert.equal(calls.syncDock, 1);
});

test("wireWindowLifecycleEvents flushes on hidden/pagehide/beforeunload", () => {
  const windowObj = createEventHub();
  const documentObj = createEventHub({ visibilityState: "visible" });
  let flushCount = 0;
  let commitCount = 0;

  wireWindowLifecycleEvents({
    elements: {},
    documentObj,
    windowObj,
    commitPendingEditableState: (root) => {
      assert.equal(root, documentObj);
      commitCount += 1;
    },
    flushPendingSave: () => {
      flushCount += 1;
    }
  });

  documentObj.visibilityState = "visible";
  documentObj.emit("visibilitychange");
  assert.equal(flushCount, 0);

  documentObj.visibilityState = "hidden";
  documentObj.emit("visibilitychange");
  windowObj.emit("pagehide");
  windowObj.emit("beforeunload");

  assert.equal(flushCount, 3);
  assert.equal(commitCount, 3);
});

test("wireWindowLifecycleEvents closes context on blur", () => {
  const windowObj = createEventHub();
  const documentObj = createEventHub({ visibilityState: "visible" });
  let closeCount = 0;

  wireWindowLifecycleEvents({
    elements: {},
    documentObj,
    windowObj,
    closeBoardContextMenu: () => {
      closeCount += 1;
    }
  });

  windowObj.emit("blur");
  assert.equal(closeCount, 1);
});
