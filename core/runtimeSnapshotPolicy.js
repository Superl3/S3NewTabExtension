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
  if (!defaults || !config || typeof config !== "object" || Array.isArray(config)) {
    return config;
  }

  for (const [key, value] of Object.entries(defaults)) {
    config[key] = cloneRuntimeDefaultValue(value);
  }

  return config;
}

export function stripRuntimeOnlyWidgetConfigFields(widgetType, config) {
  const defaults = runtimeOnlyWidgetConfigDefaults(widgetType);
  if (!defaults || !config || typeof config !== "object" || Array.isArray(config)) {
    return config;
  }

  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      delete config[key];
    }
  }

  return config;
}

export function buildPersistableWidgetConfigPatch(widgetType, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {};
  }

  const persistablePatch = { ...patch };
  stripRuntimeOnlyWidgetConfigFields(widgetType, persistablePatch);
  return persistablePatch;
}

export function applyRuntimeOnlyPolicyToPresetSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return snapshot;
  }

  if (snapshot.ui && typeof snapshot.ui === "object" && !Array.isArray(snapshot.ui)) {
    if (snapshot.ui.home && typeof snapshot.ui.home === "object" && !Array.isArray(snapshot.ui.home)) {
      snapshot.ui.home.activePage = 0;
    }
  }

  if (Array.isArray(snapshot.instances)) {
    for (const instance of snapshot.instances) {
      if (!instance || typeof instance !== "object" || Array.isArray(instance)) {
        continue;
      }
      if (!instance.config || typeof instance.config !== "object" || Array.isArray(instance.config)) {
        continue;
      }
      stripRuntimeOnlyWidgetConfigFields(instance.type, instance.config);
    }
  }

  return snapshot;
}

export function applyRuntimeOnlyPolicyToSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return snapshot;
  }

  snapshot.mode = "use";
  snapshot.selectedWidgetId = "";

  if (snapshot.ui && typeof snapshot.ui === "object" && !Array.isArray(snapshot.ui)) {
    snapshot.ui.activeTab = "global";
    if (Object.prototype.hasOwnProperty.call(snapshot.ui, "settingsOpen")) {
      delete snapshot.ui.settingsOpen;
    }
    if (snapshot.ui.home && typeof snapshot.ui.home === "object" && !Array.isArray(snapshot.ui.home)) {
      snapshot.ui.home.activePage = 0;
    }
    if (
      snapshot.ui.defaultProfileSnapshot &&
      typeof snapshot.ui.defaultProfileSnapshot === "object" &&
      !Array.isArray(snapshot.ui.defaultProfileSnapshot)
    ) {
      applyRuntimeOnlyPolicyToPresetSnapshot(snapshot.ui.defaultProfileSnapshot);
    }
  }

  if (Array.isArray(snapshot.presets)) {
    for (const preset of snapshot.presets) {
      if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
        continue;
      }
      if (!preset.snapshot || typeof preset.snapshot !== "object" || Array.isArray(preset.snapshot)) {
        continue;
      }
      applyRuntimeOnlyPolicyToPresetSnapshot(preset.snapshot);
    }
  }

  if (Array.isArray(snapshot.instances)) {
    for (const instance of snapshot.instances) {
      if (!instance || typeof instance !== "object" || Array.isArray(instance)) {
        continue;
      }
      if (!instance.config || typeof instance.config !== "object" || Array.isArray(instance.config)) {
        continue;
      }
      stripRuntimeOnlyWidgetConfigFields(instance.type, instance.config);
    }
  }

  return snapshot;
}
