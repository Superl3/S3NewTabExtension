export function createWidgetTitleRenameRuntime({
  elements,
  widgetTitleRenameState,
  modalState,
  getAddWidgetModalOpen,
  isDockSettingsModalOpen,
  shortcutIconEditorState,
  instanceById,
  widgetRegistry,
  normalizeText,
  setModalInteractionLock,
  blurFocusedElementInOverlay,
  recordHistorySnapshot,
  runtime,
  renderWidgetModal,
  isWidgetInContainer,
  refreshWidgetsByType,
  isWidgetDocked,
  renderDockWidgets,
  renderSettings,
  queueSave,
  requestAnimationFrameFn
} = {}) {
  function openWidgetTitleRenameModal(instanceId) {
    const instance = instanceById?.(instanceId);
    if (!instance || !elements?.widgetTitleRenameOverlay || !elements?.widgetTitleRenameInput) {
      return;
    }

    if (modalState?.open || getAddWidgetModalOpen?.() || isDockSettingsModalOpen?.() || shortcutIconEditorState?.open) {
      return;
    }

    const def = widgetRegistry?.[instance.type];
    const fallbackTitle = def?.title || "Widget";

    widgetTitleRenameState.open = true;
    widgetTitleRenameState.widgetId = instance.id;
    elements.widgetTitleRenameInput.value = instance.title || fallbackTitle;
    elements.widgetTitleRenameOverlay.classList?.add?.("open");
    elements.widgetTitleRenameOverlay.setAttribute?.("aria-hidden", "false");
    setModalInteractionLock?.(true);

    requestAnimationFrameFn?.(() => {
      elements.widgetTitleRenameInput?.focus?.();
      elements.widgetTitleRenameInput?.select?.();
    });
  }

  function closeWidgetTitleRenameModal() {
    if (!widgetTitleRenameState?.open) {
      return;
    }

    widgetTitleRenameState.open = false;
    widgetTitleRenameState.widgetId = "";
    blurFocusedElementInOverlay?.(elements?.widgetTitleRenameOverlay);
    elements?.widgetTitleRenameOverlay?.classList?.remove?.("open");
    elements?.widgetTitleRenameOverlay?.setAttribute?.("aria-hidden", "true");

    if (!modalState?.open && !getAddWidgetModalOpen?.() && !shortcutIconEditorState?.open && !isDockSettingsModalOpen?.()) {
      setModalInteractionLock?.(false);
    }
  }

  function applyWidgetTitleRenameModal() {
    if (!widgetTitleRenameState?.open || !widgetTitleRenameState.widgetId) {
      return false;
    }

    const instance = instanceById?.(widgetTitleRenameState.widgetId);
    if (!instance) {
      closeWidgetTitleRenameModal();
      return true;
    }

    const def = widgetRegistry?.[instance.type];
    const fallbackTitle = def?.title || "Widget";
    const nextTitle = normalizeText?.(elements?.widgetTitleRenameInput?.value, fallbackTitle);
    if (instance.title === nextTitle) {
      closeWidgetTitleRenameModal();
      return true;
    }

    recordHistorySnapshot?.("Rename widget title");
    instance.title = nextTitle;

    const rt = runtime?.get?.(instance.id);
    const titleEl = rt?.card?.querySelector?.(".widget-title");
    if (titleEl) {
      titleEl.textContent = nextTitle;
    }

    if (modalState?.open && modalState.widgetId === instance.id && modalState.draft) {
      modalState.draft.title = nextTitle;
      renderWidgetModal?.();
    }

    if (isWidgetInContainer?.(instance)) {
      refreshWidgetsByType?.("container");
    }
    if (isWidgetDocked?.(instance)) {
      renderDockWidgets?.();
    }

    renderSettings?.();
    queueSave?.();
    closeWidgetTitleRenameModal();
    return true;
  }

  return {
    openWidgetTitleRenameModal,
    closeWidgetTitleRenameModal,
    applyWidgetTitleRenameModal
  };
}
