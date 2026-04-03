export function wireSettingsAndModeEvents({
  elements,
  state,
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
  if (!elements || !state) {
    return;
  }

  elements.settingsRailToggleBtn?.addEventListener("click", () => {
    if (state.mode !== "edit") {
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
    setRuntimeSettingsPanelOpen?.(false);
    syncSettingsPanelVisibility?.();
  });

  elements.bgRefreshBtn?.addEventListener("click", () => {
    refreshBackgroundNow?.();
  });

  elements.modeToggleBtn?.addEventListener("click", () => {
    const nextMode = state.mode === "edit" ? "use" : "edit";
    let deferBoundsSync = false;

    if (state.mode === "edit" && nextMode === "use") {
      const pageCount = currentLauncherPageCount?.();
      const viewportPage = currentLauncherViewportPage?.();
      if (isPlaceholderLauncherPage?.(viewportPage, pageCount)) {
        setActiveLauncherPage?.(currentLauncherActivePage?.(), { animate: true });
        deferBoundsSync = true;
      }
    }

    state.mode = nextMode;
    if (state.mode === "use") {
      state.selectedWidgetId = "";
      compactEmptyLauncherPagesForUseMode?.();
    }
    setBodyMode?.();
    setSelected?.(state.selectedWidgetId);
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
    if (state.mode !== "edit") {
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
