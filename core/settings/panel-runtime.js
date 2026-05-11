export function createSettingsPanelRuntime({
  state,
  elements,
  documentObj,
  getOpen,
  setOpen,
  syncPersistentDock,
  renderSettings
} = {}) {
  const resolveActiveTab = (value) => {
    if (value === "background" || value === "profile") {
      return value;
    }
    return "global";
  };

  function syncSettingsPanelVisibility() {
    const open = Boolean(state?.mode === "edit" && getOpen?.());
    documentObj?.body?.classList?.toggle?.("settings-open", open);
    elements?.settingsRailToggleBtn?.setAttribute?.("aria-expanded", String(open));
    elements?.settingsPanel?.setAttribute?.("aria-hidden", String(!open));
    if (elements?.settingsRailToggleBtn) {
      elements.settingsRailToggleBtn.title = open ? "Close settings" : "Open settings";
    }
    syncPersistentDock?.();
    return open;
  }

  function syncSettingsTabButtons() {
    const active = resolveActiveTab(state?.ui?.activeTab);
    const tabs = [
      ["global", elements?.tabGlobalBtn],
      ["background", elements?.tabBackgroundBtn],
      ["profile", elements?.tabProfileBtn]
    ];

    for (const [tab, button] of tabs) {
      const on = active === tab;
      button?.classList?.toggle?.("active", on);
      button?.setAttribute?.("aria-selected", String(on));
    }

    return active;
  }

  function setActiveSettingsTab(nextTab, { shouldRender = true } = {}) {
    if (!state?.ui) {
      return "global";
    }
    const active = resolveActiveTab(nextTab);
    state.ui.activeTab = active;
    if (shouldRender) {
      renderSettings?.();
    }
    return active;
  }

  function closeSettingsPanel() {
    setOpen?.(false);
    syncSettingsPanelVisibility();
    return false;
  }

  function toggleSettingsPanel() {
    if (state?.mode !== "edit") {
      return Boolean(getOpen?.());
    }
    const nextOpen = !Boolean(getOpen?.());
    setOpen?.(nextOpen);
    syncSettingsPanelVisibility();
    if (nextOpen) {
      renderSettings?.();
    }
    return nextOpen;
  }

  return {
    resolveActiveTab,
    syncSettingsPanelVisibility,
    syncSettingsTabButtons,
    setActiveSettingsTab,
    closeSettingsPanel,
    toggleSettingsPanel
  };
}
