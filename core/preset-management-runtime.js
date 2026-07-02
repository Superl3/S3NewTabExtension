import { clampTruthyNumberOrFallback, toTruthyNumberOrFallback } from "./utils/number.js";

export function createPresetManagementRuntime(deps) {
  function clonePresetSnapshot(snapshot) {
    const cloned = {
      ui: {
        theme: { ...(snapshot?.ui?.theme || {}) },
        background: { ...(snapshot?.ui?.background || {}) },
        home: { ...(snapshot?.ui?.home || {}) },
        widgetCommonMaster: { ...(snapshot?.ui?.widgetCommonMaster || {}) },
        shortcuts: { ...(snapshot?.ui?.shortcuts || {}) },
        monday: { ...(snapshot?.ui?.monday || {}) }
      },
      instances: Array.isArray(snapshot?.instances)
        ? snapshot.instances.map((instance) => ({ ...instance, config: { ...(instance.config || {}) } }))
        : []
    };

    deps.applyRuntimeOnlyPolicyToPresetSnapshot(cloned);
    return cloned;
  }

  function createStateSnapshot() {
    const state = deps.getState();
    return {
      ui: {
        theme: deps.structuredClone(state.ui.theme),
        background: deps.structuredClone(state.ui.background),
        home: deps.structuredClone(state.ui.home),
        widgetCommonMaster: deps.structuredClone(state.ui.widgetCommonMaster),
        shortcuts: deps.structuredClone(state.ui.shortcuts),
        monday: deps.structuredClone(state.ui.monday)
      },
      instances: state.instances.map((instance) => ({
        ...deps.structuredClone(instance),
        zIndex: clampTruthyNumberOrFallback(instance.zIndex, 1, 1, Number.POSITIVE_INFINITY),
        surfaceMode: deps.normalizeSurfaceMode(instance.surfaceMode, "normal"),
        edgeRoundness: deps.normalizeEdgeRoundness(instance.edgeRoundness, 12),
        titleAlign: deps.normalizeTitleAlign(instance.titleAlign, deps.defaultWidgetTitleAlign()),
        contentAlignY: deps.normalizeAlign(instance.contentAlignY, deps.defaultWidgetContentAlign(instance.type)),
        transparency: deps.normalizeTransparency(instance.transparency, 0.94)
      }))
    };
  }

  function inferNextId(instances, fallback) {
    let maxId = toTruthyNumberOrFallback(fallback, 100);
    for (const instance of instances || []) {
      const id = String(instance?.id || "");
      const match = id.match(/-(\d+)$/);
      if (!match) {
        continue;
      }
      const num = Number(match[1]);
      if (Number.isFinite(num)) {
        maxId = Math.max(maxId, num + 1);
      }
    }
    return maxId;
  }

  function savePreset(nameInput) {
    const state = deps.getState();
    deps.recordHistorySnapshot("Save preset");
    const name = deps.normalizeText(nameInput, "Preset");
    const now = Date.now();
    const snapshot = createStateSnapshot();
    const byName = state.presets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());

    if (byName) {
      byName.snapshot = clonePresetSnapshot(snapshot);
      byName.updatedAt = now;
    } else {
      state.presets.push({
        id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
        name,
        createdAt: now,
        updatedAt: now,
        snapshot: clonePresetSnapshot(snapshot)
      });
    }

    state.presets.sort((a, b) => b.updatedAt - a.updatedAt);
    deps.renderSettings();
    deps.queueSave();
  }

  function loadPresetById(presetId, scope = "all") {
    const state = deps.getState();
    deps.recordHistorySnapshot("Load preset");
    const preset = state.presets.find((entry) => entry.id === presetId);
    if (!preset) {
      return;
    }
    deps.applyProfileSnapshot(preset.snapshot, scope);
  }

  function saveCurrentAsDefaultProfile() {
    const state = deps.getState();
    deps.recordHistorySnapshot("Set default profile");
    state.ui.defaultProfileSnapshot = clonePresetSnapshot(createStateSnapshot());
    state.ui.defaultProfileUpdatedAt = Date.now();
    deps.renderSettings();
    deps.queueSave();
  }

  function loadDefaultProfile(scope = "all") {
    const state = deps.getState();
    const snapshot = state?.ui?.defaultProfileSnapshot;
    if (!snapshot || typeof snapshot !== "object") {
      return;
    }
    deps.recordHistorySnapshot("Load default profile");
    deps.applyProfileSnapshot(snapshot, scope);
  }

  function clearDefaultProfile() {
    const state = deps.getState();
    if (!state?.ui?.defaultProfileSnapshot) {
      return;
    }
    deps.recordHistorySnapshot("Clear default profile");
    state.ui.defaultProfileSnapshot = null;
    state.ui.defaultProfileUpdatedAt = 0;
    deps.renderSettings();
    deps.queueSave();
  }

  function deletePresetById(presetId) {
    const state = deps.getState();
    deps.recordHistorySnapshot("Delete preset");
    const index = state.presets.findIndex((entry) => entry.id === presetId);
    if (index < 0) {
      return;
    }
    state.presets.splice(index, 1);
    deps.renderSettings();
    deps.queueSave();
  }

  return {
    clonePresetSnapshot,
    createStateSnapshot,
    inferNextId,
    savePreset,
    loadPresetById,
    saveCurrentAsDefaultProfile,
    loadDefaultProfile,
    clearDefaultProfile,
    deletePresetById
  };
}
