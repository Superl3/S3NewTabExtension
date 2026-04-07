import test from "node:test";
import assert from "node:assert/strict";

import { wireOverlayControlEvents } from "../core/wire-events-overlays.js";

function createEventNode(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    emit(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler(event);
      }
    }
  };
}

test("wireOverlayControlEvents wires title rename controls", () => {
  const closeCalls = [];
  let applyCalls = 0;

  const elements = {
    widgetTitleRenameCloseBtn: createEventNode(),
    widgetTitleRenameCancelBtn: createEventNode(),
    widgetTitleRenameOkBtn: createEventNode(),
    widgetTitleRenameOverlay: createEventNode()
  };

  wireOverlayControlEvents({
    elements,
    modalState: {},
    closeWidgetTitleRenameModal: () => {
      closeCalls.push("close");
    },
    applyWidgetTitleRenameModal: () => {
      applyCalls += 1;
    }
  });

  elements.widgetTitleRenameCloseBtn.emit("click");
  elements.widgetTitleRenameCancelBtn.emit("click");
  elements.widgetTitleRenameOkBtn.emit("click");
  elements.widgetTitleRenameOverlay.emit("pointerdown", { target: elements.widgetTitleRenameOverlay });

  assert.equal(closeCalls.length, 4);
  assert.equal(applyCalls, 1);
});

test("wireOverlayControlEvents closes widget modal on overlay tap release", () => {
  const modalState = {};
  const closed = [];
  const widgetModalOverlay = createEventNode();

  wireOverlayControlEvents({
    elements: { widgetModalOverlay },
    modalState,
    getLastDragEndAt: () => 0,
    closeWidgetModal: (rerender) => {
      closed.push(rerender);
    }
  });

  widgetModalOverlay.emit("pointerdown", {
    pointerId: 8,
    clientX: 10,
    clientY: 12,
    target: widgetModalOverlay
  });
  widgetModalOverlay.emit("pointerup", {
    pointerId: 8,
    clientX: 10,
    clientY: 12,
    target: widgetModalOverlay
  });

  assert.deepEqual(closed, [false]);
});

test("wireOverlayControlEvents updates shortcut editor source from text input", () => {
  const shortcutIconEditorState = { source: "preset" };
  const shortcutIconEditorText = createEventNode({ value: "" });
  let refreshCount = 0;

  wireOverlayControlEvents({
    elements: { shortcutIconEditorText },
    modalState: {},
    shortcutIconEditorState,
    normalizeText: (value) => String(value || "").trim(),
    shortcutEditorRefreshPreview: () => {
      refreshCount += 1;
    }
  });

  shortcutIconEditorText.value = "A";
  shortcutIconEditorText.emit("input");
  assert.equal(shortcutIconEditorState.source, "text");

  shortcutIconEditorText.value = "";
  shortcutIconEditorText.emit("input");
  assert.equal(shortcutIconEditorState.source, "preset");
  assert.equal(refreshCount, 2);
});

test("wireOverlayControlEvents closes modal on primary apply clicks", () => {
  const modalState = { open: true };
  const shortcutIconEditorState = { open: true };
  const closeCalls = {
    rename: 0,
    dock: [],
    widget: [],
    shortcut: 0
  };
  const applyCalls = {
    rename: 0,
    dock: 0,
    widget: 0,
    shortcut: 0
  };

  const elements = {
    widgetTitleRenameOkBtn: createEventNode(),
    dockSettingsModalOkBtn: createEventNode(),
    widgetModalOkBtn: createEventNode(),
    shortcutIconEditorApplyBtn: createEventNode()
  };

  wireOverlayControlEvents({
    elements,
    modalState,
    shortcutIconEditorState,
    applyWidgetTitleRenameModal: () => {
      applyCalls.rename += 1;
    },
    applyDockSettingsModal: () => {
      applyCalls.dock += 1;
    },
    applyWidgetModal: () => {
      applyCalls.widget += 1;
    },
    applyShortcutIconEditor: () => {
      applyCalls.shortcut += 1;
    },
    closeWidgetTitleRenameModal: () => {
      closeCalls.rename += 1;
    },
    closeDockSettingsModal: (rerender) => {
      closeCalls.dock.push(rerender);
    },
    closeWidgetModal: (rerender) => {
      closeCalls.widget.push(rerender);
    },
    closeShortcutIconEditor: () => {
      closeCalls.shortcut += 1;
    }
  });

  elements.widgetTitleRenameOkBtn.emit("click");
  elements.dockSettingsModalOkBtn.emit("click");
  elements.widgetModalOkBtn.emit("click");
  elements.shortcutIconEditorApplyBtn.emit("click");

  assert.deepEqual(applyCalls, {
    rename: 1,
    dock: 1,
    widget: 1,
    shortcut: 1
  });
  assert.equal(closeCalls.rename, 1);
  assert.deepEqual(closeCalls.dock, [false]);
  assert.deepEqual(closeCalls.widget, [false]);
  assert.equal(closeCalls.shortcut, 1);
});

