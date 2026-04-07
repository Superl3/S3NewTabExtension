import test from "node:test";
import assert from "node:assert/strict";

import { createWidgetTitleRenameRuntime } from "../core/modal/widget-title-rename-runtime.js";

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

test("createWidgetTitleRenameRuntime opens modal and focuses input", () => {
  const state = { open: false, widgetId: "" };
  const input = {
    value: "",
    focused: false,
    selected: false,
    focus() {
      this.focused = true;
    },
    select() {
      this.selected = true;
    }
  };
  const runtime = createWidgetTitleRenameRuntime({
    elements: {
      widgetTitleRenameOverlay: {
        classList: createClassList(),
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        }
      },
      widgetTitleRenameInput: input
    },
    widgetTitleRenameState: state,
    modalState: { open: false },
    getAddWidgetModalOpen: () => false,
    isDockSettingsModalOpen: () => false,
    shortcutIconEditorState: { open: false },
    instanceById: () => ({ id: "w1", type: "clock", title: "Clock A" }),
    widgetRegistry: { clock: { title: "Clock" } },
    setModalInteractionLock: () => {},
    requestAnimationFrameFn: (callback) => callback()
  });

  runtime.openWidgetTitleRenameModal("w1");

  assert.equal(state.open, true);
  assert.equal(state.widgetId, "w1");
  assert.equal(input.value, "Clock A");
  assert.equal(input.focused, true);
  assert.equal(input.selected, true);
});

test("createWidgetTitleRenameRuntime applies title change and closes modal", () => {
  const renameState = { open: true, widgetId: "w1" };
  const instance = { id: "w1", type: "clock", title: "Old" };
  const titleEl = { textContent: "Old" };
  const modalState = { open: true, widgetId: "w1", draft: { title: "Old" } };
  const history = [];
  let renderWidgetModalCount = 0;
  let renderDockWidgetsCount = 0;
  let renderSettingsCount = 0;
  let queueSaveCount = 0;
  const locks = [];
  const runtime = createWidgetTitleRenameRuntime({
    elements: {
      widgetTitleRenameOverlay: {
        classList: createClassList(),
        setAttribute() {}
      },
      widgetTitleRenameInput: { value: "  New Title  " }
    },
    widgetTitleRenameState: renameState,
    modalState,
    getAddWidgetModalOpen: () => false,
    isDockSettingsModalOpen: () => false,
    shortcutIconEditorState: { open: false },
    instanceById: () => instance,
    widgetRegistry: { clock: { title: "Clock" } },
    normalizeText: (value) => String(value || "").trim(),
    setModalInteractionLock: (value) => locks.push(value),
    blurFocusedElementInOverlay: () => {},
    recordHistorySnapshot: (label) => history.push(label),
    runtime: {
      get: () => ({
        card: {
          querySelector: () => titleEl
        }
      })
    },
    renderWidgetModal: () => {
      renderWidgetModalCount += 1;
    },
    isWidgetInContainer: () => true,
    refreshWidgetsByType: () => {},
    isWidgetDocked: () => true,
    renderDockWidgets: () => {
      renderDockWidgetsCount += 1;
    },
    renderSettings: () => {
      renderSettingsCount += 1;
    },
    queueSave: () => {
      queueSaveCount += 1;
    }
  });

  assert.equal(runtime.applyWidgetTitleRenameModal(), true);
  assert.equal(instance.title, "New Title");
  assert.equal(titleEl.textContent, "New Title");
  assert.deepEqual(history, ["Rename widget title"]);
  assert.equal(modalState.draft.title, "New Title");
  assert.equal(renderWidgetModalCount, 1);
  assert.equal(renderDockWidgetsCount, 1);
  assert.equal(renderSettingsCount, 1);
  assert.equal(queueSaveCount, 1);
  assert.equal(renameState.open, false);
  assert.equal(renameState.widgetId, "");
  assert.deepEqual(locks, []);
});
