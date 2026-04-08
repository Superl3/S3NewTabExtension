import test from "node:test";
import assert from "node:assert/strict";

import { wireSettingsAndModeEvents } from "../core/wire-events-settings-mode.js";

function createEventNode() {
  const listeners = new Map();
  return {
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

test("wireSettingsAndModeEvents toggles settings rail only in edit mode", () => {
  let panelOpen = false;
  let syncCount = 0;
  const state = { mode: "edit", selectedWidgetId: "w1" };
  const elements = {
    settingsRailToggleBtn: createEventNode()
  };

  wireSettingsAndModeEvents({
    elements,
    state,
    getRuntimeSettingsPanelOpen: () => panelOpen,
    setRuntimeSettingsPanelOpen: (value) => {
      panelOpen = value;
    },
    syncSettingsPanelVisibility: () => {
      syncCount += 1;
    }
  });

  elements.settingsRailToggleBtn.emit("click");
  assert.equal(panelOpen, true);
  assert.equal(syncCount, 1);

  state.mode = "use";
  elements.settingsRailToggleBtn.emit("click");
  assert.equal(panelOpen, true);
  assert.equal(syncCount, 1);
});

test("wireSettingsAndModeEvents prefers toggleSettingsPanel and closeSettingsPanel wiring", () => {
  const state = { mode: "edit", selectedWidgetId: "w1" };
  const elements = {
    settingsRailToggleBtn: createEventNode(),
    settingsPanelBackdrop: createEventNode()
  };
  const calls = {
    toggle: 0,
    close: 0,
    setOpen: 0,
    sync: 0
  };

  wireSettingsAndModeEvents({
    elements,
    state,
    toggleSettingsPanel: () => {
      calls.toggle += 1;
    },
    closeSettingsPanel: () => {
      calls.close += 1;
    },
    getRuntimeSettingsPanelOpen: () => true,
    setRuntimeSettingsPanelOpen: () => {
      calls.setOpen += 1;
    },
    syncSettingsPanelVisibility: () => {
      calls.sync += 1;
    }
  });

  elements.settingsRailToggleBtn.emit("click");
  elements.settingsPanelBackdrop.emit("click");

  assert.deepEqual(calls, {
    toggle: 1,
    close: 1,
    setOpen: 0,
    sync: 0
  });
});

test("wireSettingsAndModeEvents mode toggle defers bounds sync on placeholder", () => {
  const state = { mode: "edit", selectedWidgetId: "w2" };
  const elements = {
    modeToggleBtn: createEventNode()
  };
  const selected = [];
  const actions = {
    compact: 0,
    setBodyMode: 0,
    refreshAll: 0,
    updateBounds: 0,
    setActivePage: 0
  };
  let scheduled = null;

  wireSettingsAndModeEvents({
    elements,
    state,
    currentLauncherPageCount: () => 4,
    currentLauncherViewportPage: () => -1,
    isPlaceholderLauncherPage: () => true,
    setActiveLauncherPage: () => {
      actions.setActivePage += 1;
    },
    currentLauncherActivePage: () => 2,
    compactEmptyLauncherPagesForUseMode: () => {
      actions.compact += 1;
    },
    setBodyMode: () => {
      actions.setBodyMode += 1;
    },
    setSelected: (id) => {
      selected.push(id);
    },
    refreshAllWidgets: () => {
      actions.refreshAll += 1;
    },
    updateBoardBounds: () => {
      actions.updateBounds += 1;
    },
    requestAnimationFrameFn: (callback) => {
      callback();
    },
    setTimeoutFn: (callback, delay) => {
      scheduled = { callback, delay };
    },
    boardPageTransitionMs: 260
  });

  elements.modeToggleBtn.emit("click");

  assert.equal(state.mode, "use");
  assert.equal(state.selectedWidgetId, "");
  assert.deepEqual(selected, [""]);
  assert.equal(actions.compact, 1);
  assert.equal(actions.setBodyMode, 1);
  assert.equal(actions.refreshAll, 1);
  assert.equal(actions.setActivePage, 1);
  assert.equal(actions.updateBounds, 0);
  assert.equal(scheduled.delay, 280);

  scheduled.callback();
  assert.equal(actions.updateBounds, 2);
});

test("wireSettingsAndModeEvents home anchor validates target page", () => {
  const state = { mode: "edit", selectedWidgetId: "" };
  const elements = {
    homePageAnchorBtn: createEventNode()
  };
  const toasts = [];
  const homePages = [];
  let targetPage = Number.NaN;

  wireSettingsAndModeEvents({
    elements,
    state,
    resolveHomeAnchorTargetPage: () => targetPage,
    showAddWidgetToast: (message) => {
      toasts.push(message);
    },
    setLauncherHomePage: (page) => {
      homePages.push(page);
    }
  });

  elements.homePageAnchorBtn.emit("click");
  assert.equal(toasts.length, 1);
  assert.deepEqual(homePages, []);

  targetPage = 3;
  elements.homePageAnchorBtn.emit("click");
  assert.deepEqual(homePages, [3]);
});

test("wireSettingsAndModeEvents mode toggle reads latest state via getState after reassignment", () => {
  const elements = {
    modeToggleBtn: createEventNode()
  };
  let activeState = {
    mode: "use",
    selectedWidgetId: "stale-selected"
  };
  const wiredState = activeState;
  const selected = [];

  wireSettingsAndModeEvents({
    elements,
    state: wiredState,
    getState: () => activeState,
    setBodyMode: () => {},
    setSelected: (id) => {
      selected.push(id);
    },
    refreshAllWidgets: () => {},
    updateBoardBounds: () => {},
    requestAnimationFrameFn: (callback) => {
      callback();
    }
  });

  activeState = {
    mode: "use",
    selectedWidgetId: "latest-selected"
  };

  elements.modeToggleBtn.emit("click");

  assert.equal(activeState.mode, "edit");
  assert.equal(wiredState.mode, "use");
  assert.deepEqual(selected, ["latest-selected"]);
});
