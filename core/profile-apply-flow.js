export function applyProfileSnapshotFlow(snapshotInput, scope = "all", deps) {
  const applyGlobal = scope === "all" || scope === "global";
  const applyBackgroundOnly = scope === "all" || scope === "background";
  const applyWidgets = scope === "all" || scope === "widgets";

  const state = deps.state;
  const snapshot = deps.clonePresetSnapshot(snapshotInput);
  const hydrated = deps.hydrate({
    ...state,
    ui: {
      activeTab: state.ui.activeTab,
      theme: {
        ...state.ui.theme,
        ...(applyGlobal ? snapshot.ui?.theme || {} : {})
      },
      background: {
        ...state.ui.background,
        ...(applyBackgroundOnly ? snapshot.ui?.background || {} : {})
      },
      home: {
        ...state.ui.home,
        ...(applyGlobal ? snapshot.ui?.home || {} : {})
      },
      widgetCommonMaster: {
        ...state.ui.widgetCommonMaster,
        ...(applyGlobal ? snapshot.ui?.widgetCommonMaster || {} : {})
      },
      shortcuts: {
        ...state.ui.shortcuts,
        ...(applyGlobal ? snapshot.ui?.shortcuts || {} : {})
      },
      monday: {
        ...state.ui.monday,
        ...(applyGlobal ? snapshot.ui?.monday || {} : {})
      },
      defaultProfileSnapshot: state.ui.defaultProfileSnapshot,
      defaultProfileUpdatedAt: state.ui.defaultProfileUpdatedAt
    },
    instances:
      applyWidgets && Array.isArray(snapshot.instances) && snapshot.instances.length
        ? snapshot.instances
        : state.instances,
    presets: state.presets
  });

  state.ui.theme = hydrated.ui.theme;
  state.ui.background = hydrated.ui.background;
  state.ui.home = deps.normalizeHomeLayout(hydrated.ui.home);
  state.ui.widgetCommonMaster = deps.normalizeWidgetCommonMaster(hydrated.ui.widgetCommonMaster);
  state.ui.shortcuts = {
    iconSizePercent: deps.clamp(Number(hydrated.ui.shortcuts?.iconSizePercent) || 100, 40, 220)
  };
  state.ui.monday = deps.normalizeMondayGlobalSettings(hydrated.ui.monday);

  if (applyWidgets) {
    state.instances = hydrated.instances;
    state.selectedWidgetId = "";
    state.nextId = deps.inferNextId(state.instances, hydrated.nextId);
    for (const instance of state.instances) {
      deps.applyWidgetCommonMaster(instance, state.ui.widgetCommonMaster, false);
      if (!instance.commonOverrides || !Object.keys(instance.commonOverrides).length) {
        instance.commonOverrides = deps.inferCommonOverrides(instance, state.ui.widgetCommonMaster);
      }
    }
  }

  deps.syncLauncherPagingState({ expandToFitInstances: true });
  deps.closeWidgetModal(false);

  deps.applyTheme();
  deps.setBodyMode();
  deps.applyBackground();

  if (applyWidgets) {
    deps.renderBoard();
  } else {
    for (const instance of state.instances) {
      deps.applyWidgetCommonMaster(instance, state.ui.widgetCommonMaster, false);
      instance.commonOverrides = deps.inferCommonOverrides(instance, state.ui.widgetCommonMaster);
      const rt = deps.runtimeMap.get(instance.id);
      if (rt?.card) {
        deps.applyCardVisual(rt.card, instance);
      }
    }
    deps.refreshAllWidgets();
    if (state.ui.home.mode === "grid") {
      deps.applyGridLayout({ commitFreeLayout: false });
    } else {
      deps.updateBoardBounds();
    }
  }

  deps.renderSettings();
  deps.queueSave();
}
