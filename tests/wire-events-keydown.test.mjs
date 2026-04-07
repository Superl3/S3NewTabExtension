import test from "node:test";
import assert from "node:assert/strict";

import { wireKeydownEvents } from "../core/wire-events-keydown.js";
import { createWidgetModalRuntime } from "../core/widget-modal-runtime.js";

function createWindowHub() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    emit(type, event) {
      for (const handler of listeners.get(type) || []) {
        handler(event);
      }
    }
  };
}

function createKeyEvent(overrides = {}) {
  let prevented = false;
  let stopped = false;
  return {
    key: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...overrides,
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      stopped = true;
    },
    get prevented() {
      return prevented;
    },
    get stopped() {
      return stopped;
    }
  };
}

function createBaseDeps() {
  return {
    documentObj: { activeElement: null },
    elements: { widgetModalOverlay: null },
    boardContextMenuState: { open: false },
    widgetTitleRenameState: { open: false },
    modalState: { open: false },
    shortcutIconEditorState: { open: false },
    applyShortcutIconEditor: () => {},
    isTextEditableTarget: () => false,
    isInsideWidgetTitleRenameOverlay: () => true,
    isAddWidgetModalOpen: () => false,
    isInsideAddWidgetModalOverlay: () => true,
    isDockSettingsModalOpen: () => false,
    isInsideDockSettingsModalOverlay: () => true,
    isInsideModalOverlay: () => true,
    applyWidgetModal: () => {},
    isHtmlInputElement: (target) => target?.kind === "input",
    isHtmlSelectElement: (target) => target?.kind === "select",
    isHtmlElement: () => false
  };
}

function createElement() {
  return {
    classList: {
      add() {},
      remove() {}
    },
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

function createLegacyWidgetModalRuntime() {
  const modalState = {
    open: true,
    widgetId: "w1",
    draft: {
      layout: {},
      config: {}
    },
    activeTab: "widget"
  };

  const runtime = createWidgetModalRuntime({
    modalState,
    widgetTitleRenameState: { open: false },
    shortcutIconEditorState: { open: false },
    elements: {
      widgetModalOverlay: createElement(),
      widgetModalTabs: createElement(),
      widgetModalBody: createElement(),
      widgetModalCloseBtn: { disabled: false },
      widgetModalCancelBtn: { disabled: false },
      widgetModalDefaultBtn: { onclick: null }
    },
    state: { ui: { home: {}, widgetCommonMaster: {} } },
    instanceById: () => ({ id: "w1", type: "legacyMissing", title: "Legacy Widget", page: 0 }),
    widgetRegistry: {},
    closeWidgetTitleRenameModal: () => {},
    buildWidgetModalDraft: () => ({ layout: {}, config: {} }),
    currentLauncherPageCount: () => 1,
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
    renderSettings: () => {},
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
    syncLauncherPagingState: () => ({ pageCount: 1 }),
    syncWidgetStateAfterModalApply: () => {},
    refreshWidgetRuntimeAfterModalApply: () => {},
    runtimeMap: new Map(),
    applyLayout: () => {},
    applyCardVisual: () => {},
    refreshWidgetsByType: () => {},
    isWidgetInContainer: () => false,
    isWidgetDocked: () => false,
    renderDockWidgets: () => {},
    updateBoardBounds: () => {},
    queueSave: () => {},
    documentObj: { createElement }
  });

  return { runtime, modalState };
}

test("wireKeydownEvents handles undo/redo shortcuts", () => {
  const windowObj = createWindowHub();
  let undo = 0;
  let redo = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    undoLastChange: () => {
      undo += 1;
    },
    redoLastChange: () => {
      redo += 1;
    }
  });

  const undoEvent = createKeyEvent({ key: "z", ctrlKey: true });
  windowObj.emit("keydown", undoEvent);
  assert.equal(undo, 1);
  assert.equal(undoEvent.prevented, true);

  const redoEvent = createKeyEvent({ key: "y", ctrlKey: true });
  windowObj.emit("keydown", redoEvent);
  assert.equal(redo, 1);
  assert.equal(redoEvent.prevented, true);
});

test("wireKeydownEvents prioritizes board context menu escape", () => {
  const windowObj = createWindowHub();
  let closed = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    boardContextMenuState: { open: true },
    closeBoardContextMenu: () => {
      closed += 1;
    }
  });

  const event = createKeyEvent({ key: "Escape" });
  windowObj.emit("keydown", event);

  assert.equal(closed, 1);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents applies and closes title rename on enter input", () => {
  const windowObj = createWindowHub();
  let applied = 0;
  let closed = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    widgetTitleRenameState: { open: true },
    applyWidgetTitleRenameModal: () => {
      applied += 1;
    },
    closeWidgetTitleRenameModal: () => {
      closed += 1;
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input" } });
  windowObj.emit("keydown", event);

  assert.equal(applied, 1);
  assert.equal(closed, 1);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents blocks input when add-widget modal is open and target outside", () => {
  const windowObj = createWindowHub();

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    isAddWidgetModalOpen: () => true,
    isInsideAddWidgetModalOverlay: () => false
  });

  const event = createKeyEvent({ key: "A", target: { kind: "button" } });
  windowObj.emit("keydown", event);

  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
});

