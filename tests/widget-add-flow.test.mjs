import test from "node:test";
import assert from "node:assert/strict";

import { addWidgetFlow } from "../core/widget-add-flow.js";

function createBaseDeps(overrides = {}) {
  const state = {
    mode: "edit",
    nextId: 5,
    instances: [],
    ui: {
      home: { pageCount: 3 },
      widgetCommonMaster: {}
    }
  };

  return {
    state,
    widgetRegistry: {
      note: { title: "Note" }
    },
    syncLauncherPagingState: () => {},
    currentLauncherViewportPage: () => 0,
    isPlaceholderLauncherPage: () => false,
    currentLauncherPageCount: () => 3,
    materializeLauncherPlaceholderPage: () => true,
    currentLauncherActivePage: () => 0,
    countBoardWidgetsOnPage: () => 0,
    isWidgetDocked: () => false,
    isWidgetInContainer: () => false,
    normalizeWidgetPage: (page) => page,
    widgetDefaultGridSize: () => ({ colSpan: 2, rowSpan: 2 }),
    resolveRequestedWidgetSpans: () => ({ colSpan: 2, rowSpan: 2 }),
    normalizeGridSpanValue: (value) => Number(value),
    gridMaxColumns: 16,
    gridMaxRowSpan: 24,
    isGridLayoutMode: () => false,
    findFirstAvailableBoardGridSlot: () => ({ col: 0, row: 0 }),
    showAddWidgetToast: () => {},
    recordHistorySnapshot: () => {},
    widgetPaddingFallback: () => 10,
    createWidgetInstanceDraft: ({ nextId, zIndex }) => ({
      id: `widget-${nextId}`,
      type: "note",
      zIndex,
      layout: { x: 0, y: 0, w: 300, h: 200 },
      commonOverrides: {}
    }),
    getZCounter: () => 10,
    setZCounter: () => {},
    normalizeText: (value) => String(value || ""),
    isHeadlessDefaultType: () => false,
    isHeadlessTransparentDefaultType: () => false,
    defaultWidgetBackdropBlur: () => true,
    defaultWidgetTitleAlign: () => "center",
    defaultWidgetContentAlign: () => "top",
    normalizeCommonOverrides: () => ({}),
    normalizeGridLayout: (_layout, fallback) => fallback,
    cloneLayout: (layout) => ({ ...layout }),
    inferCommonOverrides: () => ({}),
    applyWidgetCommonMaster: () => {},
    applyFreeLayoutPlacement: () => {},
    getBoardRect: () => ({ width: 1200, height: 800 }),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    enforceContainerWidgetSize: () => {},
    createWidgetCard: () => {},
    applyGridLayout: () => {},
    setSelected: () => {},
    updateBoardBounds: () => {},
    queueSave: () => {},
    ...overrides
  };
}

test("addWidgetFlow returns false outside edit mode", () => {
  const deps = createBaseDeps();
  deps.state.mode = "use";
  const added = addWidgetFlow("note", {}, deps);
  assert.equal(added, false);
});

test("addWidgetFlow adds widget and advances ids in free layout mode", () => {
  const selected = [];
  let saved = 0;
  let zCounter = 10;

  const deps = createBaseDeps({
    setSelected: (id) => selected.push(id),
    queueSave: () => {
      saved += 1;
    },
    getZCounter: () => zCounter,
    setZCounter: (value) => {
      zCounter = value;
    }
  });

  const added = addWidgetFlow("note", {}, deps);

  assert.equal(added, true);
  assert.equal(deps.state.nextId, 6);
  assert.equal(deps.state.instances.length, 1);
  assert.equal(deps.state.instances[0].id, "widget-5");
  assert.deepEqual(selected, ["widget-5"]);
  assert.equal(saved, 1);
  assert.equal(zCounter, 11);
});

test("addWidgetFlow shows toast and aborts when grid has no slot", () => {
  const toasts = [];

  const deps = createBaseDeps({
    isGridLayoutMode: () => true,
    findFirstAvailableBoardGridSlot: () => null,
    showAddWidgetToast: (message) => {
      toasts.push(message);
    }
  });

  const added = addWidgetFlow("note", {}, deps);

  assert.equal(added, false);
  assert.equal(deps.state.instances.length, 0);
  assert.equal(toasts.length, 1);
});

test("addWidgetFlow notifies added instance after successful add", () => {
  const addedInstances = [];
  const deps = createBaseDeps({
    onWidgetAdded: (instance) => {
      addedInstances.push(instance);
    }
  });

  const added = addWidgetFlow("note", {}, deps);

  assert.equal(added, true);
  assert.equal(addedInstances.length, 1);
  assert.equal(addedInstances[0]?.id, "widget-5");
});
