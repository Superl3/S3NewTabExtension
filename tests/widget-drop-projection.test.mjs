import test from "node:test";
import assert from "node:assert/strict";

import { projectWidgetBoardDropLayoutRuntime } from "../core/widget-drop-projection.js";

function createBaseDeps(overrides = {}) {
  return {
    getLauncherViewportRect: () => ({ left: 100, top: 50, width: 800, height: 600 }),
    elements: {
      board: {
        clientWidth: 800,
        clientHeight: 600
      }
    },
    isHtmlElement: () => true,
    currentLauncherPageCount: () => 4,
    currentLauncherActivePage: () => 2,
    normalizeWidgetPage: (page, pageCount, fallback) => {
      const value = Number.isFinite(Number(page)) ? Math.floor(Number(page)) : fallback;
      return Math.max(0, Math.min(pageCount - 1, value));
    },
    isGridLayoutMode: () => false,
    gridMetrics: () => ({
      cellW: 100,
      cellH: 80,
      gapX: 10,
      gapY: 20,
      marginX: 30,
      marginY: 40,
      cols: 4,
      rows: 3
    }),
    widgetRegistry: {
      note: {}
    },
    widgetDefaultGridSize: () => ({ colSpan: 2, rowSpan: 1 }),
    normalizeGridLayout: (_value, fallback) => ({ ...fallback }),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    snap: 20,
    ...overrides
  };
}

test("projectWidgetBoardDropLayoutRuntime returns null when board host is invalid", () => {
  const instance = { type: "note", layout: { w: 300, h: 220 } };
  const projection = projectWidgetBoardDropLayoutRuntime(instance, {}, {}, createBaseDeps({ isHtmlElement: () => false }));
  assert.equal(projection, null);
});

test("projectWidgetBoardDropLayoutRuntime projects snapped free-layout position", () => {
  const instance = {
    type: "note",
    layout: { w: 300, h: 200 }
  };

  const projection = projectWidgetBoardDropLayoutRuntime(
    instance,
    {
      page: 1,
      clientX: 333,
      clientY: 277,
      dragOffsetX: 100,
      dragOffsetY: 50
    },
    {},
    createBaseDeps()
  );

  assert.equal(projection.page, 1);
  assert.equal(projection.gridLayout, null);
  assert.deepEqual(projection.layout, {
    x: 140,
    y: 180,
    w: 300,
    h: 200
  });
});

test("projectWidgetBoardDropLayoutRuntime projects grid layout with spans", () => {
  const instance = {
    type: "note",
    layout: { w: 300, h: 200 },
    gridLayout: null
  };

  const projection = projectWidgetBoardDropLayoutRuntime(
    instance,
    {
      page: 3,
      clientX: 455,
      clientY: 230
    },
    {},
    createBaseDeps({ isGridLayoutMode: () => true })
  );

  assert.equal(projection.page, 3);
  assert.deepEqual(projection.gridLayout, {
    col: 2,
    row: 1,
    colSpan: 2,
    rowSpan: 1
  });
  assert.deepEqual(projection.layout, {
    x: 250,
    y: 140,
    w: 210,
    h: 80
  });
});
