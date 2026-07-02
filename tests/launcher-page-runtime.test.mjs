import test from "node:test";
import assert from "node:assert/strict";

import { createLauncherPageRuntime } from "../core/launcher-page-runtime.js";
import {
  normalizeActivePage,
  normalizeLauncherPageIndexList,
  normalizePageCount,
  normalizeWidgetPage,
  remapLauncherPageIndexList,
  remapPageForDeletion,
  resolvePageTowardHomeDirection,
  shiftLauncherPageIndexListOnDelete,
  shiftLauncherPageIndexListOnInsert
} from "../core/launcher-pages.js";

function createHarness(overrides = {}) {
  const state = {
    mode: "edit",
    selectedWidgetId: "",
    instances: [],
    ui: {
      home: {
        pageCount: 2,
        homePage: 0,
        activePage: 0,
        manualPages: []
      }
    }
  };

  const launcherPageUiState = {
    dragPlaceholderPolicyActive: true,
    pendingPlaceholderDrop: null,
    virtualPage: null
  };

  const calls = {
    queueSave: 0,
    renderBoard: 0,
    renderBoardViewport: 0,
    refreshBoardCardsAfterLauncherPageMutation: 0,
    clearPending: [],
    history: []
  };

  const deps = {
    getState: () => state,
    launcherPageUiState,
    maxLauncherPages: 12,
    currentLauncherPageCount: () => state.ui.home.pageCount,
    syncLauncherPagingState: () => state.ui.home,
    isBoardWidgetInstance: () => true,
    normalizeWidgetPage,
    normalizeActivePage,
    normalizeLauncherPageIndexList,
    resolvePageTowardHomeDirection,
    remapLauncherPageIndexList,
    remapPageForDeletion,
    shiftLauncherPageIndexListOnDelete,
    normalizePageCount,
    shiftLauncherPageIndexListOnInsert,
    isLauncherPlaceholderPolicyActive: () => true,
    isPlaceholderLauncherPage: (page, pageCount) => page < 0 || page >= pageCount,
    instanceById: (id) => state.instances.find((instance) => instance.id === id) || null,
    recordHistorySnapshot: (label) => {
      calls.history.push(label);
    },
    isWidgetDocked: (instance) => Number.isFinite(instance?.dockOrder),
    isWidgetInContainer: (instance) => Boolean(instance?.containerId),
    normalizeDockedWidgetOrders: () => {},
    normalizeContainerAssignments: () => {},
    projectWidgetBoardDropLayout: () => null,
    clearPendingPlaceholderDrop: ({ clearVirtualPage = false } = {}) => {
      calls.clearPending.push(clearVirtualPage);
      launcherPageUiState.pendingPlaceholderDrop = null;
      if (clearVirtualPage) {
        launcherPageUiState.virtualPage = null;
      }
    },
    renderBoardViewport: () => {
      calls.renderBoardViewport += 1;
    },
    refreshBoardCardsAfterLauncherPageMutation: () => {
      calls.refreshBoardCardsAfterLauncherPageMutation += 1;
    },
    renderBoard: () => {
      calls.renderBoard += 1;
    },
    queueSave: () => {
      calls.queueSave += 1;
    },
    ...overrides
  };

  const runtime = createLauncherPageRuntime(deps);
  return { runtime, state, launcherPageUiState, calls };
}

test("queuePlaceholderPageDrop stores pending placeholder payload", () => {
  const harness = createHarness();
  harness.state.instances = [{ id: "w1", page: 0, layout: {} }];

  const queued = harness.runtime.queuePlaceholderPageDrop("w1", { clientX: 12, clientY: 34 }, -1);

  assert.equal(queued, true);
  assert.equal(harness.launcherPageUiState.virtualPage, -1);
  assert.deepEqual(harness.launcherPageUiState.pendingPlaceholderDrop, {
    widgetId: "w1",
    placeholderPage: -1,
    clientX: 12,
    clientY: 34
  });
  assert.equal(harness.calls.renderBoardViewport, 1);
});

test("queuePlaceholderPageDrop falls back to payload page for invalid explicit placeholder", () => {
  const harness = createHarness();
  harness.state.instances = [{ id: "w1", page: 0, layout: {} }];

  const queued = harness.runtime.queuePlaceholderPageDrop("w1", { page: -1 }, "bad");

  assert.equal(queued, true);
  assert.equal(harness.launcherPageUiState.virtualPage, -1);
  assert.equal(harness.launcherPageUiState.pendingPlaceholderDrop?.placeholderPage, -1);
});

test("materializePendingPlaceholderPage clears pending when widget is missing", () => {
  const harness = createHarness();
  harness.launcherPageUiState.pendingPlaceholderDrop = {
    widgetId: "missing",
    placeholderPage: -1,
    clientX: null,
    clientY: null
  };
  harness.launcherPageUiState.virtualPage = -1;

  const applied = harness.runtime.materializePendingPlaceholderPage();

  assert.equal(applied, false);
  assert.equal(harness.launcherPageUiState.pendingPlaceholderDrop, null);
  assert.equal(harness.launcherPageUiState.virtualPage, null);
  assert.equal(harness.calls.renderBoardViewport, 1);
  assert.deepEqual(harness.calls.clearPending, [true]);
});

