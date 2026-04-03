import test from "node:test";
import assert from "node:assert/strict";

import { applyGridLayoutRuntime } from "../core/grid-layout-apply.js";

test("applyGridLayoutRuntime exits when grid mode is off", () => {
  let synced = 0;
  let rendered = 0;

  applyGridLayoutRuntime(
    { commitFreeLayout: true, shouldSave: true },
    {
      getState: () => ({ instances: [], ui: { home: { pageCount: 1 } } }),
      isGridLayoutMode: () => false,
      syncLauncherPagingState: () => {
        synced += 1;
      },
      captureFreeLayouts: () => {
        throw new Error("should-not-call-capture");
      },
      isWidgetDocked: () => false,
      isWidgetInContainer: () => false,
      renderBoardViewport: () => {
        rendered += 1;
      },
      gridMetrics: () => ({ cols: 1, rows: 1, marginX: 0, marginY: 0, cellW: 10, cellH: 10, gapX: 0, gapY: 0 }),
      normalizeWidgetPage: () => 0,
      widgetRegistry: {},
      widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 }),
      normalizeGridLayout: (_value, fallback) => ({ ...fallback }),
      clamp: (value) => value,
      runtimeMap: new Map(),
      applyLayout: () => {},
      queueSave: () => {}
    }
  );

  assert.equal(synced, 0);
  assert.equal(rendered, 0);
});

test("applyGridLayoutRuntime updates layout and saves when requested", () => {
  let synced = 0;
  let captured = 0;
  let queued = 0;
  const viewportCalls = [];
  const applyLayoutCalls = [];
  let containerRefresh = 0;

  const instance = {
    id: "w1",
    type: "container",
    enabled: true,
    page: 3,
    layout: { x: 0, y: 0, w: 0, h: 0 },
    gridLayout: null
  };

  const state = {
    instances: [instance],
    ui: {
      home: { pageCount: 2 }
    }
  };

  const runtimeMap = new Map([
    [
      "w1",
      {
        card: { id: "card-1" },
        controller: {
          refresh() {
            containerRefresh += 1;
          }
        }
      }
    ]
  ]);

  applyGridLayoutRuntime(
    { commitFreeLayout: true, shouldSave: true },
    {
      getState: () => state,
      isGridLayoutMode: () => true,
      syncLauncherPagingState: () => {
        synced += 1;
      },
      captureFreeLayouts: () => {
        captured += 1;
      },
      isWidgetDocked: () => false,
      isWidgetInContainer: () => false,
      renderBoardViewport: (payload) => {
        viewportCalls.push(payload);
      },
      gridMetrics: () => ({
        cols: 4,
        rows: 4,
        marginX: 10,
        marginY: 20,
        cellW: 100,
        cellH: 50,
        gapX: 5,
        gapY: 8
      }),
      normalizeWidgetPage: () => 1,
      widgetRegistry: {
        container: {}
      },
      widgetDefaultGridSize: () => ({ colSpan: 2, rowSpan: 2 }),
      normalizeGridLayout: (_value, fallback) => ({ ...fallback }),
      clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
      runtimeMap,
      applyLayout: (card, layout, page) => {
        applyLayoutCalls.push({ card, layout: { ...layout }, page });
      },
      queueSave: () => {
        queued += 1;
      }
    }
  );

  assert.equal(synced, 1);
  assert.equal(captured, 1);
  assert.equal(instance.page, 1);
  assert.deepEqual(instance.gridLayout, {
    col: 0,
    row: 0,
    colSpan: 1,
    rowSpan: 1
  });
  assert.equal(instance.layout.x, 10);
  assert.equal(instance.layout.y, 20);
  assert.equal(instance.layout.w, 100);
  assert.equal(instance.layout.h, 50);
  assert.equal(applyLayoutCalls.length, 1);
  assert.equal(containerRefresh, 1);
  assert.deepEqual(viewportCalls, [{ animate: false, dragging: false, dragOffsetX: 0 }]);
  assert.equal(queued, 1);
});