test("wireKeydownEvents closes add-widget modal on enter when apply succeeds", () => {
  const windowObj = createWindowHub();
  let applyCount = 0;
  let closeCount = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    isAddWidgetModalOpen: () => true,
    isInsideAddWidgetModalOverlay: () => true,
    applyAddWidgetModal: () => {
      applyCount += 1;
      return true;
    },
    closeAddWidgetModal: () => {
      closeCount += 1;
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input" } });
  windowObj.emit("keydown", event);

  assert.equal(applyCount, 1);
  assert.equal(closeCount, 1);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents closes add-widget modal on enter even when apply fails", () => {
  const windowObj = createWindowHub();
  let applyCount = 0;
  let closeCount = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    isAddWidgetModalOpen: () => true,
    isInsideAddWidgetModalOverlay: () => true,
    applyAddWidgetModal: () => {
      applyCount += 1;
      return false;
    },
    closeAddWidgetModal: () => {
      closeCount += 1;
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input" } });
  windowObj.emit("keydown", event);

  assert.equal(applyCount, 1);
  assert.equal(closeCount, 1);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents closes add-widget modal on enter when apply throws", () => {
  const windowObj = createWindowHub();
  let closeCount = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    isAddWidgetModalOpen: () => true,
    isInsideAddWidgetModalOverlay: () => true,
    applyAddWidgetModal: () => {
      throw new Error("apply-fail");
    },
    closeAddWidgetModal: () => {
      closeCount += 1;
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input" } });
  assert.doesNotThrow(() => {
    windowObj.emit("keydown", event);
  });

  assert.equal(closeCount, 1);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents applies and closes dock settings modal on enter select", () => {
  const windowObj = createWindowHub();
  let applied = 0;
  const closed = [];

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    isDockSettingsModalOpen: () => true,
    applyDockSettingsModal: () => {
      applied += 1;
    },
    closeDockSettingsModal: (rerender) => {
      closed.push(rerender);
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "select" } });
  windowObj.emit("keydown", event);

  assert.equal(applied, 1);
  assert.deepEqual(closed, [false]);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents closes dock settings modal on enter even when apply fails", () => {
  const windowObj = createWindowHub();
  let applied = 0;
  const closed = [];

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    isDockSettingsModalOpen: () => true,
    isInsideDockSettingsModalOverlay: () => true,
    applyDockSettingsModal: () => {
      applied += 1;
      return false;
    },
    closeDockSettingsModal: (rerender) => {
      closed.push(rerender);
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "select" } });
  windowObj.emit("keydown", event);

  assert.equal(applied, 1);
  assert.deepEqual(closed, [false]);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents closes shortcut editor on escape when widget modal closed", () => {
  const windowObj = createWindowHub();
  let closed = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    modalState: { open: false },
    shortcutIconEditorState: { open: true },
    closeShortcutIconEditor: () => {
      closed += 1;
    }
  });

  const event = createKeyEvent({ key: "Escape" });
  windowObj.emit("keydown", event);

  assert.equal(closed, 1);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents applies and closes shortcut editor on enter input", () => {
  const windowObj = createWindowHub();
  let applied = 0;
  let closed = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    modalState: { open: false },
    shortcutIconEditorState: { open: true },
    applyShortcutIconEditor: () => {
      applied += 1;
    },
    closeShortcutIconEditor: () => {
      closed += 1;
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input", type: "text" } });
  windowObj.emit("keydown", event);

  assert.equal(applied, 1);
  assert.equal(closed, 1);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents closes widget modal on escape when inside modal", () => {
  const windowObj = createWindowHub();
  let closed = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    modalState: { open: true },
    isInsideModalOverlay: () => true,
    closeWidgetModal: (rerender) => {
      if (rerender === false) {
        closed += 1;
      }
    }
  });

  const event = createKeyEvent({ key: "Escape" });
  windowObj.emit("keydown", event);

  assert.equal(closed, 1);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents applies and closes widget settings modal on enter input", () => {
  const windowObj = createWindowHub();
  let applied = 0;
  const closed = [];

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    modalState: { open: true },
    applyWidgetModal: () => {
      applied += 1;
    },
    isInsideModalOverlay: () => true,
    closeWidgetModal: (rerender) => {
      closed.push(rerender);
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input" } });
  windowObj.emit("keydown", event);

  assert.equal(applied, 1);
  assert.deepEqual(closed, [false]);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents closes widget settings modal on enter even when apply returns false", () => {
  const windowObj = createWindowHub();
  let applied = 0;
  const closed = [];

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    modalState: { open: true },
    applyWidgetModal: () => {
      applied += 1;
      return false;
    },
    isInsideModalOverlay: () => true,
    closeWidgetModal: (rerender) => {
      closed.push(rerender);
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input" } });
  windowObj.emit("keydown", event);

  assert.equal(applied, 1);
  assert.deepEqual(closed, [false]);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents closes widget settings modal on enter when apply throws", () => {
  const windowObj = createWindowHub();
  const closed = [];

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    modalState: { open: true },
    applyWidgetModal: () => {
      throw new Error("apply-fail");
    },
    isInsideModalOverlay: () => true,
    closeWidgetModal: (rerender) => {
      closed.push(rerender);
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input" } });
  assert.doesNotThrow(() => {
    windowObj.emit("keydown", event);
  });

  assert.deepEqual(closed, [false]);
  assert.equal(event.prevented, true);
});

test("wireKeydownEvents enter-submit supports legacy widget settings definitions", () => {
  const windowObj = createWindowHub();
  const { runtime, modalState } = createLegacyWidgetModalRuntime();

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    modalState,
    applyWidgetModal: runtime.applyWidgetModal,
    isInsideModalOverlay: () => true,
    closeWidgetModal: runtime.closeWidgetModal
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input" } });
  assert.doesNotThrow(() => {
    windowObj.emit("keydown", event);
  });

  assert.equal(modalState.open, false);
  assert.equal(event.prevented, true);
});
