import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveFreeResizeDimensions,
  resolveGridResizeLayout,
  resolveSnappedSize
} from "../core/resize-drag.js";

test("resolveGridResizeLayout calculates bounded col/row spans", () => {
  const layout = resolveGridResizeLayout(
    { col: 1, row: 2, colSpan: 3, rowSpan: 2 },
    { cols: 8, rows: 10, cellW: 50, gapX: 10, cellH: 40, gapY: 8 },
    { startX: 100, startY: 100, clientX: 280, clientY: 220 }
  );

  assert.deepEqual(layout, {
    col: 1,
    row: 2,
    colSpan: 6,
    rowSpan: 5
  });
});

test("resolveFreeResizeDimensions clamps by board space and minimums", () => {
  const dimensions = resolveFreeResizeDimensions({
    startW: 120,
    startH: 140,
    dx: 500,
    dy: -200,
    layoutX: 260,
    layoutY: 120,
    boardRect: { width: 400, height: 260 }
  });

  assert.deepEqual(dimensions, {
    w: 140,
    h: 80
  });
});

test("resolveSnappedSize snaps width and height to unit", () => {
  const snapped = resolveSnappedSize(133, 87, 20);
  assert.deepEqual(snapped, {
    w: 140,
    h: 80
  });
});
