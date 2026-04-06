import test from "node:test";
import assert from "node:assert/strict";

import { createWidgetModalRuntime } from "../core/widget-modal-runtime.js";

function createClassList() {
  const set = new Set();
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
    has(name) {
      return set.has(name);
    }
  };
}

function createElement() {
  return {
    classList: createClassList(),
    style: {
      display: "",
      setProperty() {},
      removeProperty() {}
    },
    setAttribute() {},
    replaceChildren() {},
    append() {},
    querySelector() {
      return null;
    }
  };
}

function createRuntime(overrides = {}) {
  const modalState = {
    open: true,
    widgetId: "w1",
    draft: {
      layout: { x: 1 },
      contentPadding: 10,
      contentPaddingTop: 10,
      contentPaddingRight: 10,
      contentPaddingBottom: 10,
      contentPaddingLeft: 10,
      contentPaddingTopRight: 10,
      contentPaddingBottomLeft: 10,
      config: { foo: "bar" }
    },
    dismissPointerId: 1,
    dismissMoved: true,
    dismissStartedOnOverlay: true,
    activeTab: "common",
    requireInitialApply: false
  };
  const elements = {
    widgetModalOverlay: createElement(),
    widgetModalTabs: createElement(),
    widgetModalBody: createElement(),
    widgetModalDefaultBtn: { onclick: () => {} },
    widgetModalCloseBtn: { disabled: false },
    widgetModalCancelBtn: { disabled: false }
  };
  let renderSettingsCalls = 0;

  const runtime = createWidgetModalRuntime({
    modalState,
    widgetTitleRenameState: { open: false },
    shortcutIconEditorState: { open: false },
    elements,
    state: { ui: { home: {}, widgetCommonMaster: {} } },
    instanceById: () => ({ id: "w1", type: "note", page: 0 }),
    widgetRegistry: { note: { title: "Note" } },
    closeWidgetTitleRenameModal: () => {},
    buildWidgetModalDraft: () => ({ layout: {}, config: {} }),
    currentLauncherPageCount: () => 3,
    resolveWidgetPadding: () => ({ top: 10, right: 10, bottom: 10, left: 10, uniform: 10 }),
    getWidgetModalCommonFields: () => [],
    getWidgetModalSpecificFields: () => [],
    normalizeWidgetPage: (page) => page,
    normalizeSurfaceMode: (value) => value,
    normalizeTransparentGhostStrength: (value) => value,
    normalizeEdgeRoundness: (value) => value,
    normalizeTransparency: (value) => value,
    normalizeTitleAlign: (value) => value,
    defaultWidgetTitleAlign: () => "center",
    normalizeAlign: (value) => value,
    defaultWidgetContentAlign: () => "top",
    normalizeContentPadding: (value) => Number(value),
    normalizeWidgetContentFontScale: (value) => Number(value),
    normalizeWidgetThemeMode: (value) => value,
    normalizeWidgetColor: (value) => value,
    renderWidgetModalFields: () => createElement(),
    setWidgetModalActiveTab: () => {},
    resetWidgetTabDraftToDefaults: () => {},
    resetCommonTabDraftToGlobal: () => {},
    setModalInteractionLock: () => {},
    blurFocusedElementInOverlay: () => {},
    renderSettings: () => {
      renderSettingsCalls += 1;
    },
    closeShortcutIconEditor: () => {},
    resolveAveragePaddingValue: () => 10,
    widgetPaddingFallback: () => 10,
    recordHistorySnapshot: () => {},
    applyWidgetDraftToInstance: () => {},
    normalizeText: (value) => String(value || ""),
    resolveDirectionalPaddingFromDraft: () => ({ top: 10, right: 10, bottom: 10, left: 10 }),
    cloneLayout: (layout) => ({ ...layout }),
    normalizeContainerWidgetDraftConfig: () => {},
    normalizeContainerExpandedCols: (value) => value,
    normalizeContainerExpandedRows: (value) => value,
    enforceContainerWidgetSize: () => {},
    inferCommonOverrides: () => ({}),
    syncLauncherPagingState: () => ({ pageCount: 3 }),
    syncWidgetStateAfterModalApply: () => {},
    refreshWidgetRuntimeAfterModalApply: () => {},
    runtimeMap: new Map(),
    applyLayout: () => {},
    applyCardVisual: () => {},
    refreshWidgetsByType: () => {},
    isWidgetInContainer: () => false,
    updateBoardBounds: () => {},
    queueSave: () => {},
    documentObj: {
      createElement: () => createElement()
    },
    ...overrides
  });

  return { runtime, modalState, elements, getRenderSettingsCalls: () => renderSettingsCalls };
}

