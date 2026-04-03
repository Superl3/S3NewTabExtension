export function syncPersistentDockView({
  dock,
  dockSettingsBtn,
  dockWidgetStrip,
  dockUiState,
  config,
  isEditMode,
  dockSettingsModalOpen,
  clearWidgetDragGuideState,
  destroyDockEmbeddedControllers,
  syncDockContentPadding,
  renderDockWidgets,
  requestAnimationFrameFn
} = {}) {
  if (!dock) {
    syncDockContentPadding?.({ enabled: false, heightPx: 0 });
    return;
  }

  if (!config?.enabled) {
    clearWidgetDragGuideState?.();
    destroyDockEmbeddedControllers?.();
    dockWidgetStrip?.replaceChildren?.();
    if (dockUiState) {
      dockUiState.activeId = "";
    }
    dock.classList.add("is-disabled");
    dock.setAttribute("aria-hidden", "true");
    syncDockContentPadding?.(config);
    return;
  }

  dock.classList.remove("is-disabled");
  dock.setAttribute("aria-hidden", "false");
  dock.dataset.shape = config.shape;
  dock.dataset.visibility = config.visibility;
  dock.dataset.position = config.position;
  dock.style.setProperty("--dock-length-units", String(config.lengthUnits));
  dock.style.setProperty("--dock-unit-size", `${config.heightPx}px`);

  if (dockSettingsBtn) {
    const canEditDock = Boolean(isEditMode?.());
    const settingsTitle = canEditDock
      ? (dockSettingsModalOpen ? "Close dock settings" : "Open dock settings")
      : "Dock settings (Edit mode only)";
    dockSettingsBtn.title = settingsTitle;
    dockSettingsBtn.setAttribute("aria-label", settingsTitle);
    dockSettingsBtn.disabled = !canEditDock;
    dockSettingsBtn.tabIndex = canEditDock ? 0 : -1;
    dockSettingsBtn.classList.toggle("is-hidden", !canEditDock);
    dockSettingsBtn.classList.toggle("is-active", Boolean(dockSettingsModalOpen));
  }

  renderDockWidgets?.();
  syncDockContentPadding?.(config);
  requestAnimationFrameFn?.(() => {
    syncDockContentPadding?.(config);
  });
}
