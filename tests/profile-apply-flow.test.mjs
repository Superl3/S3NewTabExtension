import test from "node:test";
import assert from "node:assert/strict";

import { applyProfileSnapshotFlow } from "../core/profile-apply-flow.js";

function createBaseState() {
  return {
    ui: {
      activeTab: "global",
      theme: { primary: "#000" },
      background: { mode: "solid", overlayOpacity: 0.2 },
      home: { mode: "free" },
      widgetCommonMaster: { surfaceMode: "normal" },
      shortcuts: { iconSizePercent: 100 },
      monday: { timezone: "Asia/Seoul" },
      defaultProfileSnapshot: null,
      defaultProfileUpdatedAt: 0
    },
    instances: [{ id: "old-1", type: "note", commonOverrides: {} }],
    presets: [],
    selectedWidgetId: "old-1",
    nextId: 10
  };
}

test("applyProfileSnapshotFlow replaces widgets when scope includes widgets", () => {
  const state = createBaseState();
  const calls = {
    applyTheme: 0,
    setBodyMode: 0,
    applyBackground: 0,
    renderBoard: 0,
    refreshAllWidgets: 0,
    applyGridLayout: 0,
    updateBoardBounds: 0,
    renderSettings: 0,
    queueSave: 0,
    syncLauncherPagingState: 0,
    closeWidgetModalArgs: [],
    applyWidgetCommonMaster: 0,
    inferNextIdArgs: null
  };

  const snapshot = {
    ui: {
      theme: { primary: "#123456" },
      background: { mode: "wallpaper", overlayOpacity: 0.4 },
      home: { mode: "grid" },
      widgetCommonMaster: { surfaceMode: "transparent" },
      shortcuts: { iconSizePercent: 180 },
      monday: { timezone: "UTC" }
    },
    instances: [{ id: "new-1", type: "clock", commonOverrides: {} }]
  };

  applyProfileSnapshotFlow(snapshot, "all", {
    state,
    clonePresetSnapshot: (value) => structuredClone(value),
    hydrate: (value) => value,
    normalizeHomeLayout: (value) => value,
    normalizeWidgetCommonMaster: (value) => value,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    normalizeMondayGlobalSettings: (value) => value,
    inferNextId: (instances, nextId) => {
      calls.inferNextIdArgs = { instances, nextId };
      return 77;
    },
    applyWidgetCommonMaster: () => {
      calls.applyWidgetCommonMaster += 1;
    },
    inferCommonOverrides: () => ({ derived: true }),
    syncLauncherPagingState: () => {
      calls.syncLauncherPagingState += 1;
    },
    closeWidgetModal: (value) => {
      calls.closeWidgetModalArgs.push(value);
    },
    applyTheme: () => {
      calls.applyTheme += 1;
    },
    setBodyMode: () => {
      calls.setBodyMode += 1;
    },
    applyBackground: () => {
      calls.applyBackground += 1;
    },
    renderBoard: () => {
      calls.renderBoard += 1;
    },
    runtimeMap: new Map(),
    applyCardVisual: () => {},
    refreshAllWidgets: () => {
      calls.refreshAllWidgets += 1;
    },
    applyGridLayout: () => {
      calls.applyGridLayout += 1;
    },
    updateBoardBounds: () => {
      calls.updateBoardBounds += 1;
    },
    renderSettings: () => {
      calls.renderSettings += 1;
    },
    queueSave: () => {
      calls.queueSave += 1;
    }
  });

  assert.equal(state.instances.length, 1);
  assert.equal(state.instances[0].id, "new-1");
  assert.equal(state.selectedWidgetId, "");
  assert.equal(state.nextId, 77);
  assert.deepEqual(calls.closeWidgetModalArgs, [false]);
  assert.equal(calls.applyWidgetCommonMaster, 1);
  assert.equal(calls.renderBoard, 1);
  assert.equal(calls.refreshAllWidgets, 0);
  assert.equal(calls.applyTheme, 1);
  assert.equal(calls.setBodyMode, 1);
  assert.equal(calls.applyBackground, 1);
  assert.equal(calls.renderSettings, 1);
  assert.equal(calls.queueSave, 1);
  assert.equal(calls.syncLauncherPagingState, 1);
  assert.ok(Array.isArray(calls.inferNextIdArgs.instances));
});

test("applyProfileSnapshotFlow keeps instances for background scope", () => {
  const state = createBaseState();
  state.ui.home.mode = "grid";
  state.instances = [
    { id: "keep-1", type: "note", commonOverrides: {} },
    { id: "keep-2", type: "clock", commonOverrides: {} }
  ];

  const originalInstancesRef = state.instances;
  const calls = {
    renderBoard: 0,
    refreshAllWidgets: 0,
    applyGridLayoutArgs: [],
    updateBoardBounds: 0,
    applyCardVisual: 0,
    applyWidgetCommonMaster: 0
  };

  const snapshot = {
    ui: {
      theme: { primary: "#999" },
      background: { mode: "wallpaper", overlayOpacity: 0.6 },
      home: { mode: "free" },
      widgetCommonMaster: { surfaceMode: "transparent" },
      shortcuts: { iconSizePercent: 130 },
      monday: { timezone: "UTC" }
    },
    instances: [{ id: "should-not-apply" }]
  };

  applyProfileSnapshotFlow(snapshot, "background", {
    state,
    clonePresetSnapshot: (value) => structuredClone(value),
    hydrate: (value) => value,
    normalizeHomeLayout: (value) => value,
    normalizeWidgetCommonMaster: (value) => value,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    normalizeMondayGlobalSettings: (value) => value,
    inferNextId: () => 999,
    applyWidgetCommonMaster: () => {
      calls.applyWidgetCommonMaster += 1;
    },
    inferCommonOverrides: () => ({ fallback: true }),
    syncLauncherPagingState: () => {},
    closeWidgetModal: () => {},
    applyTheme: () => {},
    setBodyMode: () => {},
    applyBackground: () => {},
    renderBoard: () => {
      calls.renderBoard += 1;
    },
    runtimeMap: new Map([["keep-1", { card: {} }]]),
    applyCardVisual: () => {
      calls.applyCardVisual += 1;
    },
    refreshAllWidgets: () => {
      calls.refreshAllWidgets += 1;
    },
    applyGridLayout: (value) => {
      calls.applyGridLayoutArgs.push(value);
    },
    updateBoardBounds: () => {
      calls.updateBoardBounds += 1;
    },
    renderSettings: () => {},
    queueSave: () => {}
  });

  assert.equal(state.instances, originalInstancesRef);
  assert.equal(state.ui.theme.primary, "#000");
  assert.equal(state.ui.background.mode, "wallpaper");
  assert.equal(calls.renderBoard, 0);
  assert.equal(calls.refreshAllWidgets, 1);
  assert.deepEqual(calls.applyGridLayoutArgs, [{ commitFreeLayout: false }]);
  assert.equal(calls.updateBoardBounds, 0);
  assert.equal(calls.applyWidgetCommonMaster, 2);
  assert.equal(calls.applyCardVisual, 1);
});