test("widget modal runtime reads and writes modal field values", () => {
  const { runtime, modalState } = createRuntime();

  assert.equal(runtime.modalFieldValue({ group: "layout", key: "x" }), 1);
  assert.equal(runtime.modalFieldValue({ group: "config", key: "foo" }), "bar");

  runtime.setModalFieldValue({ group: "layout", key: "x" }, 9);
  runtime.setModalFieldValue({ group: "config", key: "foo" }, "baz");

  assert.equal(modalState.draft.layout.x, 9);
  assert.equal(modalState.draft.config.foo, "baz");
});

test("widget modal runtime close resets state and rerenders settings", () => {
  const { runtime, modalState, getRenderSettingsCalls } = createRuntime();

  runtime.closeWidgetModal(true);

  assert.equal(modalState.open, false);
  assert.equal(modalState.widgetId, "");
  assert.equal(modalState.draft, null);
  assert.equal(modalState.activeTab, "widget");
  assert.equal(modalState.requireInitialApply, false);
  assert.equal(getRenderSettingsCalls(), 1);
});

test("widget modal runtime blocks close when initial apply is required", () => {
  const { runtime, modalState } = createRuntime();

  runtime.openWidgetModal("w1", { requireInitialApply: true });
  const closed = runtime.closeWidgetModal(false);

  assert.equal(closed, false);
  assert.equal(modalState.open, true);
  assert.equal(modalState.requireInitialApply, true);
});

test("widget modal runtime can force close when initial apply is required", () => {
  const { runtime, modalState } = createRuntime();

  runtime.openWidgetModal("w1", { requireInitialApply: true });
  const closed = runtime.closeWidgetModal(false, { force: true });

  assert.equal(closed, true);
  assert.equal(modalState.open, false);
  assert.equal(modalState.requireInitialApply, false);
});

test("widget modal runtime apply exits when modal closed", () => {
  const { runtime } = createRuntime({
    modalState: {
      open: false,
      widgetId: "",
      draft: null,
      activeTab: "widget"
    }
  });

  assert.equal(runtime.applyWidgetModal(), undefined);
});

test("widget modal runtime open preserves rename-close then draft then render order", () => {
  const calls = [];
  const { runtime, modalState } = createRuntime({
    widgetTitleRenameState: { open: true },
    closeWidgetTitleRenameModal: () => {
      calls.push("closeRename");
    },
    buildWidgetModalDraft: () => {
      calls.push("buildDraft");
      return { layout: {}, config: {} };
    },
    getWidgetModalCommonFields: () => {
      calls.push("getCommonFields");
      return [];
    }
  });

  runtime.openWidgetModal("w1");

  assert.equal(modalState.open, true);
  assert.deepEqual(calls, ["closeRename", "buildDraft", "getCommonFields"]);
});

test("widget modal runtime apply preserves runtime update order before close", () => {
  const calls = [];
  const { runtime, modalState } = createRuntime({
    recordHistorySnapshot: () => {
      calls.push("recordHistorySnapshot");
    },
    applyWidgetDraftToInstance: () => {
      calls.push("applyWidgetDraftToInstance");
    },
    normalizeContainerWidgetDraftConfig: () => {
      calls.push("normalizeContainerWidgetDraftConfig");
    },
    syncWidgetStateAfterModalApply: () => {
      calls.push("syncWidgetStateAfterModalApply");
    },
    refreshWidgetRuntimeAfterModalApply: () => {
      calls.push("refreshWidgetRuntimeAfterModalApply");
    },
    updateBoardBounds: () => {
      calls.push("updateBoardBounds");
    },
    queueSave: () => {
      calls.push("queueSave");
    }
  });

  runtime.applyWidgetModal();

  assert.deepEqual(calls, [
    "recordHistorySnapshot",
    "applyWidgetDraftToInstance",
    "normalizeContainerWidgetDraftConfig",
    "syncWidgetStateAfterModalApply",
    "refreshWidgetRuntimeAfterModalApply",
    "updateBoardBounds",
    "queueSave"
  ]);
  assert.equal(modalState.open, false);
});

test("widget modal runtime apply closes even when initial apply was required", () => {
  const { runtime, modalState } = createRuntime();

  runtime.openWidgetModal("w1", { requireInitialApply: true });
  runtime.applyWidgetModal();

  assert.equal(modalState.open, false);
  assert.equal(modalState.requireInitialApply, false);
});
