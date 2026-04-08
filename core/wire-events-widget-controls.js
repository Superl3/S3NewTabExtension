export function wireWidgetControlEvents({
  elements,
  state,
  getState,
  isDockSettingsModalOpen,
  closeDockSettingsModal,
  openDockSettingsModal,
  onDockStripKeyDown,
  onDockStripWheel,
  syncDockOverflowState,
  renderSettings,
  setActiveSettingsTab,
  isAddWidgetModalOpen,
  syncAddWidgetSizeInputs,
  openAddWidgetModal,
  closeBoardContextMenu,
  setBodyMode,
  setSelected,
  refreshAllWidgets,
  updateBoardBounds,
  requestAnimationFrameFn,
  queueSave,
  closeAddWidgetModal,
  applyAddWidgetModal,
  windowConfirm,
  resetState,
  undoLastChange,
  redoLastChange
} = {}) {
  if (!elements || (!state && !getState)) {
    return;
  }

  const resolveState = () => getState?.() || state || null;

  elements.dockSettingsBtn?.addEventListener("click", () => {
    if (isDockSettingsModalOpen?.()) {
      closeDockSettingsModal?.(false);
      return;
    }
    openDockSettingsModal?.();
  });

  elements.dockWidgetStrip?.addEventListener("keydown", onDockStripKeyDown);
  elements.dockWidgetStrip?.addEventListener("wheel", onDockStripWheel, { passive: false });
  elements.dockWidgetStrip?.addEventListener(
    "scroll",
    () => {
      syncDockOverflowState?.();
    },
    { passive: true }
  );

  elements.tabGlobalBtn?.addEventListener("click", () => {
    if (setActiveSettingsTab) {
      setActiveSettingsTab("global");
      return;
    }
    const currentState = resolveState();
    if (!currentState?.ui) {
      return;
    }
    currentState.ui.activeTab = "global";
    renderSettings?.();
  });

  elements.tabBackgroundBtn?.addEventListener("click", () => {
    if (setActiveSettingsTab) {
      setActiveSettingsTab("background");
      return;
    }
    const currentState = resolveState();
    if (!currentState?.ui) {
      return;
    }
    currentState.ui.activeTab = "background";
    renderSettings?.();
  });

  elements.tabProfileBtn?.addEventListener("click", () => {
    if (setActiveSettingsTab) {
      setActiveSettingsTab("profile");
      return;
    }
    const currentState = resolveState();
    if (!currentState?.ui) {
      return;
    }
    currentState.ui.activeTab = "profile";
    renderSettings?.();
  });

  elements.widgetTypeSelect?.addEventListener("change", () => {
    if (!isAddWidgetModalOpen?.()) {
      return;
    }
    syncAddWidgetSizeInputs?.();
  });

  elements.addWidgetBtn?.addEventListener("click", () => {
    openAddWidgetModal?.();
  });

  elements.boardContextAddWidgetBtn?.addEventListener("click", () => {
    const currentState = resolveState();
    if (!currentState) {
      return;
    }

    closeBoardContextMenu?.();
    if (currentState.mode !== "edit") {
      currentState.mode = "edit";
      setBodyMode?.();
      setSelected?.(currentState.selectedWidgetId);
      refreshAllWidgets?.();
      updateBoardBounds?.();
      requestAnimationFrameFn?.(() => {
        updateBoardBounds?.();
      });
      queueSave?.();
    }
    openAddWidgetModal?.();
  });

  elements.addWidgetModalCloseBtn?.addEventListener("click", () => {
    closeAddWidgetModal?.();
  });

  elements.addWidgetModalCancelBtn?.addEventListener("click", () => {
    closeAddWidgetModal?.();
  });

  elements.addWidgetModalOkBtn?.addEventListener("click", () => {
    try {
      applyAddWidgetModal?.();
    } catch {
      // Swallow apply errors so close always runs.
    }
    closeAddWidgetModal?.();
  });

  elements.addWidgetModalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.addWidgetModalOverlay) {
      closeAddWidgetModal?.();
    }
  });

  elements.resetBtn?.addEventListener("click", () => {
    const currentState = resolveState();
    if (currentState?.mode !== "edit") {
      return;
    }
    const confirmed = windowConfirm?.("Reset layout, widget settings, and global theme/background to defaults?");
    if (!confirmed) {
      return;
    }
    void resetState?.();
  });

  elements.undoBtn?.addEventListener("click", () => {
    undoLastChange?.();
  });

  elements.redoBtn?.addEventListener("click", () => {
    redoLastChange?.();
  });
}
