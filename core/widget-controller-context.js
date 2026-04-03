export function buildWidgetControllerContext({
  widgetId,
  getWidget,
  getUi,
  getAllWidgets,
  getWidgetDefinition,
  getGridMetrics,
  getWidgetRuntimeCard,
  patchWidgetConfig,
  setWidgetContainer,
  releaseWidgetFromContainerByDrop,
  reorderWidgetInContainerByIndex,
  createWidgetDropSilhouette,
  resolveContainerInsertIndexFromPointer,
  tryContainerWidgetByDrop,
  tryDockWidgetByDrop,
  projectWidgetBoardDropLayout,
  updateCrossSurfaceDropIndicators,
  renderBoardViewport,
  setActiveLauncherPage,
  currentLauncherActivePage,
  currentLauncherPageCount,
  registerContainerDropTarget,
  unregisterContainerDropTarget,
  createDragPreviewSession,
  createWidgetDragPreview,
  positionWidgetDragPreview,
  updateWidgetDragGuideAtPointer,
  clearWidgetDragGuideState,
  renderBoard,
  queueSave,
  isEditMode,
  openWidgetSettingsById
} = {}) {
  const patchConfigFor = (targetId) => (patch, options = {}) => {
    return patchWidgetConfig?.(targetId, patch, options);
  };

  const openSettingsFor = (targetId) => {
    if (!isEditMode?.()) {
      return;
    }
    return openWidgetSettingsById?.(targetId);
  };

  const dropWidgetToDockByPointer = (widget, pointerEvent, options = {}) => {
    const moved = tryDockWidgetByDrop?.(widget, pointerEvent, options);
    if (moved) {
      renderBoard?.();
      queueSave?.();
    }
    return moved;
  };

  const ctx = {
    getConfig: () => getWidget?.()?.config,
    getUi,
    getWidget,
    getAllWidgets,
    getWidgetDefinition,
    getGridMetrics,
    getWidgetRuntimeCard,
    patchConfig: patchConfigFor(widgetId),
    patchWidgetConfigById: (targetId, patch, options = {}) => patchConfigFor(targetId)(patch, options),
    setWidgetContainer: (targetId, containerId) => setWidgetContainer?.(targetId, containerId),
    releaseWidgetFromContainerByDrop: (targetId, payload) => releaseWidgetFromContainerByDrop?.(targetId, payload),
    reorderWidgetInContainerByIndex: (targetId, containerId, index, options = {}) =>
      reorderWidgetInContainerByIndex?.(targetId, containerId, index, options),
    resolveContainerInsertIndexFromPointer: (containerId, clientX, clientY, options = {}) =>
      resolveContainerInsertIndexFromPointer?.(containerId, clientX, clientY, options),
    tryContainerWidgetByDrop: (widget, pointerEvent, options = {}) =>
      tryContainerWidgetByDrop?.(widget, pointerEvent, options),
    tryDockWidgetByDrop: (widget, pointerEvent, options = {}) =>
      tryDockWidgetByDrop?.(widget, pointerEvent, options),
    projectWidgetBoardDropLayout: (widget, clientX, clientY, options = {}) =>
      projectWidgetBoardDropLayout?.(widget, clientX, clientY, options),
    updateCrossSurfaceDropIndicators: (widget, clientX, clientY, options = {}) =>
      updateCrossSurfaceDropIndicators?.(widget, clientX, clientY, options),
    renderBoardViewport,
    setActiveLauncherPage,
    currentLauncherActivePage,
    currentLauncherPageCount,
    registerContainerDropTarget: (containerId, element, options = {}) =>
      registerContainerDropTarget?.(containerId, element, options),
    unregisterContainerDropTarget: (containerId) => unregisterContainerDropTarget?.(containerId),
    createDragPreviewSession: (widget, options = {}) => createDragPreviewSession?.(widget, options),
    createWidgetDragPreview: (widget, options = {}) => createWidgetDragPreview?.(widget, options),
    positionWidgetDragPreview,
    updateWidgetDragGuideAtPointer: (widget, clientX, clientY, options = {}) =>
      updateWidgetDragGuideAtPointer?.(widget, clientX, clientY, options),
    clearWidgetDragGuideState,
    dropWidgetToContainerByPointer: (widget, pointerEvent, options = {}) =>
      tryContainerWidgetByDrop?.(widget, pointerEvent, options),
    dropWidgetToDockByPointer,
    isEditMode,
    openSettings: () => openSettingsFor(widgetId),
    openWidgetSettingsById: openSettingsFor
  };

  if (typeof createWidgetDropSilhouette === "function") {
    ctx.createWidgetDropSilhouette = (sourceElement, options = {}) =>
      createWidgetDropSilhouette(sourceElement, options);
  }

  return ctx;
}
