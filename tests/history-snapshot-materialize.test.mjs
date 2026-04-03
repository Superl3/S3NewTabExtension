import test from "node:test";
import assert from "node:assert/strict";

import { materializeHistorySnapshotRuntime } from "../core/history-snapshot-materialize.js";

function createDeps(baseSnapshot) {
  return {
    buildSessionSnapshot: () => structuredClone(baseSnapshot),
    isStateObject: (value) => value !== null && typeof value === "object" && !Array.isArray(value),
    buildHistoryBackgroundSnapshot: (value) => ({ mode: value.mode, overlayOpacity: value.overlayOpacity }),
    buildHistoryHomeSnapshot: (value) => ({ pageCount: value.pageCount, dockEnabled: value.dockEnabled }),
    normalizeHomeLayout: (value) => value,
    normalizeActivePage: (page, pageCount, fallback) => {
      const num = Number.isFinite(Number(page)) ? Math.floor(Number(page)) : fallback;
      return Math.max(0, Math.min(Math.max(0, pageCount - 1), num));
    },
    normalizeMondayGlobalSettings: (value) => ({ ...value, normalized: true })
  };
}

test("materializeHistorySnapshotRuntime returns base for invalid snapshot", () => {
  const base = {
    nextId: 1,
    selectedWidgetId: "w1",
    ui: { home: { pageCount: 1, activePage: 0 } },
    presets: [],
    instances: [{ id: "w1" }]
  };

  const materialized = materializeHistorySnapshotRuntime(null, createDeps(base));
  assert.deepEqual(materialized, base);
});

test("materializeHistorySnapshotRuntime merges history snapshot and normalizes fields", () => {
  const base = {
    nextId: 1,
    selectedWidgetId: "w2",
    ui: {
      theme: { primary: "#111" },
      background: { mode: "solid", overlayOpacity: 0.2 },
      home: { pageCount: 2, activePage: 1 },
      widgetCommonMaster: { surfaceMode: "normal" },
      shortcuts: { iconSizePercent: 100 },
      monday: { timezone: "Asia/Seoul" },
      defaultProfileSnapshot: { id: "default" },
      defaultProfileUpdatedAt: 10
    },
    presets: [{ id: "old" }],
    instances: [{ id: "w2" }]
  };

  const historySnapshot = {
    nextId: 9,
    ui: {
      theme: { primary: "#ABC" },
      background: { mode: "wallpaper", overlayOpacity: 0.6 },
      home: { pageCount: 4, dockEnabled: true },
      widgetCommonMaster: { surfaceMode: "transparent" },
      shortcuts: { iconSizePercent: 150 },
      monday: { timezone: "UTC" },
      defaultProfileSnapshot: null,
      defaultProfileUpdatedAt: -50
    },
    presets: [{ id: "new" }],
    instances: [{ id: "w9" }]
  };

  const materialized = materializeHistorySnapshotRuntime(historySnapshot, createDeps(base));

  assert.equal(materialized.nextId, 9);
  assert.deepEqual(materialized.ui.theme, { primary: "#ABC" });
  assert.deepEqual(materialized.ui.background, { mode: "wallpaper", overlayOpacity: 0.6 });
  assert.deepEqual(materialized.ui.home, { pageCount: 4, activePage: 1, dockEnabled: true });
  assert.deepEqual(materialized.ui.widgetCommonMaster, { surfaceMode: "transparent" });
  assert.deepEqual(materialized.ui.shortcuts, { iconSizePercent: 150 });
  assert.deepEqual(materialized.ui.monday, { timezone: "UTC", normalized: true });
  assert.equal(materialized.ui.defaultProfileSnapshot, null);
  assert.equal(materialized.ui.defaultProfileUpdatedAt, 0);
  assert.deepEqual(materialized.presets, [{ id: "new" }]);
  assert.deepEqual(materialized.instances, [{ id: "w9" }]);
  assert.equal(materialized.selectedWidgetId, "");
});
