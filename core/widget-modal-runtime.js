export function createWidgetModalRuntime({
  modalState,
  pendingWidgetAddState,
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
  refreshAllWidgets,
  isWidgetInContainer,
  isWidgetDocked,
  renderDockWidgets,
  updateBoardBounds,
  queueSave,
  commitPendingWidgetAdd,
  documentObj = typeof document !== "undefined" ? document : null
} = {}) {
  const isHTMLElement = (value) => {
    if (typeof HTMLElement !== "undefined") {
      return value instanceof HTMLElement;
    }
    return Boolean(value && typeof value === "object");
  };

  const resetPendingWidgetAddState = () => {
    if (!pendingWidgetAddState) {
      return;
    }
    pendingWidgetAddState.open = false;
    pendingWidgetAddState.widgetId = "";
    pendingWidgetAddState.instance = null;
    pendingWidgetAddState.pageCount = 1;
    pendingWidgetAddState.placeholderPage = null;
    pendingWidgetAddState.type = "";
    pendingWidgetAddState.colSpan = 1;
    pendingWidgetAddState.rowSpan = 1;
    pendingWidgetAddState.title = "";
  };

  const resolvePendingWidgetAdd = () => {
    if (!pendingWidgetAddState?.open || !modalState.widgetId) {
      return null;
    }
    if (pendingWidgetAddState.widgetId !== modalState.widgetId) {
      return null;
    }
    return pendingWidgetAddState;
  };

  const resolveModalInstance = () => {
    if (!modalState.widgetId) {
      return null;
    }
    return resolvePendingWidgetAdd()?.instance || instanceById?.(modalState.widgetId) || null;
  };

  const resolveWidgetDefinition = (instance) => {
    if (!instance) {
      return null;
    }
    const definition = widgetRegistry?.[instance.type];
    if (definition) {
      return definition;
    }

    return {
      title: normalizeText?.(instance.title, "Widget") || "Widget",
      settingsSchema: [],
      defaultConfig: {}
    };
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
    if (elements?.widgetModalCloseBtn) {
      elements.widgetModalCloseBtn.disabled = false;
    }
    if (elements?.widgetModalCancelBtn) {
      elements.widgetModalCancelBtn.disabled = false;
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
    return draft.config?.[field.key];
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
    draft.config = draft.config && typeof draft.config === "object" ? draft.config : {};
    draft.config[field.key] = value;
  };

  const closeWidgetModal = (rerender = true, options = {}) => {
    if (!modalState.open) {
      return false;
    }
    if (shortcutIconEditorState?.open) {
      closeShortcutIconEditor?.();
    }

    const shouldResetPendingWidget =
      options?.preservePendingWidget !== true &&
      pendingWidgetAddState?.widgetId &&
      pendingWidgetAddState.widgetId === modalState.widgetId;

    resetModalState();

    setModalInteractionLock?.(false);
    blurFocusedElementInOverlay?.(elements?.widgetModalOverlay);
    clearWidgetModalView();

    if (shouldResetPendingWidget) {
      resetPendingWidgetAddState();
    }

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

  const openWidgetModal = (instanceId, options = {}) => {
    const pendingAdd = options?.pendingAdd;
    const instance = pendingAdd?.instance || instanceById?.(instanceId);
    if (!instance) {
      return;
    }

    if (widgetTitleRenameState?.open) {
      closeWidgetTitleRenameModal?.();
    }

    if (pendingAdd) {
      pendingWidgetAddState.open = true;
      pendingWidgetAddState.widgetId = instance.id;
      pendingWidgetAddState.instance = pendingAdd.instance;
      pendingWidgetAddState.pageCount = pendingAdd.pageCount || currentLauncherPageCount?.() || 1;
      pendingWidgetAddState.placeholderPage = pendingAdd.placeholderPage ?? null;
      pendingWidgetAddState.type = pendingAdd.type || instance.type || "";
      pendingWidgetAddState.colSpan = pendingAdd.colSpan || 1;
      pendingWidgetAddState.rowSpan = pendingAdd.rowSpan || 1;
      pendingWidgetAddState.title = pendingAdd.title || instance.title || "";
    } else if (resolvePendingWidgetAdd()) {
      resetPendingWidgetAddState();
    }

    modalState.open = true;
    modalState.widgetId = instance.id;
    modalState.activeTab = "widget";
    modalState.draft = buildWidgetModalDraft?.(
      instance,
      { pageCount: pendingAdd?.pageCount || currentLauncherPageCount?.() },
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
      return false;
    }

    const instance = resolveModalInstance();
    if (!instance) {
      closeWidgetModal(false);
      return false;
    }

    const pendingAdd = resolvePendingWidgetAdd();

    if (pendingAdd) {
      const added = commitPendingWidgetAdd?.(modalState.draft, pendingAdd) === true;
      if (added) {
        resetPendingWidgetAddState();
        closeWidgetModal(true, { preservePendingWidget: true });
      }
      return added;
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
      isWidgetInContainer,
      isWidgetDocked,
      renderDockWidgets
    });

    refreshAllWidgets?.();

    updateBoardBounds?.();
    queueSave?.();
    closeWidgetModal(true, { preservePendingWidget: true });
    return true;
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
