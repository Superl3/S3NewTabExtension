import test from "node:test";
import assert from "node:assert/strict";

import {
  isHorizontalDockPosition,
  resolveDockSlotIndexAtPoint,
  resolveDockSlotRectRelativeToHost
} from "../core/dock-geometry.js";

test("detects horizontal dock positions", () => {
  assert.equal(isHorizontalDockPosition("top"), true);
  assert.equal(isHorizontalDockPosition("bottom"), true);
  assert.equal(isHorizontalDockPosition("left"), false);
});

test("resolves dock slot index from pointer coordinates", () => {
  const rect = { left: 100, top: 20, right: 340, bottom: 80, width: 240, height: 60 };
  const slot = resolveDockSlotIndexAtPoint(165, 40, {
    stripRect: rect,
    slotCount: 4,
    unitSize: 50,
    gap: 10,
    horizontal: true,
    clampToRange: false
  });
  assert.equal(slot, 1);

  const outside = resolveDockSlotIndexAtPoint(20, 40, {
    stripRect: rect,
    slotCount: 4,
    unitSize: 50,
    gap: 10,
    horizontal: true,
    clampToRange: false
  });
  assert.equal(outside, null);

  const fallbackSlot = resolveDockSlotIndexAtPoint(165, 40, {
    stripRect: rect,
    slotCount: 0,
    unitSize: 50,
    gap: 10,
    horizontal: true,
    clampToRange: true
  });
  assert.equal(fallbackSlot, 0);
});

test("resolves dock slot rect relative to host", () => {
  const hostRect = { left: 50, top: 50, right: 450, bottom: 150, width: 400, height: 100 };
  const stripRect = { left: 90, top: 70, right: 330, bottom: 120, width: 240, height: 50 };

  const rect = resolveDockSlotRectRelativeToHost(2, {
    hostRect,
    stripRect,
    slotCount: 5,
    unitSize: 40,
    gap: 8,
    horizontal: true
  });

  assert.deepEqual(rect, {
    x: 136,
    y: 20,
    w: 40,
    h: 40,
    borderRadius: 11
  });

  assert.equal(
    resolveDockSlotRectRelativeToHost(1, {
      hostRect,
      stripRect,
      slotCount: "bad",
      unitSize: 40,
      gap: 8,
      horizontal: true
    }),
    null
  );
});
