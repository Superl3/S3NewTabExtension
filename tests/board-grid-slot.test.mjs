import test from "node:test";
import assert from "node:assert/strict";

import { findFirstAvailableBoardGridSlot } from "../core/board-grid-slot.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const baseDeps = {
  syncLauncherPagingState: () => ({ pageCount: 2 }),
  gridMetrics: () => ({ cols: 4, rows: 3 }),
  clamp,
  normalizeWidgetPage: (page) => Number(page),
  isWidgetDocked: () => false,
  isWidgetInContainer: () => false,
  widgetRegistry: {
    weather: {},
    container: {}
  },
  widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 }),
  normalizeGridLayout: (layout, fallback) => ({ ...fallback, ...(layout || {}) })
};

test("findFirstAvailableBoardGridSlot returns null outside grid mode", () => {
  const slot = findFirstAvailableBoardGridSlot(0, 1, 1, {
    ...baseDeps,
    isGridLayoutMode: () => false,
    instances: []
  });

  assert.equal(slot, null);
});

test("findFirstAvailableBoardGridSlot finds first open slot with occupancy", () => {
  const slot = findFirstAvailableBoardGridSlot(0, 1, 1, {
    ...baseDeps,
    isGridLayoutMode: () => true,
    instances: [
      {
        type: "weather",
        page: 0,
        enabled: true,
        gridLayout: { col: 0, row: 0, colSpan: 2, rowSpan: 1 }
      }
    ]
  });

  assert.deepEqual(slot, {
    row: 0,
    col: 2,
    rowSpan: 1,
    colSpan: 1
  });
});

test("findFirstAvailableBoardGridSlot treats container occupancy as 1x1", () => {
  const slot = findFirstAvailableBoardGridSlot(0, 1, 1, {
    ...baseDeps,
    isGridLayoutMode: () => true,
    instances: [
      {
        type: "container",
        page: 0,
        enabled: true,
        gridLayout: { col: 0, row: 0, colSpan: 4, rowSpan: 3 }
      }
    ]
  });

  assert.deepEqual(slot, {
    row: 0,
    col: 1,
    rowSpan: 1,
    colSpan: 1
  });
});

test("findFirstAvailableBoardGridSlot clamps requested span to grid bounds", () => {
  const slot = findFirstAvailableBoardGridSlot(0, 99, 99, {
    ...baseDeps,
    isGridLayoutMode: () => true,
    instances: []
  });

  assert.deepEqual(slot, {
    row: 0,
    col: 0,
    rowSpan: 3,
    colSpan: 4
  });
});

test("findFirstAvailableBoardGridSlot uses shared fallback clamp when deps clamp is absent", () => {
  const { clamp: _clamp, ...depsWithoutClamp } = baseDeps;
  const slot = findFirstAvailableBoardGridSlot(0, Number.NaN, 99, {
    ...depsWithoutClamp,
    isGridLayoutMode: () => true,
    instances: []
  });

  assert.deepEqual(slot, {
    row: 0,
    col: 0,
    rowSpan: 3,
    colSpan: 1
  });
});

test("findFirstAvailableBoardGridSlot treats half-track widgets as overlapping both cells", () => {
  const slot = findFirstAvailableBoardGridSlot(0, 1, 1, {
    ...baseDeps,
    isGridLayoutMode: () => true,
    instances: [
      {
        type: "weather",
        page: 0,
        enabled: true,
        gridLayout: { col: 0.5, row: 0, colSpan: 1, rowSpan: 1 }
      }
    ]
  });

  assert.deepEqual(slot, {
    row: 0,
    col: 2,
    rowSpan: 1,
    colSpan: 1
  });
});
