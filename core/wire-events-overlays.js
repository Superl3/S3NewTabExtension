export function wireOverlayControlEvents({
  elements,
  modalState,
  getLastDragEndAt,
  closeWidgetModal,
  closeWidgetTitleRenameModal,
  applyWidgetTitleRenameModal,
  closeDockSettingsModal,
  applyDockSettingsModal,
  resetDockSettingsDraftToDefault,
  applyWidgetModal,
  closeShortcutIconEditor,
  applyShortcutIconEditor,
  resetShortcutIconEditorSource,
  shortcutEditorRefreshPreview,
  shortcutIconEditorState,
  normalizeText,
  loadImageIntoShortcutEditor
} = {}) {
  if (!elements || !modalState) {
    return;
  }

  const applyAndClose = (applyAction, closeAction) => {
    const applied = applyAction?.();
    if (applied === false) {
      return false;
    }
    closeAction?.();
    return true;
  };

  elements.widgetModalCloseBtn?.addEventListener("click", () => {
    closeWidgetModal?.(false);
  });

  elements.widgetTitleRenameCloseBtn?.addEventListener("click", () => {
    closeWidgetTitleRenameModal?.();
  });

  elements.widgetTitleRenameCancelBtn?.addEventListener("click", () => {
    closeWidgetTitleRenameModal?.();
  });

  elements.widgetTitleRenameOkBtn?.addEventListener("click", () => {
    applyAndClose(applyWidgetTitleRenameModal, closeWidgetTitleRenameModal);
  });

  elements.widgetTitleRenameOverlay?.addEventListener("pointerdown", (event) => {
    if (event.target === elements.widgetTitleRenameOverlay) {
      closeWidgetTitleRenameModal?.();
    }
  });

  elements.dockSettingsModalCloseBtn?.addEventListener("click", () => {
    closeDockSettingsModal?.(false);
  });

  elements.dockSettingsModalCancelBtn?.addEventListener("click", () => {
    closeDockSettingsModal?.(false);
  });

  elements.dockSettingsModalOkBtn?.addEventListener("click", () => {
    applyAndClose(applyDockSettingsModal, () => {
      closeDockSettingsModal?.(false);
    });
  });

  elements.dockSettingsModalDefaultBtn?.addEventListener("click", () => {
    resetDockSettingsDraftToDefault?.();
  });

  elements.dockSettingsModalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.dockSettingsModalOverlay) {
      closeDockSettingsModal?.(false);
    }
  });

  elements.widgetModalCancelBtn?.addEventListener("click", () => {
    closeWidgetModal?.(false);
  });

  elements.widgetModalOkBtn?.addEventListener("click", () => {
    applyAndClose(applyWidgetModal, () => {
      closeWidgetModal?.(false);
    });
  });

  elements.shortcutIconEditorCloseBtn?.addEventListener("click", () => {
    closeShortcutIconEditor?.();
  });

  elements.shortcutIconEditorCancelBtn?.addEventListener("click", () => {
    closeShortcutIconEditor?.();
  });

  elements.shortcutIconEditorApplyBtn?.addEventListener("click", () => {
    applyAndClose(applyShortcutIconEditor, closeShortcutIconEditor);
  });

  elements.shortcutIconEditorClearBtn?.addEventListener("click", () => {
    resetShortcutIconEditorSource?.();
  });

  elements.shortcutIconEditorShape?.addEventListener("change", () => {
    shortcutEditorRefreshPreview?.();
  });

  elements.shortcutIconEditorScale?.addEventListener("input", () => {
    shortcutEditorRefreshPreview?.();
  });

  elements.shortcutIconEditorText?.addEventListener("input", () => {
    shortcutIconEditorState.source = normalizeText?.(elements.shortcutIconEditorText?.value) ? "text" : "preset";
    shortcutEditorRefreshPreview?.();
  });

  elements.shortcutIconEditorFontSize?.addEventListener("input", () => {
    if (normalizeText?.(elements.shortcutIconEditorText?.value)) {
      shortcutIconEditorState.source = "text";
    }
    shortcutEditorRefreshPreview?.();
  });

  elements.shortcutIconEditorImportBtn?.addEventListener("click", () => {
    elements.shortcutIconEditorFile?.click();
  });

  elements.shortcutIconEditorFile?.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) {
      return;
    }
    loadImageIntoShortcutEditor?.(input.files[0]);
    input.value = "";
  });

  elements.shortcutIconEditorOverlay?.addEventListener("pointerdown", (event) => {
    if (event.target === elements.shortcutIconEditorOverlay) {
      closeShortcutIconEditor?.();
    }
  });

  elements.widgetModalOverlay?.addEventListener("pointerdown", (event) => {
    modalState.dismissPointerId = event.pointerId;
    modalState.dismissStartX = event.clientX;
    modalState.dismissStartY = event.clientY;
    modalState.dismissMoved = false;
    modalState.dismissStartedOnOverlay = event.target === elements.widgetModalOverlay;
  });

  elements.widgetModalOverlay?.addEventListener("pointermove", (event) => {
    if (event.pointerId !== modalState.dismissPointerId) {
      return;
    }
    const dx = event.clientX - modalState.dismissStartX;
    const dy = event.clientY - modalState.dismissStartY;
    if (Math.hypot(dx, dy) > 7) {
      modalState.dismissMoved = true;
    }
  });

  elements.widgetModalOverlay?.addEventListener("pointerup", (event) => {
    if (event.pointerId !== modalState.dismissPointerId) {
      return;
    }

    const endedOnOverlay = event.target === elements.widgetModalOverlay;
    const enoughTimeSinceDrag = Date.now() - Number(getLastDragEndAt?.()) > 240;
    const shouldClose =
      modalState.dismissStartedOnOverlay && endedOnOverlay && !modalState.dismissMoved && enoughTimeSinceDrag;

    modalState.dismissPointerId = null;
    modalState.dismissMoved = false;
    modalState.dismissStartedOnOverlay = false;

    if (shouldClose) {
      closeWidgetModal?.(false);
    }
  });

  elements.widgetModalOverlay?.addEventListener("pointercancel", () => {
    modalState.dismissPointerId = null;
    modalState.dismissMoved = false;
    modalState.dismissStartedOnOverlay = false;
  });
}
