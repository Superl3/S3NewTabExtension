export function wireWidgetControlEvents({
  elements,
  state,
  isDockSettingsModalOpen,
  closeDockSettingsModal,
  openDockSettingsModal,
  onDockStripKeyDown,
  onDockStripWheel,
  syncDockOverflowState,
  renderSettings,
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
  if (!elements || !state) {
    return;
  }

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
    state.ui.activeTab = "global";
    renderSettings?.();
  });

  elements.tabBackgroundBtn?.addEventListener("click", () => {
    state.ui.activeTab = "background";
    renderSettings?.();
  });

  elements.tabProfileBtn?.addEventListener("click", () => {
    state.ui.activeTab = "profile";
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
    closeBoardContextMenu?.();
    if (state.mode !== "edit") {
      state.mode = "edit";
      setBodyMode?.();
      setSelected?.(state.selectedWidgetId);
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
    applyAddWidgetModal?.();
  });

  elements.addWidgetModalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.addWidgetModalOverlay) {
      closeAddWidgetModal?.();
    }
  });

  elements.resetBtn?.addEventListener("click", () => {
    if (state.mode !== "edit") {
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
