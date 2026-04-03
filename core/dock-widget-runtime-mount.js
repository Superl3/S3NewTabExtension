import { buildWidgetControllerContext } from "./widget-controller-context.js";

export function mountDockWidgetRuntime({
  item,
  slot,
  label,
  widgetRegistry,
  runtimeDeps = {},
  documentObj = null,
  onControllerMounted
} = {}) {
  const def = widgetRegistry?.[item?.type];
  if (def && typeof def.create === "function") {
    const controller = def.create({
      container: slot,
      ...buildWidgetControllerContext({
        widgetId: item.id,
        getWidget: () => item,
        getUi: runtimeDeps.getUi,
        getAllWidgets: runtimeDeps.getAllWidgets,
        getWidgetDefinition: runtimeDeps.getWidgetDefinition,
        getGridMetrics: runtimeDeps.getGridMetrics,
        getWidgetRuntimeCard: runtimeDeps.getWidgetRuntimeCard,
        patchWidgetConfig: runtimeDeps.patchWidgetConfig,
        setWidgetContainer: runtimeDeps.setWidgetContainer,
        releaseWidgetFromContainerByDrop: runtimeDeps.releaseWidgetFromContainerByDrop,
        reorderWidgetInContainerByIndex: runtimeDeps.reorderWidgetInContainerByIndex,
        resolveContainerInsertIndexFromPointer: runtimeDeps.resolveContainerInsertIndexFromPointer,
        tryContainerWidgetByDrop: runtimeDeps.tryContainerWidgetByDrop,
        tryDockWidgetByDrop: runtimeDeps.tryDockWidgetByDrop,
        projectWidgetBoardDropLayout: runtimeDeps.projectWidgetBoardDropLayout,
        updateCrossSurfaceDropIndicators: runtimeDeps.updateCrossSurfaceDropIndicators,
        renderBoardViewport: runtimeDeps.renderBoardViewport,
        setActiveLauncherPage: runtimeDeps.setActiveLauncherPage,
        currentLauncherActivePage: runtimeDeps.currentLauncherActivePage,
        currentLauncherPageCount: runtimeDeps.currentLauncherPageCount,
        registerContainerDropTarget: runtimeDeps.registerContainerDropTarget,
        unregisterContainerDropTarget: runtimeDeps.unregisterContainerDropTarget,
        createDragPreviewSession: runtimeDeps.createDragPreviewSession,
        createWidgetDragPreview: runtimeDeps.createWidgetDragPreview,
        positionWidgetDragPreview: runtimeDeps.positionWidgetDragPreview,
        updateWidgetDragGuideAtPointer: runtimeDeps.updateWidgetDragGuideAtPointer,
        clearWidgetDragGuideState: runtimeDeps.clearWidgetDragGuideState,
        renderBoard: runtimeDeps.renderBoard,
        queueSave: runtimeDeps.queueSave,
        isEditMode: runtimeDeps.isEditMode,
        openWidgetSettingsById: runtimeDeps.openWidgetSettingsById
      })
    });

    onControllerMounted?.(item.id, controller);
    return true;
  }

  const doc = documentObj || (typeof document !== "undefined" ? document : null);
  if (!doc?.createElement) {
    return false;
  }

  const fallback = doc.createElement("span");
  fallback.className = "dock-item-icon";
  const fallbackText = String(label ?? "").trim();
  fallback.textContent = fallbackText.slice(0, 1).toUpperCase() || "W";
  slot?.append?.(fallback);
  return false;
}
