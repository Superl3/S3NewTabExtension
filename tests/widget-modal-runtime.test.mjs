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
    activeTab: "common"
  };
  const elements = {
    widgetModalOverlay: createElement(),
    widgetModalTabs: createElement(),
    widgetModalBody: createElement(),
    widgetModalCloseBtn: { disabled: true },
    widgetModalCancelBtn: { disabled: true },
    widgetModalDefaultBtn: { onclick: () => {} }
  };
  let renderSettingsCalls = 0;

  const runtime = createWidgetModalRuntime({
    modalState,
    pendingWidgetAddState: {
      open: false,
      widgetId: "",
      instance: null,
      pageCount: 1,
      placeholderPage: null,
      type: "",
      colSpan: 1,
      rowSpan: 1,
      title: ""
    },
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
    refreshAllWidgets: () => {},
    isWidgetInContainer: () => false,
    commitPendingWidgetAdd: () => true,
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
  assert.equal(getRenderSettingsCalls(), 1);
});

test("widget modal runtime close is idempotent when already closed", () => {
  const { runtime } = createRuntime({
    modalState: {
      open: false,
      widgetId: "",
      draft: null,
      activeTab: "widget"
    }
  });

  const closed = runtime.closeWidgetModal(false);

  assert.equal(closed, false);
});

test("widget modal runtime keeps dismiss controls enabled after add-flow open", () => {
  const { runtime, modalState, elements } = createRuntime();

  runtime.openWidgetModal("w1");
  assert.equal(elements.widgetModalCloseBtn.disabled, false);
  assert.equal(elements.widgetModalCancelBtn.disabled, false);

  const closed = runtime.closeWidgetModal(false);

  assert.equal(closed, true);
  assert.equal(modalState.open, false);
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

  assert.equal(runtime.applyWidgetModal(), false);
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
    commitPendingEditableState: (root, options) => {
      calls.push("commitPendingEditableState");
      assert.equal(root?.marker, "widgetModalBody");
      assert.deepEqual(options, { includeDescendants: true });
    },
    elements: {
      widgetModalOverlay: createElement(),
      widgetModalTabs: createElement(),
      widgetModalBody: { ...createElement(), marker: "widgetModalBody" },
      widgetModalCloseBtn: { disabled: true },
      widgetModalCancelBtn: { disabled: true },
      widgetModalDefaultBtn: { onclick: () => {} }
    },
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
    refreshAllWidgets: () => {
      calls.push("refreshAllWidgets");
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
    "commitPendingEditableState",
    "recordHistorySnapshot",
    "applyWidgetDraftToInstance",
    "normalizeContainerWidgetDraftConfig",
    "syncWidgetStateAfterModalApply",
    "refreshWidgetRuntimeAfterModalApply",
    "refreshAllWidgets",
    "updateBoardBounds",
    "queueSave"
  ]);
  assert.equal(modalState.open, false);
});

test("widget modal runtime commits pending edits before applying draft", () => {
  let appliedDraft = null;
  const { runtime, modalState } = createRuntime({
    commitPendingEditableState: () => {
      modalState.draft.config.foo = "pending";
    },
    applyWidgetDraftToInstance: (_instance, draft) => {
      appliedDraft = structuredClone(draft);
    }
  });

  runtime.applyWidgetModal();

  assert.equal(appliedDraft.config.foo, "pending");
});

test("widget modal runtime clears pending add draft when dismissed without apply", () => {
  const pendingWidgetAddState = {
    open: true,
    widgetId: "w1",
    instance: { id: "w1", type: "note", page: 0 },
    pageCount: 3,
    placeholderPage: null,
    type: "note",
    colSpan: 2,
    rowSpan: 2,
    title: "Note"
  };
  const { runtime, modalState } = createRuntime({
    pendingWidgetAddState
  });

  runtime.closeWidgetModal(false);

  assert.equal(modalState.open, false);
  assert.equal(pendingWidgetAddState.open, false);
  assert.equal(pendingWidgetAddState.widgetId, "");
  assert.equal(pendingWidgetAddState.instance, null);
});

test("widget modal runtime commits pending add on apply without existing widget instance", () => {
  const calls = [];
  const pendingWidgetAddState = {
    open: true,
    widgetId: "w1",
    instance: { id: "w1", type: "note", title: "Note", page: 0 },
    pageCount: 4,
    placeholderPage: 3,
    type: "note",
    colSpan: 2,
    rowSpan: 2,
    title: "Note"
  };
  const { runtime } = createRuntime({
    pendingWidgetAddState,
    instanceById: () => null,
    commitPendingWidgetAdd: (draft, pending) => {
      calls.push({ draft, pending: { ...pending } });
      return true;
    }
  });

  assert.equal(runtime.applyWidgetModal(), true);
  assert.equal(pendingWidgetAddState.open, false);
  assert.equal(pendingWidgetAddState.widgetId, "");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pending.placeholderPage, 3);
});

test("widget modal runtime opens pending add settings from provided draft instance", () => {
  const pendingWidgetAddState = {
    open: false,
    widgetId: "",
    instance: null,
    pageCount: 1,
    placeholderPage: null,
    type: "",
    colSpan: 1,
    rowSpan: 1,
    title: ""
  };
  const { runtime, modalState } = createRuntime({
    pendingWidgetAddState,
    instanceById: () => null,
    buildWidgetModalDraft: (instance, options) => ({
      title: instance.title,
      page: options.pageCount,
      layout: {},
      config: {}
    })
  });

  runtime.openWidgetModal("pending-note", {
    pendingAdd: {
      instance: { id: "pending-note", type: "note", title: "Pending Note", page: 0 },
      pageCount: 4,
      placeholderPage: 3,
      type: "note",
      colSpan: 2,
      rowSpan: 2,
      title: "Pending Note"
    }
  });

  assert.equal(modalState.open, true);
  assert.equal(modalState.widgetId, "pending-note");
  assert.equal(modalState.draft.title, "Pending Note");
  assert.equal(modalState.draft.page, 4);
  assert.equal(pendingWidgetAddState.open, true);
  assert.equal(pendingWidgetAddState.widgetId, "pending-note");
});

test("widget modal runtime uses safe fallback definition when registry entry is missing", () => {
  const { runtime, modalState } = createRuntime({
    instanceById: () => ({ id: "w1", type: "missingWidget", title: "Legacy Widget", page: 0 }),
    widgetRegistry: {}
  });

  assert.doesNotThrow(() => {
    runtime.openWidgetModal("w1");
  });
  assert.equal(modalState.open, true);

  assert.doesNotThrow(() => {
    runtime.applyWidgetModal();
  });
  assert.equal(modalState.open, false);
});
