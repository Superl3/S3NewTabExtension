import test from "node:test";
import assert from "node:assert/strict";

import { wireKeydownEvents } from "../core/wire-events-keydown.js";

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
    isTextEditableTarget: () => false,
    isInsideWidgetTitleRenameOverlay: () => true,
    isAddWidgetModalOpen: () => false,
    isInsideAddWidgetModalOverlay: () => true,
    isDockSettingsModalOpen: () => false,
    isInsideDockSettingsModalOverlay: () => true,
    isInsideModalOverlay: () => true,
    isHtmlInputElement: (target) => target?.kind === "input",
    isHtmlSelectElement: (target) => target?.kind === "select",
    isHtmlElement: () => false
  };
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

test("wireKeydownEvents applies title rename on enter input", () => {
  const windowObj = createWindowHub();
  let applied = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    widgetTitleRenameState: { open: true },
    applyWidgetTitleRenameModal: () => {
      applied += 1;
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "input" } });
  windowObj.emit("keydown", event);

  assert.equal(applied, 1);
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

test("wireKeydownEvents applies dock settings modal on enter select", () => {
  const windowObj = createWindowHub();
  let applied = 0;

  wireKeydownEvents({
    windowObj,
    ...createBaseDeps(),
    isDockSettingsModalOpen: () => true,
    applyDockSettingsModal: () => {
      applied += 1;
    }
  });

  const event = createKeyEvent({ key: "Enter", target: { kind: "select" } });
  windowObj.emit("keydown", event);

  assert.equal(applied, 1);
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
