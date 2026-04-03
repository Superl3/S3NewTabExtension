import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveBoundedDragPositionFromDelta,
  resolveDraftPlacementAtPointer,
  resolveSnappedPosition
} from "../core/drag-positioning.js";

test("resolveDraftPlacementAtPointer computes local position with pointer offset", () => {
  const placement = resolveDraftPlacementAtPointer(210, 170, {
    viewportRect: { left: 100, top: 50 },
    boardRect: { width: 300, height: 220 },
    layout: { w: 80, h: 60 },
    pointerOffset: { x: 20, y: 15 }
  });

  assert.deepEqual(placement, {
    x: 90,
    y: 105
  });
});

test("resolveDraftPlacementAtPointer clamps placement in board bounds", () => {
  const placement = resolveDraftPlacementAtPointer(20, 20, {
    viewportRect: { left: 100, top: 50 },
    boardRect: { width: 120, height: 110 },
    layout: { w: 80, h: 60 },
    pointerOffset: { x: 40, y: 30 }
  });

  assert.deepEqual(placement, {
    x: 0,
    y: 0
  });
});

test("resolveBoundedDragPositionFromDelta applies delta and clamps", () => {
  const next = resolveBoundedDragPositionFromDelta(
    { x: 40, y: 50, w: 70, h: 60 },
    100,
    -80,
    { width: 160, height: 140 }
  );

  assert.deepEqual(next, {
    x: 90,
    y: 0
  });
});

test("resolveSnappedPosition snaps coordinates and reports changed flag", () => {
  const changed = resolveSnappedPosition(43, 57, 20);
  assert.deepEqual(changed, {
    x: 40,
    y: 60,
    changed: true
  });

  const unchanged = resolveSnappedPosition(40, 60, 20);
  assert.deepEqual(unchanged, {
    x: 40,
    y: 60,
    changed: false
  });
});
