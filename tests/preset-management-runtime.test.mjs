import test from "node:test";
import assert from "node:assert/strict";

import { createPresetManagementRuntime } from "../core/preset-management-runtime.js";

function createHarness(overrides = {}) {
  const state = {
    ui: {
      theme: { fontFamily: "Segoe UI" },
      background: { mode: "wallpaper" },
      home: { mode: "free" },
      widgetCommonMaster: {},
      shortcuts: {},
      monday: {},
      defaultProfileSnapshot: null,
      defaultProfileUpdatedAt: 0
    },
    instances: [
      {
        id: "clock-1",
        type: "clock",
        zIndex: 1,
        surfaceMode: "normal",
        edgeRoundness: 12,
        titleAlign: "left",
        contentAlignY: "center",
        transparency: 0.94,
        config: { a: 1 }
      }
    ],
    presets: []
  };

  const calls = {
    history: [],
    renderSettings: 0,
    save: 0,
    applyProfileSnapshot: []
  };

  const runtime = createPresetManagementRuntime({
    getState: () => state,
    applyRuntimeOnlyPolicyToPresetSnapshot: () => {},
    structuredClone,
    normalizeSurfaceMode: (value, fallback) => value || fallback,
    normalizeEdgeRoundness: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    normalizeTitleAlign: (value, fallback) => value || fallback,
    defaultWidgetTitleAlign: () => "left",
    normalizeAlign: (value, fallback) => value || fallback,
    defaultWidgetContentAlign: () => "center",
    normalizeTransparency: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    normalizeText: (value, fallback = "") => {
      const text = String(value || "").trim();
      return text || fallback;
    },
    recordHistorySnapshot: (label) => {
      calls.history.push(label);
    },
    renderSettings: () => {
      calls.renderSettings += 1;
    },
    queueSave: () => {
      calls.save += 1;
    },
    applyProfileSnapshot: (snapshot, scope) => {
      calls.applyProfileSnapshot.push({ snapshot, scope });
    },
    ...overrides
  });

  return {
    state,
    calls,
    runtime
  };
}

test("inferNextId computes next numeric suffix", () => {
  const harness = createHarness();
  const next = harness.runtime.inferNextId([{ id: "clock-9" }, { id: "todo-12" }, { id: "x" }], 100);
  assert.equal(next, 100);

  const nextFromLow = harness.runtime.inferNextId([{ id: "clock-9" }, { id: "todo-12" }], 1);
  assert.equal(nextFromLow, 13);
});

test("inferNextId preserves fallback normalization semantics", () => {
  const harness = createHarness();
  assert.equal(harness.runtime.inferNextId([], 0), 100);
  assert.equal(harness.runtime.inferNextId([], "bad"), 100);
  assert.equal(harness.runtime.inferNextId([{ id: "clock-9" }], Infinity), Infinity);
});

test("savePreset creates and updates same-name preset", () => {
  const harness = createHarness();
  harness.state.instances[0].zIndex = -10;

  harness.runtime.savePreset("My Preset");
  assert.equal(harness.state.presets.length, 1);
  assert.equal(harness.state.presets[0].name, "My Preset");
  assert.equal(harness.state.presets[0].snapshot.instances[0].zIndex, 1);

  const firstId = harness.state.presets[0].id;
  harness.state.instances[0].zIndex = Number.POSITIVE_INFINITY;
  harness.runtime.savePreset("my preset");
  assert.equal(harness.state.presets.length, 1);
  assert.equal(harness.state.presets[0].id, firstId);
  assert.equal(harness.state.presets[0].snapshot.instances[0].zIndex, Number.POSITIVE_INFINITY);

  assert.deepEqual(harness.calls.history, ["Save preset", "Save preset"]);
  assert.equal(harness.calls.renderSettings, 2);
  assert.equal(harness.calls.save, 2);
});

test("load/save/clear default profile flows update state", () => {
  const harness = createHarness();

  harness.runtime.saveCurrentAsDefaultProfile();
  assert.ok(harness.state.ui.defaultProfileSnapshot);
  assert.ok(harness.state.ui.defaultProfileUpdatedAt > 0);

  harness.runtime.loadDefaultProfile("background");
  assert.equal(harness.calls.applyProfileSnapshot.length, 1);
  assert.equal(harness.calls.applyProfileSnapshot[0].scope, "background");

  harness.runtime.clearDefaultProfile();
  assert.equal(harness.state.ui.defaultProfileSnapshot, null);
  assert.equal(harness.state.ui.defaultProfileUpdatedAt, 0);
});

test("loadPresetById and deletePresetById route actions", () => {
  const harness = createHarness();
  harness.state.presets = [
    { id: "p1", name: "One", updatedAt: 1, snapshot: { ui: {}, instances: [] } },
    { id: "p2", name: "Two", updatedAt: 2, snapshot: { ui: {}, instances: [] } }
  ];

  harness.runtime.loadPresetById("p2", "all");
  assert.equal(harness.calls.applyProfileSnapshot.length, 1);
  assert.equal(harness.calls.applyProfileSnapshot[0].scope, "all");

  harness.runtime.deletePresetById("p1");
  assert.deepEqual(harness.state.presets.map((preset) => preset.id), ["p2"]);
});
