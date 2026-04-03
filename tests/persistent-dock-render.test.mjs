import test from "node:test";
import assert from "node:assert/strict";

import { syncPersistentDockView } from "../core/persistent-dock-render.js";

function createClassList() {
  const set = new Set();
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
    toggle(name, force) {
      if (typeof force === "boolean") {
        if (force) {
          set.add(name);
        } else {
          set.delete(name);
        }
        return;
      }
      if (set.has(name)) {
        set.delete(name);
      } else {
        set.add(name);
      }
    },
    has(name) {
      return set.has(name);
    }
  };
}

function createNode() {
  return {
    classList: createClassList(),
    dataset: {},
    style: {
      vars: {},
      setProperty(name, value) {
        this.vars[name] = String(value);
      }
    },
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    replaceChildren() {
      this.replaced = true;
    }
  };
}

test("syncPersistentDockView applies disabled fallback when dock missing", () => {
  const syncCalls = [];

  syncPersistentDockView({
    dock: null,
    syncDockContentPadding: (config) => {
      syncCalls.push(config);
    }
  });

  assert.deepEqual(syncCalls, [{ enabled: false, heightPx: 0 }]);
});

test("syncPersistentDockView handles disabled dock config", () => {
  const dock = createNode();
  const strip = createNode();
  const dockUiState = { activeId: "w1" };
  let cleared = 0;
  let destroyed = 0;
  const syncCalls = [];

  syncPersistentDockView({
    dock,
    dockWidgetStrip: strip,
    dockUiState,
    config: { enabled: false, heightPx: 40 },
    clearWidgetDragGuideState: () => {
      cleared += 1;
    },
    destroyDockEmbeddedControllers: () => {
      destroyed += 1;
    },
    syncDockContentPadding: (config) => {
      syncCalls.push(config);
    }
  });

  assert.equal(cleared, 1);
  assert.equal(destroyed, 1);
  assert.equal(strip.replaced, true);
  assert.equal(dockUiState.activeId, "");
  assert.equal(dock.classList.has("is-disabled"), true);
  assert.equal(dock.attributes["aria-hidden"], "true");
  assert.equal(syncCalls.length, 1);
});

test("syncPersistentDockView updates enabled dock visuals and settings button", () => {
  const dock = createNode();
  const dockSettingsBtn = {
    classList: createClassList(),
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    title: "",
    disabled: false,
    tabIndex: 0
  };
  let renderCount = 0;
  const syncCalls = [];

  syncPersistentDockView({
    dock,
    dockSettingsBtn,
    config: {
      enabled: true,
      shape: "pill",
      visibility: "fixed",
      position: "bottom",
      lengthUnits: 8,
      heightPx: 52
    },
    isEditMode: () => true,
    dockSettingsModalOpen: true,
    syncDockContentPadding: (config) => {
      syncCalls.push(config);
    },
    renderDockWidgets: () => {
      renderCount += 1;
    },
    requestAnimationFrameFn: (callback) => callback()
  });

  assert.equal(dock.classList.has("is-disabled"), false);
  assert.equal(dock.attributes["aria-hidden"], "false");
  assert.equal(dock.dataset.shape, "pill");
  assert.equal(dock.style.vars["--dock-length-units"], "8");
  assert.equal(dock.style.vars["--dock-unit-size"], "52px");
  assert.equal(dockSettingsBtn.disabled, false);
  assert.equal(dockSettingsBtn.tabIndex, 0);
  assert.equal(dockSettingsBtn.classList.has("is-active"), true);
  assert.equal(renderCount, 1);
  assert.equal(syncCalls.length, 2);
});