test("wireOverlayControlEvents closes modals even when primary apply returns false", () => {
  const modalState = { open: true };
  const shortcutIconEditorState = { open: true };
  const closeCalls = {
    rename: 0,
    dock: [],
    widget: [],
    shortcut: 0
  };
  const applyCalls = {
    rename: 0,
    dock: 0,
    widget: 0,
    shortcut: 0
  };

  const elements = {
    widgetTitleRenameOkBtn: createEventNode(),
    dockSettingsModalOkBtn: createEventNode(),
    widgetModalOkBtn: createEventNode(),
    shortcutIconEditorApplyBtn: createEventNode()
  };

  wireOverlayControlEvents({
    elements,
    modalState,
    shortcutIconEditorState,
    applyWidgetTitleRenameModal: () => {
      applyCalls.rename += 1;
      return false;
    },
    applyDockSettingsModal: () => {
      applyCalls.dock += 1;
      return false;
    },
    applyWidgetModal: () => {
      applyCalls.widget += 1;
      return false;
    },
    applyShortcutIconEditor: () => {
      applyCalls.shortcut += 1;
      return false;
    },
    closeWidgetTitleRenameModal: () => {
      closeCalls.rename += 1;
    },
    closeDockSettingsModal: (rerender) => {
      closeCalls.dock.push(rerender);
    },
    closeWidgetModal: (rerender) => {
      closeCalls.widget.push(rerender);
    },
    closeShortcutIconEditor: () => {
      closeCalls.shortcut += 1;
    }
  });

  elements.widgetTitleRenameOkBtn.emit("click");
  elements.dockSettingsModalOkBtn.emit("click");
  elements.widgetModalOkBtn.emit("click");
  elements.shortcutIconEditorApplyBtn.emit("click");

  assert.deepEqual(applyCalls, {
    rename: 1,
    dock: 1,
    widget: 1,
    shortcut: 1
  });
  assert.equal(closeCalls.rename, 1);
  assert.deepEqual(closeCalls.dock, [false]);
  assert.deepEqual(closeCalls.widget, [false]);
  assert.equal(closeCalls.shortcut, 1);
});

test("wireOverlayControlEvents still closes widget modal when apply throws", () => {
  const closeCalls = [];

  const elements = {
    widgetModalOkBtn: createEventNode()
  };

  wireOverlayControlEvents({
    elements,
    modalState: { open: true },
    applyWidgetModal: () => {
      throw new Error("apply-fail");
    },
    closeWidgetModal: (rerender) => {
      closeCalls.push(rerender);
    }
  });

  assert.doesNotThrow(() => {
    elements.widgetModalOkBtn.emit("click");
  });
  assert.deepEqual(closeCalls, [false]);
});

test("wireOverlayControlEvents still closes shortcut editor when apply throws", () => {
  let closed = 0;

  const elements = {
    shortcutIconEditorApplyBtn: createEventNode()
  };

  wireOverlayControlEvents({
    elements,
    modalState: { open: false },
    shortcutIconEditorState: { open: true },
    applyShortcutIconEditor: () => {
      throw new Error("apply-fail");
    },
    closeShortcutIconEditor: () => {
      closed += 1;
    }
  });

  assert.doesNotThrow(() => {
    elements.shortcutIconEditorApplyBtn.emit("click");
  });
  assert.equal(closed, 1);
});
