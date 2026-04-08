import test from "node:test";
import assert from "node:assert/strict";

import { createDockSettingsRuntime } from "../core/modal/dock-settings-runtime.js";

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

function createOverlay() {
  return {
    classList: createClassList(),
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
}

test("createDockSettingsRuntime opens modal with normalized draft and closes conflicting modals", () => {
  let open = false;
  const calls = [];
  const firstInput = { focused: false, focus() { this.focused = true; } };
  const dockModalState = { draft: null };
  const runtime = createDockSettingsRuntime({
    state: { mode: "edit", ui: { home: { dockShape: "flat", dockVisibility: "collapsible", dockLength: 9, dockSize: 50 } } },
    elements: {
      dockSettingsModalOverlay: createOverlay(),
      dockSettingsModalBody: {
        querySelector() {
          return firstInput;
        },
        replaceChildren() {},
        append() {}
      }
    },
    dockModalState,
    isOpen: () => open,
    setOpen: (value) => {
      open = value;
    },
    modalState: { open: true },
    getAddWidgetModalOpen: () => true,
    shortcutIconEditorState: { open: true },
    widgetTitleRenameState: { open: true },
    closeWidgetModal: () => calls.push("widget"),
    closeAddWidgetModal: () => calls.push("add"),
    closeShortcutIconEditor: () => calls.push("shortcut"),
    closeWidgetTitleRenameModal: () => calls.push("rename"),
    normalizeHomeLayout: (home) => home,
    normalizeDockShape: (value) => value,
    normalizeDockVisibility: (value) => value,
    normalizeDockLength: (value) => value,
    normalizeDockSize: (value) => value,
    setModalInteractionLock: () => calls.push("lock"),
    syncPersistentDock: () => calls.push("sync"),
    requestAnimationFrameFn: (callback) => callback()
  });

  runtime.openDockSettingsModal();

  assert.equal(open, true);
  assert.deepEqual(dockModalState.draft, {
    dockShape: "flat",
    dockVisibility: "collapsible",
    dockLength: 9,
    dockSize: 50
  });
  assert.deepEqual(calls, ["widget", "add", "shortcut", "rename", "lock", "sync"]);
  assert.equal(firstInput.focused, true);
});

test("createDockSettingsRuntime applies patch after closing modal", () => {
  let open = true;
  const dockModalState = {
    draft: {
      dockShape: "raised",
      dockVisibility: "fixed",
      dockLength: 7,
      dockSize: 48
    }
  };
  const patches = [];
  const locks = [];
  const runtime = createDockSettingsRuntime({
    state: { mode: "edit", ui: { home: {} } },
    elements: {
      dockSettingsModalOverlay: createOverlay(),
      dockSettingsModalBody: { replaceChildren() {} }
    },
    dockModalState,
    isOpen: () => open,
    setOpen: (value) => {
      open = value;
    },
    modalState: { open: false },
    getAddWidgetModalOpen: () => false,
    shortcutIconEditorState: { open: false },
    widgetTitleRenameState: { open: false },
    normalizeDockShape: (value) => value,
    normalizeDockVisibility: (value) => value,
    normalizeDockLength: (value) => value,
    normalizeDockSize: (value) => value,
    patchHomeLayout: (patch) => patches.push(patch),
    setModalInteractionLock: (value) => locks.push(value),
    blurFocusedElementInOverlay: () => {},
    syncPersistentDock: () => {}
  });

  assert.equal(runtime.applyDockSettingsModal(), true);
  assert.equal(open, false);
  assert.deepEqual(patches, [
    {
      dockShape: "raised",
      dockVisibility: "fixed",
      dockPosition: "bottom",
      dockLength: 7,
      dockSize: 48
    }
  ]);
  assert.deepEqual(locks, [false]);
});

test("createDockSettingsRuntime commits pending edits before reading draft", () => {
  let open = true;
  const dockModalState = {
    draft: {
      dockShape: "raised",
      dockVisibility: "fixed",
      dockLength: 7,
      dockSize: 48
    }
  };
  const patches = [];
  const runtime = createDockSettingsRuntime({
    state: { mode: "edit", ui: { home: {} } },
    elements: {
      dockSettingsModalOverlay: createOverlay(),
      dockSettingsModalBody: { replaceChildren() {}, append() {} }
    },
    dockModalState,
    isOpen: () => open,
    setOpen: (value) => {
      open = value;
    },
    modalState: { open: false },
    getAddWidgetModalOpen: () => false,
    shortcutIconEditorState: { open: false },
    widgetTitleRenameState: { open: false },
    normalizeDockShape: (value) => value,
    normalizeDockVisibility: (value) => value,
    normalizeDockLength: (value) => value,
    normalizeDockSize: (value) => value,
    patchHomeLayout: (patch) => patches.push(patch),
    setModalInteractionLock: () => {},
    blurFocusedElementInOverlay: () => {},
    syncPersistentDock: () => {},
    commitPendingEditableState: (_root, options) => {
      assert.deepEqual(options, { includeDescendants: true });
      dockModalState.draft.dockLength = 11;
    }
  });

  assert.equal(runtime.applyDockSettingsModal(), true);
  assert.equal(patches[0].dockLength, 11);
});
