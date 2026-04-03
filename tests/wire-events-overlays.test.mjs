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

  assert.equal(closeCalls.length, 3);
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
