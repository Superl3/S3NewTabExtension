import test from "node:test";
import assert from "node:assert/strict";

import {
  createDeferredEdgeSwitchScheduler,
  resolveEdgeDirectionFromPointer
} from "../core/drag-page-switch.js";

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test("resolveEdgeDirectionFromPointer returns edge direction from viewport", () => {
  const viewportRect = {
    left: 100,
    right: 500,
    width: 400
  };

  assert.equal(resolveEdgeDirectionFromPointer(120, viewportRect, 42), -1);
  assert.equal(resolveEdgeDirectionFromPointer(480, viewportRect, 42), 1);
  assert.equal(resolveEdgeDirectionFromPointer(300, viewportRect, 42), 0);
  assert.equal(resolveEdgeDirectionFromPointer(300, null, 42), 0);
  assert.equal(resolveEdgeDirectionFromPointer(100, viewportRect, -42), -1);
});

test("createDeferredEdgeSwitchScheduler triggers once when edge is stable", async () => {
  let pointerX = 4;
  const triggered = [];
  const scheduler = createDeferredEdgeSwitchScheduler({
    holdMs: 1,
    edgeDirectionFromPointer: (clientX) => (clientX <= 10 ? -1 : 0),
    getPointerX: () => pointerX,
    onTriggered: (direction, context) => {
      triggered.push({ direction, context });
      return false;
    }
  });

  scheduler.schedule(-1, { reason: "first" });
  await delay(8);

  assert.equal(triggered.length, 1);
  assert.deepEqual(triggered[0], {
    direction: -1,
    context: { reason: "first" }
  });

  pointerX = 100;
  scheduler.schedule(-1, { reason: "second" });
  await delay(8);
  assert.equal(triggered.length, 1);
});

test("createDeferredEdgeSwitchScheduler ignores duplicate pending direction", async () => {
  let pointerX = 2;
  const triggered = [];
  const scheduler = createDeferredEdgeSwitchScheduler({
    holdMs: 2,
    edgeDirectionFromPointer: (clientX) => (clientX <= 10 ? -1 : 0),
    getPointerX: () => pointerX,
    onTriggered: (direction, context) => {
      triggered.push({ direction, context });
      return false;
    }
  });

  scheduler.schedule(-1, { reason: "first" });
  scheduler.schedule(-1, { reason: "second" });
  await delay(10);

  assert.equal(triggered.length, 1);
  assert.deepEqual(triggered[0], {
    direction: -1,
    context: { reason: "first" }
  });

  pointerX = 100;
});

test("createDeferredEdgeSwitchScheduler re-schedules when trigger succeeds", async () => {
  let pointerX = 2;
  let triggerCount = 0;
  const scheduler = createDeferredEdgeSwitchScheduler({
    holdMs: 1,
    edgeDirectionFromPointer: (clientX) => (clientX <= 10 ? -1 : 0),
    getPointerX: () => pointerX,
    onTriggered: () => {
      triggerCount += 1;
      return triggerCount < 2;
    }
  });

  scheduler.schedule(-1, null);
  await delay(12);

  assert.equal(triggerCount, 2);
  pointerX = 100;
});

test("createDeferredEdgeSwitchScheduler reset cancels pending trigger", async () => {
  let pointerX = 2;
  let triggerCount = 0;
  const scheduler = createDeferredEdgeSwitchScheduler({
    holdMs: 10,
    edgeDirectionFromPointer: (clientX) => (clientX <= 10 ? -1 : 0),
    getPointerX: () => pointerX,
    onTriggered: () => {
      triggerCount += 1;
      return false;
    }
  });

  scheduler.schedule(-1, null);
  scheduler.reset();
  await delay(20);

  assert.equal(triggerCount, 0);
  pointerX = 100;
});
