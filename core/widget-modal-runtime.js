export function createWidgetModalRuntime({
  modalState,
  widgetTitleRenameState,
  shortcutIconEditorState,
  elements,
  state,
  instanceById,
  widgetRegistry,
  closeWidgetTitleRenameModal,
  buildWidgetModalDraft,
  currentLauncherPageCount,
  resolveWidgetPadding,
  getWidgetModalCommonFields,
  getWidgetModalSpecificFields,
  normalizeWidgetPage,
  normalizeSurfaceMode,
  normalizeTransparentGhostStrength,
  normalizeEdgeRoundness,
  normalizeTransparency,
  normalizeTitleAlign,
  defaultWidgetTitleAlign,
  normalizeAlign,
  defaultWidgetContentAlign,
  normalizeContentPadding,
  normalizeWidgetContentFontScale,
  normalizeWidgetThemeMode,
  normalizeWidgetColor,
  renderWidgetModalFields,
  setWidgetModalActiveTab,
  resetWidgetTabDraftToDefaults,
  resetCommonTabDraftToGlobal,
  setModalInteractionLock,
  blurFocusedElementInOverlay,
  renderSettings,
  closeShortcutIconEditor,
  resolveAveragePaddingValue,
  widgetPaddingFallback,
  recordHistorySnapshot,
  applyWidgetDraftToInstance,
  normalizeText,
  resolveDirectionalPaddingFromDraft,
  cloneLayout,
  normalizeContainerWidgetDraftConfig,
  normalizeContainerExpandedCols,
  normalizeContainerExpandedRows,
  enforceContainerWidgetSize,
  inferCommonOverrides,
  syncLauncherPagingState,
  syncWidgetStateAfterModalApply,
  refreshWidgetRuntimeAfterModalApply,
  runtimeMap,
  applyLayout,
  applyCardVisual,
  refreshWidgetsByType,
  isWidgetInContainer,
  updateBoardBounds,
  queueSave,
  documentObj = typeof document !== "undefined" ? document : null
} = {}) {
  const isHTMLElement = (value) => {
    if (typeof HTMLElement !== "undefined") {
      return value instanceof HTMLElement;
    }
    return Boolean(value && typeof value === "object");
  };

  const resolveModalInstance = () => {
    if (!modalState.widgetId) {
      return null;
    }
    return instanceById?.(modalState.widgetId) || null;
  };

  const resolveWidgetDefinition = (instance) => {
    if (!instance) {
      return null;
    }
    return widgetRegistry?.[instance.type] || null;
  };

  const applyUniformContentPadding = (draft, padding) => {
    draft.contentPadding = padding;
    draft.contentPaddingTop = padding;
    draft.contentPaddingRight = padding;
    draft.contentPaddingBottom = padding;
    draft.contentPaddingLeft = padding;
    draft.contentPaddingTopRight = padding;
    draft.contentPaddingBottomLeft = padding;
  };

  const syncDismissControlState = () => {
    const dismissLocked = modalState.requireInitialApply === true;
    if (elements?.widgetModalCloseBtn) {
      elements.widgetModalCloseBtn.disabled = dismissLocked;
    }
    if (elements?.widgetModalCancelBtn) {
      elements.widgetModalCancelBtn.disabled = dismissLocked;
    }
  };

  const clearWidgetModalView = () => {
    elements?.widgetModalOverlay?.classList.remove("open");
    elements?.widgetModalOverlay?.setAttribute("aria-hidden", "true");
    elements?.widgetModalTabs?.replaceChildren();
    if (elements?.widgetModalTabs) {
      elements.widgetModalTabs.style.display = "none";
    }
    elements?.widgetModalBody?.replaceChildren();
    if (elements?.widgetModalDefaultBtn) {
      elements.widgetModalDefaultBtn.onclick = null;
    }
    syncDismissControlState();
  };

  const resetModalState = () => {
    modalState.open = false;
    modalState.widgetId = "";
    modalState.draft = null;
    modalState.dismissPointerId = null;
    modalState.dismissMoved = false;
    modalState.dismissStartedOnOverlay = false;
    modalState.activeTab = "widget";
    modalState.requireInitialApply = false;
  };

  const createTabButton = ({ id, panelId, label, active, onClick }) => {
    const button = documentObj.createElement("button");
    button.type = "button";
    button.className = "settings-tab-btn";
    button.setAttribute("role", "tab");
    button.id = id;
    button.setAttribute("aria-controls", panelId);
    button.textContent = label;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.addEventListener("click", onClick);
    return button;
  };

  const renderWidgetModalTabs = (active, hasWidgetTab) => {
    const tablist = elements?.widgetModalTabs;
    if (!tablist) {
      return;
    }
    tablist.replaceChildren();
    tablist.style.display = hasWidgetTab ? "flex" : "none";
    if (!hasWidgetTab) {
      return;
    }

    const widgetOn = active === "widget";
    const widgetBtn = createTabButton({
      id: "widgetModalTabWidget",
      panelId: "widgetModalTabPanelWidget",
      label: "Widget",
      active: widgetOn,
      onClick: () => {
        setWidgetModalActiveTab?.("widget");
      }
    });
    const commonBtn = createTabButton({
      id: "widgetModalTabCommon",
      panelId: "widgetModalTabPanelCommon",
      label: "Common",
      active: !widgetOn,
      onClick: () => {
        setWidgetModalActiveTab?.("common");
      }
    });

    tablist.append(widgetBtn, commonBtn);
  };

  const renderWidgetModalPanel = (active, activeFields, hasWidgetTab) => {
    const panel = documentObj.createElement("section");
    panel.setAttribute("role", "tabpanel");
    if (hasWidgetTab) {
      const isWidget = active === "widget";
      panel.id = isWidget ? "widgetModalTabPanelWidget" : "widgetModalTabPanelCommon";
      panel.setAttribute("aria-labelledby", isWidget ? "widgetModalTabWidget" : "widgetModalTabCommon");
    }
    panel.append(renderWidgetModalFields?.(activeFields));
    elements?.widgetModalBody?.append(panel);
  };

  const updateWidgetModalDefaultButton = (active, instance, def) => {
    if (!elements?.widgetModalDefaultBtn) {
      return;
    }

    elements.widgetModalDefaultBtn.textContent = "Reset to default";
    elements.widgetModalDefaultBtn.title = active === "widget"
      ? "Reset widget tab to defaults"
      : "Reset common tab to global defaults";
    elements.widgetModalDefaultBtn.onclick = () => {
      if (active === "widget") {
        resetWidgetTabDraftToDefaults?.(def);
      } else {
        resetCommonTabDraftToGlobal?.(instance, def);
      }
      renderWidgetModal();
    };
  };

  const modalFieldValue = (field) => {
    const draft = modalState.draft;
    if (!draft) {
      return "";
    }
    if (field.group === "layout") {
      return draft.layout[field.key];
    }
    if (field.group === "base") {
      if (field.key === "contentPadding") {
        return resolveAveragePaddingValue?.(draft, 10, normalizeContentPadding);
      }
      return draft[field.key];
    }
    return draft.config[field.key];
  };

  const setModalFieldValue = (field, value) => {
    const draft = modalState.draft;
    if (!draft) {
      return;
    }
    if (field.group === "layout") {
      draft.layout[field.key] = Number(value);
      return;
    }
    if (field.group === "base") {
      if (field.key === "contentPadding") {
        const current = resolveModalInstance();
        const fallback = widgetPaddingFallback?.(current?.type);
        const padding = normalizeContentPadding?.(value, fallback);
        applyUniformContentPadding(draft, padding);
        return;
      }
      draft[field.key] = value;
      return;
    }
    draft.config[field.key] = value;
  };

  const closeWidgetModal = (rerender = true, options = {}) => {
    const forceClose = options?.force === true;
    const activeInstance = resolveModalInstance();
    if (!forceClose && modalState.open && modalState.requireInitialApply === true && activeInstance) {
      return false;
    }

    if (shortcutIconEditorState?.open) {
      closeShortcutIconEditor?.();
    }

    resetModalState();

    setModalInteractionLock?.(false);
    blurFocusedElementInOverlay?.(elements?.widgetModalOverlay);
    clearWidgetModalView();

    if (rerender) {
      renderSettings?.();
    }
    return true;
  };

  const renderWidgetModal = () => {
    if (!modalState.open || !modalState.widgetId || !modalState.draft) {
      return;
    }
    const instance = resolveModalInstance();
    if (!instance) {
      closeWidgetModal(false);
      return;
    }

    const def = resolveWidgetDefinition(instance);
    if (elements?.widgetModalTitle) {
      elements.widgetModalTitle.textContent = `${def.title} Settings`;
    }
    elements?.widgetModalBody?.replaceChildren();

    const commonFields = getWidgetModalCommonFields(instance);
    const widgetFields = getWidgetModalSpecificFields(def);
    const hasWidgetTab = widgetFields.length > 0;
    const active = hasWidgetTab ? (modalState.activeTab === "common" ? "common" : "widget") : "common";
    modalState.activeTab = active;
    renderWidgetModalTabs(active, hasWidgetTab);

    const activeFields = active === "widget" ? widgetFields : commonFields;
    renderWidgetModalPanel(active, activeFields, hasWidgetTab);
    updateWidgetModalDefaultButton(active, instance, def);
    syncDismissControlState();

    elements?.widgetModalOverlay?.classList.add("open");
    elements?.widgetModalOverlay?.setAttribute("aria-hidden", "false");
    setModalInteractionLock?.(true);

    const firstInput = elements?.widgetModalBody?.querySelector("input, textarea, select, button");
    if (isHTMLElement(firstInput)) {
      firstInput.focus();
    }
  };

  const openWidgetModal = (instanceId, { requireInitialApply = false } = {}) => {
    const instance = instanceById?.(instanceId);
    if (!instance) {
      return;
    }

    if (widgetTitleRenameState?.open) {
      closeWidgetTitleRenameModal?.();
    }

    modalState.open = true;
    modalState.widgetId = instance.id;
    modalState.activeTab = "widget";
    modalState.requireInitialApply = requireInitialApply === true;
    modalState.draft = buildWidgetModalDraft?.(
      instance,
      { pageCount: currentLauncherPageCount?.() },
      {
        resolveWidgetPadding,
        normalizeWidgetPage,
        normalizeSurfaceMode,
        normalizeTransparentGhostStrength,
        normalizeEdgeRoundness,
        normalizeTransparency,
        normalizeTitleAlign,
        defaultWidgetTitleAlign,
        normalizeAlign,
        defaultWidgetContentAlign,
        normalizeContentPadding,
        normalizeWidgetContentFontScale,
        normalizeWidgetThemeMode,
        normalizeWidgetColor
      }
    );

    renderWidgetModal();
  };

  const applyWidgetModal = () => {
    if (!modalState.open || !modalState.widgetId || !modalState.draft) {
      return;
    }

    const instance = resolveModalInstance();
    if (!instance) {
      closeWidgetModal(false);
      return;
    }

    const def = resolveWidgetDefinition(instance);
    const draft = modalState.draft;
    const previousPage = normalizeWidgetPage?.(instance.page, currentLauncherPageCount?.(), 0);

    recordHistorySnapshot?.("Apply widget settings");

    applyWidgetDraftToInstance?.(
      instance,
      draft,
      {
        defTitle: def.title,
        pageCount: currentLauncherPageCount?.(),
        previousPage
      },
      {
        normalizeText,
        normalizeSurfaceMode,
        normalizeTransparentGhostStrength,
        normalizeEdgeRoundness,
        normalizeTransparency,
        normalizeTitleAlign,
        defaultWidgetTitleAlign,
        normalizeAlign,
        defaultWidgetContentAlign,
        resolveDirectionalPaddingFromDraft,
        widgetPaddingFallback,
        normalizeContentPadding,
        normalizeWidgetContentFontScale,
        normalizeWidgetThemeMode,
        normalizeWidgetColor,
        normalizeWidgetPage,
        cloneLayout
      }
    );

    normalizeContainerWidgetDraftConfig?.(instance, {
      normalizeContainerExpandedCols,
      normalizeContainerExpandedRows,
      enforceContainerWidgetSize
    });

    syncWidgetStateAfterModalApply?.(instance, previousPage, {
      inferCommonOverrides,
      widgetCommonMaster: state?.ui?.widgetCommonMaster,
      syncLauncherPagingState,
      setActivePage: (page) => {
        state.ui.home.activePage = page;
      }
    });

    refreshWidgetRuntimeAfterModalApply?.(instance, def.title, {
      runtimeMap,
      applyLayout,
      applyCardVisual,
      refreshWidgetsByType,
      isWidgetInContainer
    });

    updateBoardBounds?.();
    queueSave?.();
    modalState.requireInitialApply = false;
    closeWidgetModal(true, { force: true });
  };

  return {
    modalFieldValue,
    setModalFieldValue,
    closeWidgetModal,
    renderWidgetModal,
    openWidgetModal,
    applyWidgetModal
  };
}
