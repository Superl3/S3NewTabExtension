export function createDockWidgetsRuntime(deps) {
  function renderDockWidgets() {
    const state = deps.getState();

    const dockRuntimeDeps = {
      getUi: () => deps.getState().ui,
      getAllWidgets: () => deps.getState().instances,
      getWidgetDefinition: (type) => deps.widgetRegistry[type] || null,
      getGridMetrics: () => deps.gridMetrics(),
      getWidgetRuntimeCard: (widgetId) => deps.runtimeMap.get(widgetId)?.card || null,
      patchWidgetConfig: deps.patchWidgetConfig,
      setWidgetContainer: deps.setWidgetContainer,
      releaseWidgetFromContainerByDrop: deps.releaseWidgetFromContainerByDrop,
      reorderWidgetInContainerByIndex: deps.reorderWidgetInContainerByIndex,
      resolveContainerInsertIndexFromPointer: deps.resolveContainerInsertIndexFromPointer,
      tryContainerWidgetByDrop: deps.tryContainerWidgetByDrop,
      tryDockWidgetByDrop: deps.tryDockWidgetByDrop,
      projectWidgetBoardDropLayout: deps.projectWidgetBoardDropLayout,
      updateCrossSurfaceDropIndicators: deps.updateCrossSurfaceDropIndicators,
      renderBoardViewport: deps.renderBoardViewport,
      setActiveLauncherPage: deps.setActiveLauncherPage,
      currentLauncherActivePage: deps.currentLauncherActivePage,
      currentLauncherPageCount: deps.currentLauncherPageCount,
      registerContainerDropTarget: deps.registerContainerDropTarget,
      unregisterContainerDropTarget: deps.unregisterContainerDropTarget,
      createDragPreviewSession: deps.createDragPreviewSession,
      createWidgetDragPreview: deps.createWidgetDragPreview,
      positionWidgetDragPreview: deps.positionWidgetDragPreview,
      updateWidgetDragGuideAtPointer: deps.updateWidgetDragGuideAtPointer,
      clearWidgetDragGuideState: deps.clearWidgetDragGuideState,
      renderBoard: deps.renderBoard,
      queueSave: deps.queueSave,
      isEditMode: () => deps.getState().mode === "edit",
      openWidgetSettingsById: (widgetId) => {
        const target = deps.instanceById(widgetId);
        if (!target) {
          return;
        }
        deps.setSelected(target.id);
        deps.openWidgetModal(target.id);
      }
    };

    const dragSession = {
      closeBoardContextMenu: deps.closeBoardContextMenu,
      createDragPreviewSession: deps.createDragPreviewSession,
      runtimeMap: deps.runtimeMap,
      createWidgetDropSilhouette: deps.createWidgetDropSilhouette,
      setDragDeleteZoneActive: deps.setDragDeleteZoneActive,
      setLauncherDragPlaceholderPolicy: deps.setLauncherDragPlaceholderPolicy,
      updateDragDeleteZoneHover: deps.updateDragDeleteZoneHover,
      createNoneDropPlan: deps.createNoneDropPlan,
      resolveEdgeDirectionFromPointer: deps.resolveEdgeDirectionFromPointer,
      getLauncherViewportRect: deps.getLauncherViewportRect,
      syncLauncherPagingState: deps.syncLauncherPagingState,
      isLauncherPlaceholderPolicyActive: deps.isLauncherPlaceholderPolicyActive,
      isPlaceholderLauncherPage: deps.isPlaceholderLauncherPage,
      currentLauncherPageCount: deps.currentLauncherPageCount,
      currentLauncherActivePage: deps.currentLauncherActivePage,
      setLauncherVirtualPage: deps.setLauncherVirtualPage,
      setLauncherVirtualPageState: (value) => {
        deps.launcherPageUiState.virtualPage = value;
      },
      setActiveLauncherPage: deps.setActiveLauncherPage,
      createDeferredEdgeSwitchScheduler: deps.createDeferredEdgeSwitchScheduler,
      isDockDropPoint: deps.isDockDropPoint,
      persistentDockElement: deps.elements.persistentDock,
      evaluateAndRenderWidgetDragIndicators: deps.evaluateAndRenderWidgetDragIndicators,
      evaluateFinalWidgetDrop: deps.evaluateFinalWidgetDrop,
      clearWidgetDragGuideState: deps.clearWidgetDragGuideState,
      setDockDropTargetActive: deps.setDockDropTargetActive,
      setContainerDropTargetActive: deps.setContainerDropTargetActive,
      setWidgetDropSilhouetteVisible: deps.setWidgetDropSilhouetteVisible,
      applyWidgetDropPlan: deps.applyWidgetDropPlan,
      releaseWidgetFromDockByDrop: deps.releaseWidgetFromDockByDrop,
      removeDragPointerListeners: deps.removeDragPointerListeners,
      setLastDragEndAt: deps.setLastDragEndAt,
      windowObj: deps.windowObj
    };

    deps.renderDockWidgetsView({
      strip: deps.elements.dockWidgetStrip,
      instances: state.instances,
      homeState: state?.ui?.home,
      dockUiState: deps.dockUiState,
      destroyDockEmbeddedControllers: deps.destroyDockEmbeddedControllers,
      normalizeDockedWidgetOrders: deps.normalizeDockedWidgetOrders,
      onNormalizationChanged: () => {
        deps.renderBoard();
      },
      buildDockConfig: deps.buildDockConfig,
      isHorizontalDock: deps.isHorizontalDock,
      dockedInstances: deps.dockedInstances,
      normalizeDockActiveId: deps.normalizeDockActiveId,
      normalizeDockOrder: deps.normalizeDockOrder,
      widgetRegistry: deps.widgetRegistry,
      normalizeText: deps.normalizeText,
      applyCardVisual: deps.applyCardVisual,
      runtimeMount: {
        runtimeDeps: dockRuntimeDeps,
        onControllerMounted: (widgetId, controller) => {
          deps.dockEmbeddedUiState.controllers.set(widgetId, {
            destroy() {
              controller?.destroy?.();
            }
          });
        }
      },
      dragSession,
      setDockActiveId: deps.setDockActiveId,
      applyDockActiveVisual: deps.applyDockActiveVisual,
      isEditMode: () => deps.getState().mode === "edit",
      openWidgetSettings: (widgetId) => {
        deps.setSelected(widgetId);
        deps.openWidgetModal(widgetId);
      },
      syncDockOverflowState: deps.syncDockOverflowState,
      documentObj: deps.documentObj
    });
  }

  return {
    renderDockWidgets
  };
}
