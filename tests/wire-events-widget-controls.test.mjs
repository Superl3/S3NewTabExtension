import test from "node:test";
import assert from "node:assert/strict";

import { wireWidgetControlEvents } from "../core/wire-events-widget-controls.js";

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

test("wireWidgetControlEvents toggles dock settings modal", () => {
  const elements = {
    dockSettingsBtn: createEventNode()
  };
  const state = { mode: "edit", ui: {} };
  let open = false;
  let openCalls = 0;
  const closeCalls = [];

  wireWidgetControlEvents({
    elements,
    state,
    isDockSettingsModalOpen: () => open,
    openDockSettingsModal: () => {
      openCalls += 1;
    },
    closeDockSettingsModal: (value) => {
      closeCalls.push(value);
    }
  });

  elements.dockSettingsBtn.emit("click");
  assert.equal(openCalls, 1);
  assert.deepEqual(closeCalls, []);

  open = true;
  elements.dockSettingsBtn.emit("click");
  assert.deepEqual(closeCalls, [false]);
});

test("wireWidgetControlEvents opens add widget and forces edit from context action", () => {
  const elements = {
    boardContextAddWidgetBtn: createEventNode()
  };
  const state = {
    mode: "use",
    selectedWidgetId: "w1",
    ui: { activeTab: "global" }
  };
  const calls = {
    closeContext: 0,
    setBodyMode: 0,
    setSelected: [],
    refreshAll: 0,
    bounds: 0,
    save: 0,
    openAdd: 0
  };

  wireWidgetControlEvents({
    elements,
    state,
    closeBoardContextMenu: () => {
      calls.closeContext += 1;
    },
    setBodyMode: () => {
      calls.setBodyMode += 1;
    },
    setSelected: (id) => {
      calls.setSelected.push(id);
    },
    refreshAllWidgets: () => {
      calls.refreshAll += 1;
    },
    updateBoardBounds: () => {
      calls.bounds += 1;
    },
    requestAnimationFrameFn: (callback) => {
      callback();
    },
    queueSave: () => {
      calls.save += 1;
    },
    openAddWidgetModal: () => {
      calls.openAdd += 1;
    }
  });

  elements.boardContextAddWidgetBtn.emit("click");

  assert.equal(state.mode, "edit");
  assert.equal(calls.closeContext, 1);
  assert.equal(calls.setBodyMode, 1);
  assert.deepEqual(calls.setSelected, ["w1"]);
  assert.equal(calls.refreshAll, 1);
  assert.equal(calls.bounds, 2);
  assert.equal(calls.save, 1);
  assert.equal(calls.openAdd, 1);
});

test("wireWidgetControlEvents updates tab and guards reset by mode/confirm", async () => {
  const elements = {
    tabBackgroundBtn: createEventNode(),
    resetBtn: createEventNode()
  };
  const state = {
    mode: "use",
    ui: { activeTab: "global" }
  };
  let renderCount = 0;
  let resetCount = 0;
  let confirmResult = true;

  wireWidgetControlEvents({
    elements,
    state,
    renderSettings: () => {
      renderCount += 1;
    },
    windowConfirm: () => confirmResult,
    resetState: async () => {
      resetCount += 1;
    }
  });

  elements.tabBackgroundBtn.emit("click");
  assert.equal(state.ui.activeTab, "background");
  assert.equal(renderCount, 1);

  elements.resetBtn.emit("click");
  assert.equal(resetCount, 0);

  state.mode = "edit";
  confirmResult = false;
  elements.resetBtn.emit("click");
  assert.equal(resetCount, 0);

  confirmResult = true;
  elements.resetBtn.emit("click");
  assert.equal(resetCount, 1);
});

test("wireWidgetControlEvents prefers setActiveSettingsTab wiring when provided", () => {
  const elements = {
    tabGlobalBtn: createEventNode(),
    tabBackgroundBtn: createEventNode(),
    tabProfileBtn: createEventNode()
  };
  const state = {
    mode: "edit",
    ui: { activeTab: "global" }
  };
  const tabs = [];
  let renderCount = 0;

  wireWidgetControlEvents({
    elements,
    state,
    setActiveSettingsTab: (tab) => {
      tabs.push(tab);
    },
    renderSettings: () => {
      renderCount += 1;
    }
  });

  elements.tabBackgroundBtn.emit("click");
  elements.tabProfileBtn.emit("click");
  elements.tabGlobalBtn.emit("click");

  assert.deepEqual(tabs, ["background", "profile", "global"]);
  assert.equal(state.ui.activeTab, "global");
  assert.equal(renderCount, 0);
});

test("wireWidgetControlEvents closes add-widget modal on every ok click", () => {
  const elements = {
    addWidgetModalOkBtn: createEventNode()
  };
  const state = {
    ui: { activeTab: "global" }
  };
  let applyCalls = 0;
  let closeCalls = 0;

  wireWidgetControlEvents({
    elements,
    state,
    applyAddWidgetModal: () => {
      applyCalls += 1;
      return applyCalls > 1;
    },
    closeAddWidgetModal: () => {
      closeCalls += 1;
    }
  });

  elements.addWidgetModalOkBtn.emit("click");
  elements.addWidgetModalOkBtn.emit("click");

  assert.equal(applyCalls, 2);
  assert.equal(closeCalls, 2);
});

test("wireWidgetControlEvents still closes add-widget modal when apply throws", () => {
  const elements = {
    addWidgetModalOkBtn: createEventNode()
  };
  const state = {
    ui: { activeTab: "global" }
  };
  let closeCount = 0;

  wireWidgetControlEvents({
    elements,
    state,
    applyAddWidgetModal: () => {
      throw new Error("apply-fail");
    },
    closeAddWidgetModal: () => {
      closeCount += 1;
    }
  });

  assert.doesNotThrow(() => {
    elements.addWidgetModalOkBtn.emit("click");
  });
  assert.equal(closeCount, 1);
});

test("wireWidgetControlEvents context add uses latest state via getState after reassignment", () => {
  const elements = {
    boardContextAddWidgetBtn: createEventNode()
  };
  let activeState = {
    mode: "use",
    selectedWidgetId: "stale-selected",
    ui: { activeTab: "global" }
  };
  const wiredState = activeState;
  const selected = [];

  wireWidgetControlEvents({
    elements,
    state: wiredState,
    getState: () => activeState,
    closeBoardContextMenu: () => {},
    setBodyMode: () => {},
    setSelected: (id) => {
      selected.push(id);
    },
    refreshAllWidgets: () => {},
    updateBoardBounds: () => {},
    requestAnimationFrameFn: (callback) => {
      callback();
    },
    queueSave: () => {},
    openAddWidgetModal: () => {}
  });

  activeState = {
    mode: "use",
    selectedWidgetId: "latest-selected",
    ui: { activeTab: "global" }
  };

  elements.boardContextAddWidgetBtn.emit("click");

  assert.equal(activeState.mode, "edit");
  assert.equal(wiredState.mode, "use");
  assert.deepEqual(selected, ["latest-selected"]);
});
