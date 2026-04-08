export function wireSettingsAndModeEvents({
  elements,
  state,
  getState,
  toggleSettingsPanel,
  closeSettingsPanel,
  getRuntimeSettingsPanelOpen,
  setRuntimeSettingsPanelOpen,
  syncSettingsPanelVisibility,
  refreshBackgroundNow,
  currentLauncherPageCount,
  currentLauncherViewportPage,
  isPlaceholderLauncherPage,
  setActiveLauncherPage,
  currentLauncherActivePage,
  compactEmptyLauncherPagesForUseMode,
  setBodyMode,
  setSelected,
  refreshAllWidgets,
  updateBoardBounds,
  requestAnimationFrameFn,
  setTimeoutFn,
  boardPageTransitionMs,
  resolveHomeAnchorTargetPage,
  showAddWidgetToast,
  setLauncherHomePage
} = {}) {
  if (!elements || (!state && !getState)) {
    return;
  }

  const resolveState = () => getState?.() || state || null;

  elements.settingsRailToggleBtn?.addEventListener("click", () => {
    const currentState = resolveState();
    if (currentState?.mode !== "edit") {
      return;
    }
    if (toggleSettingsPanel) {
      toggleSettingsPanel();
      return;
    }
    const nextOpen = !Boolean(getRuntimeSettingsPanelOpen?.());
    setRuntimeSettingsPanelOpen?.(nextOpen);
    syncSettingsPanelVisibility?.();
  });

  elements.settingsPanelBackdrop?.addEventListener("click", () => {
    if (!getRuntimeSettingsPanelOpen?.()) {
      return;
    }
    if (closeSettingsPanel) {
      closeSettingsPanel();
      return;
    }
    setRuntimeSettingsPanelOpen?.(false);
    syncSettingsPanelVisibility?.();
  });

  elements.bgRefreshBtn?.addEventListener("click", () => {
    refreshBackgroundNow?.();
  });

  elements.modeToggleBtn?.addEventListener("click", () => {
    const currentState = resolveState();
    if (!currentState) {
      return;
    }

    const nextMode = currentState.mode === "edit" ? "use" : "edit";
    let deferBoundsSync = false;

    if (currentState.mode === "edit" && nextMode === "use") {
      const pageCount = currentLauncherPageCount?.();
      const viewportPage = currentLauncherViewportPage?.();
      if (isPlaceholderLauncherPage?.(viewportPage, pageCount)) {
        setActiveLauncherPage?.(currentLauncherActivePage?.(), { animate: true });
        deferBoundsSync = true;
      }
    }

    currentState.mode = nextMode;
    if (currentState.mode === "use") {
      currentState.selectedWidgetId = "";
      compactEmptyLauncherPagesForUseMode?.();
    }
    setBodyMode?.();
    setSelected?.(currentState.selectedWidgetId);
    refreshAllWidgets?.();

    const syncBounds = () => {
      updateBoardBounds?.();
      requestAnimationFrameFn?.(() => {
        updateBoardBounds?.();
      });
    };

    if (deferBoundsSync) {
      setTimeoutFn?.(syncBounds, boardPageTransitionMs + 20);
    } else {
      syncBounds();
    }
  });

  elements.homePageAnchorBtn?.addEventListener("click", () => {
    const currentState = resolveState();
    if (currentState?.mode !== "edit") {
      return;
    }
    const targetPage = resolveHomeAnchorTargetPage?.();
    if (!Number.isFinite(targetPage)) {
      showAddWidgetToast?.("실제 페이지에서만 홈 화면으로 지정할 수 있어요.");
      return;
    }
    setLauncherHomePage?.(targetPage);
  });
}