test("commitPlaceholderPageDrop immediately materializes the placeholder page", () => {
  const harness = createHarness({
    projectWidgetBoardDropLayout: (_instance, payload) => ({
      page: payload.page,
      layout: { x: 20, y: 30, w: 300, h: 200 },
      gridLayout: null
    })
  });
  harness.state.instances = [{ id: "w1", page: 0, layout: { x: 0, y: 0, w: 100, h: 80 } }];

  const committed = harness.runtime.commitPlaceholderPageDrop("w1", { clientX: 12, clientY: 34 }, 2);

  assert.equal(committed, true);
  assert.equal(harness.state.ui.home.pageCount, 3);
  assert.equal(harness.state.ui.home.activePage, 2);
  assert.equal(harness.state.instances[0].page, 2);
  assert.deepEqual(harness.state.instances[0].layout, { x: 20, y: 30, w: 300, h: 200 });
  assert.equal(harness.launcherPageUiState.pendingPlaceholderDrop, null);
  assert.equal(harness.launcherPageUiState.virtualPage, null);
  assert.equal(harness.calls.renderBoardViewport, 1);
  assert.equal(harness.calls.renderBoard, 1);
  assert.equal(harness.calls.queueSave, 1);
  assert.deepEqual(harness.calls.clearPending, [true]);
  assert.deepEqual(harness.calls.history, ["Create launcher page by drop"]);
});

test("materializeLauncherPlaceholderPage creates right-side page and saves", () => {
  const harness = createHarness();
  harness.state.instances = [{ id: "w1", page: 0, layout: {} }];
  harness.state.ui.home = {
    pageCount: 2,
    homePage: 0,
    activePage: 0,
    manualPages: []
  };

  const created = harness.runtime.materializeLauncherPlaceholderPage(2);

  assert.equal(created, true);
  assert.equal(harness.state.ui.home.pageCount, 3);
  assert.equal(harness.state.ui.home.activePage, 2);
  assert.equal(harness.state.ui.home.homePage, 0);
  assert.equal(harness.state.instances[0].page, 0);
  assert.equal(harness.calls.renderBoard, 1);
  assert.equal(harness.calls.queueSave, 1);
  assert.deepEqual(harness.calls.history, ["Create empty launcher page"]);
});

test("materializeLauncherPlaceholderPage falls back invalid placeholder to right-side page", () => {
  const harness = createHarness();
  harness.state.instances = [{ id: "w1", page: 0, layout: {} }];

  const created = harness.runtime.materializeLauncherPlaceholderPage("bad");

  assert.equal(created, true);
  assert.equal(harness.state.ui.home.pageCount, 3);
  assert.equal(harness.state.ui.home.activePage, 2);
});

test("deleteLauncherPageAt remaps board widgets and updates home state", () => {
  const harness = createHarness();
  harness.state.mode = "edit";
  harness.state.instances = [
    { id: "w1", page: 0, layout: {} },
    { id: "w2", page: 2, layout: {} }
  ];
  harness.state.ui.home = {
    pageCount: 3,
    homePage: 0,
    activePage: 2,
    manualPages: [1, 2]
  };

  const deleted = harness.runtime.deleteLauncherPageAt(1);

  assert.equal(deleted, true);
  assert.equal(harness.state.instances[0].page, 0);
  assert.equal(harness.state.instances[1].page, 1);
  assert.equal(harness.state.ui.home.pageCount, 2);
  assert.equal(harness.state.ui.home.activePage, 1);
  assert.ok(harness.state.ui.home.manualPages.every((page) => page < 2));
  assert.equal(harness.calls.refreshBoardCardsAfterLauncherPageMutation, 1);
  assert.equal(harness.calls.queueSave, 1);
  assert.deepEqual(harness.calls.clearPending, [true]);
  assert.deepEqual(harness.calls.history, ["Delete launcher page"]);
});

test("compactEmptyLauncherPagesForUseMode compacts while preserving home direction", () => {
  const harness = createHarness();
  harness.state.mode = "use";
  harness.state.instances = [{ id: "w1", page: 0, layout: {} }];
  harness.state.ui.home = {
    pageCount: 4,
    homePage: 3,
    activePage: 3,
    manualPages: []
  };

  const compacted = harness.runtime.compactEmptyLauncherPagesForUseMode();

  assert.equal(compacted, true);
  assert.equal(harness.state.ui.home.pageCount, 2);
  assert.equal(harness.state.ui.home.homePage, 1);
  assert.equal(harness.state.ui.home.activePage, 1);
  assert.equal(harness.state.instances[0].page, 0);
});
