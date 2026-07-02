import { arrayOrEmpty } from "../utils/array.js";
import {
  createWidgetCardRuntime as createWidgetCardRuntimeCore
} from "../widget-card-runtime.js";
import {
  createWidgetDropSurfaceRuntime as createWidgetDropSurfaceRuntimeCore
} from "../widget-drop-surface-runtime.js";
import {
  createWidgetStateRuntime as createWidgetStateRuntimeCore
} from "../widget-state-runtime.js";

function normalizeAppWidgetRuntimeDeps(deps = {}) {
  const capabilities = deps.capabilities || {};
  return {
    ...deps,
    ...capabilities.lifecycle,
    ...capabilities.board,
    ...capabilities.container,
    ...capabilities.dock,
    ...capabilities.drag,
    ...capabilities.layout,
    ...capabilities.selection,
    ...capabilities.settings,
    ...capabilities.persistence,
    ...capabilities.history,
    ...capabilities.style,
    ...capabilities.modal
  };
}

export function createAppWidgetRuntime(rawDeps) {
  const deps = normalizeAppWidgetRuntimeDeps(rawDeps);
  const createWidgetDropSurfaceRuntimeImpl = deps.createWidgetDropSurfaceRuntime || createWidgetDropSurfaceRuntimeCore;
  const createWidgetStateRuntimeImpl = deps.createWidgetStateRuntime || createWidgetStateRuntimeCore;
  const createWidgetCardRuntimeImpl = deps.createWidgetCardRuntime || createWidgetCardRuntimeCore;

  const widgetDropSurfaceRuntime = createWidgetDropSurfaceRuntimeImpl({
    containerDropTargetAtPoint: deps.containerDropTargetAtPoint,
    resolveContainerInsertIndexFromPointer: deps.resolveContainerInsertIndexFromPointer,
    normalizeContainerId: deps.normalizeContainerId,
    reorderWidgetInContainerByIndex: deps.reorderWidgetInContainerByIndex,
    isBoardWidgetInstance: deps.isBoardWidgetInstance,
    normalizeWidgetPage: deps.normalizeWidgetPage,
    currentLauncherPageCount: deps.currentLauncherPageCount,
    currentLauncherActivePage: deps.currentLauncherActivePage,
    setWidgetContainer,
    compactEmptyLauncherPagesForUseMode: deps.compactEmptyLauncherPagesForUseMode,
    renderBoard,
    renderSettings: deps.renderSettings,
    queueSave: deps.queueSave,
    isDockDropPoint: deps.isDockDropPoint,
    isDockEligibleWidget: deps.isDockEligibleWidget,
    isWidgetDocked: deps.isWidgetDocked,
    isWidgetInContainer: deps.isWidgetInContainer,
    resolveDockDropSlotIndex: deps.resolveDockDropSlotIndex,
    recordHistorySnapshot: deps.recordHistorySnapshot,
    touchUserMutationClock: deps.touchUserMutationClock,
    moveWidgetToDockSlot: deps.moveWidgetToDockSlot,
    renderDockWidgets: deps.renderDockWidgets
  });

  const widgetStateRuntime = createWidgetStateRuntimeImpl({
    getState: deps.getState,
    elements: deps.elements,
    runtimeMap: deps.runtimeMap,
    modalState: deps.modalState,
    instanceById: deps.instanceById,
    normalizeContainerId: deps.normalizeContainerId,
    canPlaceWidgetInContainer: deps.canPlaceWidgetInContainer,
    recordHistorySnapshot: deps.recordHistorySnapshot,
    touchUserMutationClock: deps.touchUserMutationClock,
    appendWidgetToContainerOrder: deps.appendWidgetToContainerOrder,
    normalizeContainerAssignments: deps.normalizeContainerAssignments,
    renderBoard,
    renderSettings: deps.renderSettings,
    refreshWidgetsByType: deps.refreshWidgetsByType,
    queueSave: deps.queueSave,
    normalizeWidgetPage: deps.normalizeWidgetPage,
    currentLauncherPageCount: deps.currentLauncherPageCount,
    currentLauncherActivePage: deps.currentLauncherActivePage,
    isLauncherPlaceholderPolicyActive: deps.isLauncherPlaceholderPolicyActive,
    isPlaceholderLauncherPage: deps.isPlaceholderLauncherPage,
    commitPlaceholderPageDrop: deps.commitPlaceholderPageDrop,
    clearPendingPlaceholderDrop: deps.clearPendingPlaceholderDrop,
    projectWidgetBoardDropLayout: deps.projectWidgetBoardDropLayout,
    isWidgetDocked: deps.isWidgetDocked,
    normalizeDockedWidgetOrders: deps.normalizeDockedWidgetOrders,
    applyLayout: deps.applyLayout,
    containerUnitLayoutSize: deps.containerUnitLayoutSize,
    updateBoardBounds: deps.updateBoardBounds,
    closeWidgetModal: deps.closeWidgetModal,
    compactEmptyLauncherPagesForUseMode: deps.compactEmptyLauncherPagesForUseMode,
    renderDockWidgets: deps.renderDockWidgets,
    isBoardWidgetInstance: deps.isBoardWidgetInstance,
    isWidgetInContainer: deps.isWidgetInContainer
  });

  const widgetCardRuntime = createWidgetCardRuntimeImpl({
    getState: deps.getState,
    widgetRegistry: deps.widgetRegistry,
    elements: deps.elements,
    runtimeMap: deps.runtimeMap,
    buildWidgetControllerContext: deps.buildWidgetControllerContext,
    gridMetrics: deps.gridMetrics,
    patchWidgetConfig: deps.patchWidgetConfig,
    setWidgetContainer,
    releaseWidgetFromContainerByDrop,
    reorderWidgetInContainerByIndex: deps.reorderWidgetInContainerByIndex,
    createWidgetDropSilhouette: deps.createWidgetDropSilhouette,
    resolveContainerInsertIndexFromPointer: deps.resolveContainerInsertIndexFromPointer,
    tryContainerWidgetByDrop,
    tryDockWidgetByDrop,
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
    renderBoard,
    queueSave: deps.queueSave,
    instanceById: deps.instanceById,
    setSelected: deps.setSelected,
    openWidgetModal: deps.openWidgetModal,
    removeWidget,
    attachWidgetTypeActions: deps.attachWidgetTypeActions,
    attachWidgetCardClickBehavior: deps.attachWidgetCardClickBehavior,
    startWidgetCardDragSession: deps.startWidgetCardDragSession,
    closeBoardContextMenu: deps.closeBoardContextMenu,
    bringWidgetToFront: deps.bringWidgetToFront,
    setWidgetDropSilhouetteVisible: deps.setWidgetDropSilhouetteVisible,
    setDragDeleteZoneActive: deps.setDragDeleteZoneActive,
    setLauncherDragPlaceholderPolicy: deps.setLauncherDragPlaceholderPolicy,
    updateDragDeleteZoneHover: deps.updateDragDeleteZoneHover,
    createNoneDropPlan: deps.createNoneDropPlan,
    resolveEdgeDirectionFromPointer: deps.resolveEdgeDirectionFromPointer,
    getLauncherViewportRect: deps.getLauncherViewportRect,
    syncLauncherPagingState: deps.syncLauncherPagingState,
    isLauncherPlaceholderPolicyActive: deps.isLauncherPlaceholderPolicyActive,
    isPlaceholderLauncherPage: deps.isPlaceholderLauncherPage,
    setLauncherVirtualPage: deps.setLauncherVirtualPage,
    setLauncherVirtualPageState: deps.setLauncherVirtualPageState,
    createDeferredEdgeSwitchScheduler: deps.createDeferredEdgeSwitchScheduler,
    evaluateAndRenderWidgetDragIndicators: deps.evaluateAndRenderWidgetDragIndicators,
    evaluateFinalWidgetDrop: deps.evaluateFinalWidgetDrop,
    resolveDraftPlacementAtPointer: deps.resolveDraftPlacementAtPointer,
    patchWidgetLayout,
    applyLayout: deps.applyLayout,
    isGridLayoutMode: deps.isGridLayoutMode,
    recordHistorySnapshot: deps.recordHistorySnapshot,
    touchUserMutationClock: deps.touchUserMutationClock,
    widgetDefaultGridSize: deps.widgetDefaultGridSize,
    normalizeGridLayout: deps.normalizeGridLayout,
    clamp: deps.clamp,
    resolveBoundedDragPositionFromDelta: deps.resolveBoundedDragPositionFromDelta,
    cleanupBoardDragSession: deps.cleanupBoardDragSession,
    applyWidgetDropPlan: deps.applyWidgetDropPlan,
    clearPendingPlaceholderDrop: deps.clearPendingPlaceholderDrop,
    normalizeWidgetPage: deps.normalizeWidgetPage,
    applyGridLayout: deps.applyGridLayout,
    compactEmptyLauncherPagesForUseMode: deps.compactEmptyLauncherPagesForUseMode,
    updateBoardBounds: deps.updateBoardBounds,
    renderSettings: deps.renderSettings,
    resolveSnappedPosition: deps.resolveSnappedPosition,
    snap: deps.snap,
    windowObj: deps.windowObj,
    createLongPressDragController: deps.createLongPressDragController,
    widgetLongPressState: deps.widgetLongPressState,
    longPressDelayMs: deps.longPressDelayMs,
    shortcutDelayMs: deps.shortcutDelayMs,
    baseMoveTolerance: deps.baseMoveTolerance,
    startWidgetPaddingDragSession: deps.startWidgetPaddingDragSession,
    widgetPaddingFallback: deps.widgetPaddingFallback,
    resolveWidgetPadding: deps.resolveWidgetPadding,
    normalizeContentPadding: deps.normalizeContentPadding,
    projectContentPaddingFromDrag: deps.projectContentPaddingFromDrag,
    hasContentPaddingChanged: deps.hasContentPaddingChanged,
    modalState: deps.modalState,
    setLastDragEndAt: deps.setLastDragEndAt,
    attachWidgetCardInteractionEvents: deps.attachWidgetCardInteractionEvents,
    openWidgetTitleRenameModal: deps.openWidgetTitleRenameModal,
    attachWidgetResizeHandle: deps.attachWidgetResizeHandle,
    startGridResizeSession: deps.startGridResizeSession,
    startFreeResizeSession: deps.startFreeResizeSession,
    applyCardVisual: deps.applyCardVisual,
    applyCardStack: deps.applyCardStack,
    getLastDragEndAt: deps.getLastDragEndAt
  });

  function tryContainerWidgetByDrop(instance, pointerEvent, options = {}) {
    return widgetDropSurfaceRuntime.tryContainerWidgetByDrop(instance, pointerEvent, options);
  }

  function tryDockWidgetByDrop(instance, pointerEvent, options = {}) {
    return widgetDropSurfaceRuntime.tryDockWidgetByDrop(instance, pointerEvent, options);
  }

  function setWidgetContainer(instanceId, containerId, options = {}) {
    return widgetStateRuntime.setWidgetContainer(instanceId, containerId, options);
  }

  function releaseWidgetFromContainerByDrop(widgetId, payload = {}) {
    return widgetStateRuntime.releaseWidgetFromContainerByDrop(widgetId, payload);
  }

  function releaseWidgetFromDockByDrop(widgetId, payload = {}) {
    return widgetStateRuntime.releaseWidgetFromDockByDrop(widgetId, payload);
  }

  function patchWidgetLayout(instanceId, layoutPatch, options = {}) {
    return widgetStateRuntime.patchWidgetLayout(instanceId, layoutPatch, options);
  }

  function removeWidget(instanceId) {
    return widgetStateRuntime.removeWidget(instanceId);
  }

  function createWidgetCard(instance) {
    return widgetCardRuntime.createWidgetCard(instance);
  }

  function isRenderableBoardWidget(instance) {
    return (
      instance?.enabled !== false &&
      !deps.isWidgetDocked(instance) &&
      !deps.isWidgetInContainer(instance)
    );
  }

  function removeRuntimeEntry(instanceId) {
    const rt = deps.runtimeMap.get(instanceId);
    rt?.controller?.destroy?.();
    rt?.card?.remove?.();
    deps.runtimeMap.delete(instanceId);
  }

  function refreshExistingCard(instance, rt) {
    const title = rt.card?.querySelector?.(".widget-title");
    if (title) {
      const def = deps.widgetRegistry?.[instance.type];
      title.textContent = instance.title || def?.title || "Widget";
    }

    rt.instance = instance;
    rt.type = instance.type;
    deps.applyLayout(rt.card, instance.layout, instance.page);
    deps.applyCardVisual(rt.card, instance);
    deps.applyCardStack(rt.card, instance);
    if (instance.type === "container") {
      rt.controller?.refresh?.();
    }
  }

  function renderBoard() {
    const state = deps.getState();

    deps.clearWidgetDragGuideState();
    deps.clearContainerDropTargets();
    deps.syncLauncherPagingState({ expandToFitInstances: true });
    deps.normalizeDockedWidgetOrders(state.instances);
    deps.syncZCounterFromState();

    const desiredIds = new Set();
    for (const instance of arrayOrEmpty(state.instances)) {
      if (isRenderableBoardWidget(instance)) {
        desiredIds.add(instance.id);
      }
    }

    for (const [instanceId, rt] of Array.from(deps.runtimeMap.entries())) {
      const instance = state.instances?.find((item) => item.id === instanceId);
      if (!desiredIds.has(instanceId) || !instance || rt.type !== instance.type || rt.instance !== instance) {
        removeRuntimeEntry(instanceId);
      }
    }

    for (const instance of arrayOrEmpty(state.instances)) {
      if (!desiredIds.has(instance.id)) {
        continue;
      }

      const rt = deps.runtimeMap.get(instance.id);
      if (rt?.card) {
        refreshExistingCard(instance, rt);
        deps.elements.board.append(rt.card);
      } else {
        createWidgetCard(instance);
      }
    }

    if (deps.isGridLayoutMode()) {
      deps.applyGridLayout({ commitFreeLayout: false, shouldSave: false });
    }

    deps.setSelected(state.selectedWidgetId, { renderDock: false, renderSettings: false });
    deps.setBodyMode();
    deps.updateBoardBounds();
  }

  function refreshBoardCardsAfterLauncherPageMutation({ animate = true } = {}) {
    const state = deps.getState();

    for (const instance of arrayOrEmpty(state.instances)) {
      if (!deps.isBoardWidgetInstance(instance)) {
        continue;
      }
      const rt = deps.runtimeMap.get(instance.id);
      if (!rt?.card) {
        continue;
      }
      deps.applyLayout(rt.card, instance.layout, instance.page);
      if (instance.type === "container") {
        rt.controller?.refresh?.();
      }
    }
    deps.renderBoardViewport({ animate, dragging: false, dragOffsetX: 0 });
    deps.renderSettings();
  }

  return {
    tryContainerWidgetByDrop,
    tryDockWidgetByDrop,
    setWidgetContainer,
    releaseWidgetFromContainerByDrop,
    releaseWidgetFromDockByDrop,
    patchWidgetLayout,
    removeWidget,
    createWidgetCard,
    renderBoard,
    refreshBoardCardsAfterLauncherPageMutation
  };
}
