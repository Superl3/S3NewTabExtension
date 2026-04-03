export function addWidgetFlow(type, options = {}, deps = {}) {
  const {
    state,
    widgetRegistry,
    syncLauncherPagingState,
    currentLauncherViewportPage,
    isPlaceholderLauncherPage,
    currentLauncherPageCount,
    materializeLauncherPlaceholderPage,
    currentLauncherActivePage,
    countBoardWidgetsOnPage,
    isWidgetDocked,
    isWidgetInContainer,
    normalizeWidgetPage,
    widgetDefaultGridSize,
    resolveRequestedWidgetSpans,
    normalizeGridSpanValue,
    gridMaxColumns,
    gridMaxRowSpan,
    isGridLayoutMode,
    findFirstAvailableBoardGridSlot,
    showAddWidgetToast,
    recordHistorySnapshot,
    widgetPaddingFallback,
    createWidgetInstanceDraft,
    getZCounter,
    setZCounter,
    normalizeText,
    isHeadlessDefaultType,
    isHeadlessTransparentDefaultType,
    defaultWidgetBackdropBlur,
    defaultWidgetTitleAlign,
    defaultWidgetContentAlign,
    normalizeCommonOverrides,
    normalizeGridLayout,
    cloneLayout,
    inferCommonOverrides,
    applyWidgetCommonMaster,
    applyFreeLayoutPlacement,
    getBoardRect,
    clamp,
    enforceContainerWidgetSize,
    createWidgetCard,
    applyGridLayout,
    setSelected,
    updateBoardBounds,
    queueSave
  } = deps;

  if (state?.mode !== "edit") {
    return false;
  }

  const def = widgetRegistry?.[type];
  if (!def) {
    return false;
  }

  syncLauncherPagingState?.({ expandToFitInstances: true });
  const viewportPage = currentLauncherViewportPage?.();
  if (isPlaceholderLauncherPage?.(viewportPage, currentLauncherPageCount?.())) {
    const materialized = materializeLauncherPlaceholderPage?.(viewportPage);
    if (!materialized) {
      return false;
    }
    syncLauncherPagingState?.({ expandToFitInstances: true });
  }

  const targetPage = currentLauncherActivePage?.();
  const pageLocalIndex = countBoardWidgetsOnPage?.(
    state.instances,
    targetPage,
    state?.ui?.home?.pageCount,
    {
      isWidgetDocked,
      isWidgetInContainer,
      normalizeWidgetPage
    }
  );

  const defaultSize = widgetDefaultGridSize?.(type, def);
  const { colSpan, rowSpan } = resolveRequestedWidgetSpans?.(type, options, defaultSize, {
    normalizeGridSpanValue,
    maxColumns: gridMaxColumns,
    maxRows: gridMaxRowSpan
  }) || { colSpan: 1, rowSpan: 1 };
  let gridPlacement = null;

  if (isGridLayoutMode?.()) {
    gridPlacement = findFirstAvailableBoardGridSlot?.(targetPage, colSpan, rowSpan);
    if (!gridPlacement) {
      showAddWidgetToast?.("빈 공간이 없어 위젯을 추가하지 못했습니다. 공간을 비우거나 새 페이지를 추가해 주세요.");
      return false;
    }
  }

  recordHistorySnapshot?.("Add widget");

  const defaultPadding = widgetPaddingFallback?.(type);

  const instance = createWidgetInstanceDraft?.(
    {
      type,
      def,
      options,
      nextId: state.nextId,
      zIndex: (Number(getZCounter?.()) || 1) + 1,
      targetPage,
      gridPlacement,
      pageLocalIndex,
      colSpan,
      rowSpan,
      defaultPadding
    },
    {
      normalizeText,
      isHeadlessDefaultType,
      isHeadlessTransparentDefaultType,
      defaultWidgetBackdropBlur,
      defaultWidgetTitleAlign,
      defaultWidgetContentAlign,
      normalizeCommonOverrides,
      normalizeGridLayout,
      cloneLayout
    }
  );

  if (!instance) {
    return false;
  }

  instance.commonOverrides = inferCommonOverrides?.(instance, state?.ui?.widgetCommonMaster) || {};
  applyWidgetCommonMaster?.(instance, state?.ui?.widgetCommonMaster, false);

  state.nextId += 1;
  setZCounter?.(instance.zIndex);

  if (!isGridLayoutMode?.()) {
    applyFreeLayoutPlacement?.(
      instance,
      {
        pageLocalIndex,
        colSpan,
        rowSpan,
        defaultSize,
        boardRect: getBoardRect?.()
      },
      { clamp }
    );
  }

  if (type === "container") {
    enforceContainerWidgetSize?.(instance);
  }

  state.instances.push(instance);
  createWidgetCard?.(instance);

  if (isGridLayoutMode?.()) {
    applyGridLayout?.({ commitFreeLayout: false, shouldSave: false });
  }

  setSelected?.(instance.id);
  updateBoardBounds?.();
  queueSave?.();
  return true;
}
