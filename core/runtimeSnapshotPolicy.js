import { hasOwn, isPlainObject } from "./utils/object.js";

const RUNTIME_ONLY_WIDGET_CONFIG_DEFAULTS = Object.freeze({
  container: Object.freeze({
    expanded: false
  }),
  mondayAssigned: Object.freeze({
    autoRefreshDayKey: "",
    autoRefreshSlotsDone: ""
  }),
  mondayMeetingNote: Object.freeze({
    autoRefreshDayKey: "",
    autoRefreshSlotsDone: ""
  })
});

function runtimeOnlyWidgetConfigDefaults(widgetType) {
  return RUNTIME_ONLY_WIDGET_CONFIG_DEFAULTS[widgetType] || null;
}

function cloneRuntimeDefaultValue(value) {
  return value && typeof value === "object" ? structuredClone(value) : value;
}

export function applyRuntimeOnlyWidgetConfigDefaults(widgetType, config) {
  const defaults = runtimeOnlyWidgetConfigDefaults(widgetType);
  if (!defaults || !isPlainObject(config)) {
    return config;
  }

  for (const [key, value] of Object.entries(defaults)) {
    config[key] = cloneRuntimeDefaultValue(value);
  }

  return config;
}

export function stripRuntimeOnlyWidgetConfigFields(widgetType, config) {
  const defaults = runtimeOnlyWidgetConfigDefaults(widgetType);
  if (!defaults || !isPlainObject(config)) {
    return config;
  }

  for (const key of Object.keys(defaults)) {
    if (hasOwn(config, key)) {
      delete config[key];
    }
  }

  return config;
}

export function buildPersistableWidgetConfigPatch(widgetType, patch) {
  if (!isPlainObject(patch)) {
    return {};
  }

  const persistablePatch = { ...patch };
  stripRuntimeOnlyWidgetConfigFields(widgetType, persistablePatch);
  return persistablePatch;
}

export function applyRuntimeOnlyPolicyToPresetSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return snapshot;
  }

  if (isPlainObject(snapshot.ui)) {
    if (isPlainObject(snapshot.ui.home)) {
      snapshot.ui.home.activePage = 0;
    }
  }

  if (Array.isArray(snapshot.instances)) {
    for (const instance of snapshot.instances) {
      if (!isPlainObject(instance)) {
        continue;
      }
      if (!isPlainObject(instance.config)) {
        continue;
      }
      stripRuntimeOnlyWidgetConfigFields(instance.type, instance.config);
    }
  }

  return snapshot;
}

export function applyRuntimeOnlyPolicyToSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return snapshot;
  }

  snapshot.mode = "use";
  snapshot.selectedWidgetId = "";

  if (isPlainObject(snapshot.ui)) {
    snapshot.ui.activeTab = "global";
    if (hasOwn(snapshot.ui, "settingsOpen")) {
      delete snapshot.ui.settingsOpen;
    }
    if (isPlainObject(snapshot.ui.home)) {
      snapshot.ui.home.activePage = 0;
    }
    if (isPlainObject(snapshot.ui.defaultProfileSnapshot)) {
      applyRuntimeOnlyPolicyToPresetSnapshot(snapshot.ui.defaultProfileSnapshot);
    }
  }

  if (Array.isArray(snapshot.presets)) {
    for (const preset of snapshot.presets) {
      if (!isPlainObject(preset)) {
        continue;
      }
      if (!isPlainObject(preset.snapshot)) {
        continue;
      }
      applyRuntimeOnlyPolicyToPresetSnapshot(preset.snapshot);
    }
  }

  if (Array.isArray(snapshot.instances)) {
    for (const instance of snapshot.instances) {
      if (!isPlainObject(instance)) {
        continue;
      }
      if (!isPlainObject(instance.config)) {
        continue;
      }
      stripRuntimeOnlyWidgetConfigFields(instance.type, instance.config);
    }
  }

  return snapshot;
}
