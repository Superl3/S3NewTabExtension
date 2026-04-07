import test from "node:test";
import assert from "node:assert/strict";

import { createSettingsPanelRuntime } from "../core/settings/panel-runtime.js";

function createClassList() {
  const set = new Set();
  return {
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

function createButton() {
  return {
    classList: createClassList(),
    attributes: {},
    title: "",
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
}

test("createSettingsPanelRuntime syncs visibility and tab selection", () => {
  const state = { mode: "edit", ui: { activeTab: "profile" } };
  let open = false;
  let dockSyncCount = 0;
  let renderCount = 0;
  const runtime = createSettingsPanelRuntime({
    state,
    elements: {
      settingsRailToggleBtn: createButton(),
      settingsPanel: createButton(),
      tabGlobalBtn: createButton(),
      tabBackgroundBtn: createButton(),
      tabProfileBtn: createButton()
    },
    documentObj: { body: { classList: createClassList() } },
    getOpen: () => open,
    setOpen: (value) => {
      open = value;
    },
    syncPersistentDock: () => {
      dockSyncCount += 1;
    },
    renderSettings: () => {
      renderCount += 1;
    }
  });

  assert.equal(runtime.toggleSettingsPanel(), true);
  assert.equal(open, true);
  assert.equal(runtime.syncSettingsTabButtons(), "profile");
  assert.equal(renderCount, 0);

  const active = runtime.setActiveSettingsTab("weird");
  assert.equal(active, "global");
  assert.equal(state.ui.activeTab, "global");
  assert.equal(renderCount, 1);
  assert.equal(dockSyncCount, 1);
});

test("createSettingsPanelRuntime ignores toggle outside edit mode and can close panel", () => {
  const state = { mode: "use", ui: { activeTab: "background" } };
  let open = true;
  const runtime = createSettingsPanelRuntime({
    state,
    elements: {
      settingsRailToggleBtn: createButton(),
      settingsPanel: createButton()
    },
    documentObj: { body: { classList: createClassList() } },
    getOpen: () => open,
    setOpen: (value) => {
      open = value;
    }
  });

  assert.equal(runtime.toggleSettingsPanel(), true);
  assert.equal(open, true);

  runtime.closeSettingsPanel();
  assert.equal(open, false);
});
