import test from "node:test";
import assert from "node:assert/strict";

import {
  startFreeResizeSession,
  startGridResizeSession
} from "../core/resize-session.js";

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

test("startGridResizeSession updates grid layout on pointer move", () => {
  const target = createMockEventTarget();
  const layouts = [];
  let applyCount = 0;
  let completed = 0;

  startGridResizeSession({
    startX: 100,
    startY: 100,
    startGrid: { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
    metrics: { cols: 6, rows: 7, cellW: 50, gapX: 10, cellH: 40, gapY: 10 },
    setGridLayout: (layout) => layouts.push(layout),
    applyGridLayout: () => {
      applyCount += 1;
    },
    onComplete: () => {
      completed += 1;
    },
    eventTarget: target
  });

  target.emit("pointermove", { clientX: 210, clientY: 170 });
  target.emit("pointerup", {});

  assert.equal(layouts.length, 1);
  assert.deepEqual(layouts[0], {
    col: 1,
    row: 1,
    colSpan: 4,
    rowSpan: 3
  });
  assert.equal(applyCount, 1);
  assert.equal(completed, 1);
  assert.equal(target.listenerCount("pointermove"), 0);
});

test("startFreeResizeSession patches live size and snapped commit size", () => {
  const target = createMockEventTarget();
  const patches = [];
  let completeCalls = 0;
  let currentWidth = 133;
  let currentHeight = 87;

  startFreeResizeSession({
    startX: 10,
    startY: 10,
    startW: 100,
    startH: 80,
    getLayoutPosition: () => ({ x: 20, y: 30 }),
    getBoardRect: () => ({ width: 260, height: 220 }),
    patchSize: (size, meta) => patches.push({ size, meta }),
    onComplete: {
      getCurrentWidth: () => currentWidth,
      getCurrentHeight: () => currentHeight,
      afterCommit: () => {
        completeCalls += 1;
      }
    },
    snap: 20,
    eventTarget: target
  });

  target.emit("pointermove", { clientX: 90, clientY: 40 });
  currentWidth = 141;
  currentHeight = 79;
  target.emit("pointerup", {});

  assert.equal(patches.length, 2);
  assert.deepEqual(patches[0], {
    size: { w: 180, h: 110 },
    meta: { commit: false }
  });
  assert.deepEqual(patches[1], {
    size: { w: 140, h: 80 },
    meta: { commit: true }
  });
  assert.equal(completeCalls, 1);
  assert.equal(target.listenerCount("pointermove"), 0);
});
