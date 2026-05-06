import test from "node:test";
import assert from "node:assert/strict";

import {
  clamp,
  cloneLayout,
  idSuffix,
  normalizeContainerExpandedCols,
  normalizeContainerExpandedRows,
  normalizeGridLayout,
  normalizeGridTrackPosition,
  widgetDefaultGridSize
} from "../core/layout-primitives.js";

test("clamp bounds numeric values", () => {
  assert.equal(clamp(5, 1, 4), 4);
  assert.equal(clamp(-1, 1, 4), 1);
  assert.equal(clamp(3, 1, 4), 3);
});

test("cloneLayout normalizes missing fields", () => {
  assert.deepEqual(cloneLayout({ x: 1, y: 2, w: 3, h: 4 }), { x: 1, y: 2, w: 3, h: 4 });
  assert.deepEqual(cloneLayout({}), { x: 40, y: 40, w: 340, h: 220 });
});

test("idSuffix returns timestamp-random shape", () => {
  const value = idSuffix();
  assert.equal(typeof value, "string");
  assert.equal(value.includes("-"), true);
});

test("widgetDefaultGridSize resolves explicit and type defaults", () => {
  assert.deepEqual(widgetDefaultGridSize("note", { defaultGridSize: { w: 3, h: 4 } }), { colSpan: 3, rowSpan: 4 });
  assert.deepEqual(widgetDefaultGridSize("container", {}), { colSpan: 1, rowSpan: 1 });
  assert.deepEqual(widgetDefaultGridSize("note", {}), { colSpan: 2, rowSpan: 2 });
});

test("normalizeContainerExpandedColsRows clamp to bounds", () => {
  assert.equal(normalizeContainerExpandedCols(99, 4, 16), 16);
  assert.equal(normalizeContainerExpandedCols("x", 4, 16), 4);
  assert.equal(normalizeContainerExpandedRows(0, 3, 16), 1);
  assert.equal(normalizeContainerExpandedRows(undefined, 3, 16), 3);
});

test("normalizeGridLayout applies numeric fallback", () => {
  assert.deepEqual(
    normalizeGridLayout({ col: 2, row: 3, colSpan: 4, rowSpan: 5 }, { col: 0, row: 0, colSpan: 1, rowSpan: 1 }),
    { col: 2, row: 3, colSpan: 4, rowSpan: 5 }
  );
  assert.deepEqual(
    normalizeGridLayout({}, { col: 1, row: 2, colSpan: 3, rowSpan: 4 }),
    { col: 1, row: 2, colSpan: 3, rowSpan: 4 }
  );
});

test("normalizeGridLayout preserves half-track positions", () => {
  assert.equal(normalizeGridTrackPosition(1.24), 1);
  assert.equal(normalizeGridTrackPosition(1.26), 1.5);
  assert.deepEqual(
    normalizeGridLayout({ col: 1.5, row: 0.5, colSpan: 2, rowSpan: 1 }, { col: 0, row: 0, colSpan: 1, rowSpan: 1 }),
    { col: 1.5, row: 0.5, colSpan: 2, rowSpan: 1 }
  );
});
