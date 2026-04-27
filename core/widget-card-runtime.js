export function createWidgetCardRuntime(deps) {
  function createWidgetCard(instance) {
    const def = deps.widgetRegistry[instance.type];
    const fragment = deps.elements.template.content.cloneNode(true);
    const card = fragment.querySelector(".widget-card");
    const shell = fragment.querySelector(".widget-shell");
    const head = fragment.querySelector(".widget-head");
    const headActions = fragment.querySelector(".widget-head-actions");
    const title = fragment.querySelector(".widget-title");
    const body = fragment.querySelector(".widget-body");
    const contentHost = fragment.querySelector(".widget-content-host");
    const inlineActions = fragment.querySelector(".widget-inline-actions");
    const inlineActionsBottom = fragment.querySelector(".widget-inline-actions-bottom");
    const contentSlot = fragment.querySelector(".widget-content-slot");
    const selectBtn = fragment.querySelector(".widget-select-btn");
    const removeBtn = fragment.querySelector(".widget-remove-btn");
    const floatSelectBtn = fragment.querySelector(".widget-float-select");
    const floatRemoveBtn = fragment.querySelector(".widget-float-remove");
    const dragBtn = fragment.querySelector(".widget-drag-btn");
    const resizeHandle = fragment.querySelector(".widget-resize-handle");
    const paddingHandleTopRight = fragment.querySelector(".widget-padding-handle-top-right");
    const paddingHandleBottomLeft = fragment.querySelector(".widget-padding-handle-bottom-left");

    title.textContent = instance.title || def.title;
    card.dataset.widgetId = instance.id;
    card.dataset.widgetType = instance.type;
    card.dataset.treeId = instance.id;

    if (shell) {
      shell.dataset.treeId = `${instance.id}-1`;
    }
    if (head) {
      head.dataset.treeId = `${instance.id}-1-1`;
    }
    if (body) {
      body.dataset.treeId = `${instance.id}-1-2`;
    }
    if (contentHost) {
      contentHost.dataset.treeId = `${instance.id}-1-2-1`;
    }
    if (contentSlot) {
      contentSlot.dataset.treeId = `${instance.id}-1-2-2`;
    }
    if (resizeHandle) {
      resizeHandle.dataset.treeId = `${instance.id}-1-3`;
    }
    if (paddingHandleTopRight) {
      paddingHandleTopRight.dataset.treeId = `${instance.id}-1-4`;
    }
    if (paddingHandleBottomLeft) {
      paddingHandleBottomLeft.dataset.treeId = `${instance.id}-1-5`;
    }

    if (instance.type === "container") {
      resizeHandle?.remove();
    }

    deps.applyLayout(card, instance.layout, instance.page);
    deps.applyCardVisual(card, instance);
    deps.applyCardStack(card, instance);

    const controller = def.create({
      container: contentSlot || body,
      ...deps.buildWidgetControllerContext({
        widgetId: instance.id,
        getWidget: () => instance,
        getUi: () => deps.getState().ui,
        getAllWidgets: () => deps.getState().instances,
        getWidgetDefinition: (type) => deps.widgetRegistry[type] || null,
        getGridMetrics: () => deps.gridMetrics(),
        getWidgetRuntimeCard: (widgetId) => deps.runtimeMap.get(widgetId)?.card || null,
        patchWidgetConfig: deps.patchWidgetConfig,
        setWidgetContainer: deps.setWidgetContainer,
        releaseWidgetFromContainerByDrop: deps.releaseWidgetFromContainerByDrop,
        reorderWidgetInContainerByIndex: deps.reorderWidgetInContainerByIndex,
        createWidgetDropSilhouette: deps.createWidgetDropSilhouette,
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
      })
    });

    const openSettings = () => {
      if (deps.getState().mode !== "edit") {
        return;
      }
      deps.setSelected(instance.id);
      deps.openWidgetModal(instance.id);
    };

    selectBtn.addEventListener("click", openSettings);
    floatSelectBtn?.addEventListener("click", openSettings);

    const removeCurrent = () => {
      if (deps.getState().mode !== "edit") {
        return;
      }
      deps.removeWidget(instance.id);
    };

    removeBtn.addEventListener("click", removeCurrent);
    floatRemoveBtn?.addEventListener("click", removeCurrent);

    const placeFloatTopAction = (btn) => {
      if (floatSelectBtn?.parentElement === inlineActions) {
        inlineActions.insertBefore(btn, floatSelectBtn);
      } else {
        inlineActions?.prepend(btn);
      }
    };

    const placeFloatBottomAction = (btn) => {
      inlineActionsBottom?.append(btn);
    };

    deps.attachWidgetTypeActions({
      instance,
      controller,
      selectBtn,
      headActions,
      placeFloatTopAction,
      placeFloatBottomAction
    });

    deps.attachWidgetCardClickBehavior({
      card,
      instance,
      isEditMode: () => deps.getState().mode === "edit",
      getLastDragEndAt: deps.getLastDragEndAt,
      setSelected: deps.setSelected,
      openWidgetModal: deps.openWidgetModal,
      toggleContainerExpanded: () => {
        deps.patchWidgetConfig(instance.id, {
          expanded: instance.config?.expanded !== true
        }, { record: false });
      }
    });

    const startDrag = (options = {}) => {
      return deps.startWidgetCardDragSession({
        ...options,
        instance,
        card,
        isEditMode: () => deps.getState().mode === "edit",
        setSelected: deps.setSelected,
        closeBoardContextMenu: deps.closeBoardContextMenu,
        bringWidgetToFront: deps.bringWidgetToFront,
        createDragPreviewSession: deps.createDragPreviewSession,
        createWidgetDropSilhouette: deps.createWidgetDropSilhouette,
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
        currentLauncherPageCount: deps.currentLauncherPageCount,
        currentLauncherActivePage: deps.currentLauncherActivePage,
        setLauncherVirtualPage: deps.setLauncherVirtualPage,
        setLauncherVirtualPageState: deps.setLauncherVirtualPageState,
        applyActiveDragPage: (page) => {
          instance.page = page;
          const state = deps.getState();
          if (state?.ui?.home) {
            state.ui.home.activePage = page;
          }
        },
        renderBoardViewport: deps.renderBoardViewport,
        createDeferredEdgeSwitchScheduler: deps.createDeferredEdgeSwitchScheduler,
        getBoardRect: () => deps.elements.board.getBoundingClientRect(),
        evaluateAndRenderWidgetDragIndicators: deps.evaluateAndRenderWidgetDragIndicators,
        evaluateFinalWidgetDrop: deps.evaluateFinalWidgetDrop,
        resolveDraftPlacementAtPointer: deps.resolveDraftPlacementAtPointer,
        patchWidgetLayout: deps.patchWidgetLayout,
        runtimeMap: deps.runtimeMap,
        applyLayout: deps.applyLayout,
        isGridLayoutMode: deps.isGridLayoutMode,
        recordHistorySnapshot: deps.recordHistorySnapshot,
        gridMetrics: deps.gridMetrics,
        widgetRegistry: deps.widgetRegistry,
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
        queueSave: deps.queueSave,
        updateBoardBounds: deps.updateBoardBounds,
        renderSettings: deps.renderSettings,
        resolveSnappedPosition: deps.resolveSnappedPosition,
        snap: deps.snap,
        windowObj: deps.windowObj
      });
    };

    const longPressDragController = deps.createLongPressDragController({
      card,
      widgetLongPressState: deps.widgetLongPressState,
      isEditMode: () => deps.getState().mode === "edit",
      onTrigger: ({ target, startX, startY }) => {
        startDrag({
          event: null,
          target,
          fromHandleButton: false,
          startX,
          startY,
          allowUseMode: true,
          fromLongPress: true
        });
      },
      isShortcutTarget: (target) => Boolean(target?.closest(".shortcut-tile")),
      longPressDelayMs: deps.longPressDelayMs,
      shortcutDelayMs: deps.shortcutDelayMs,
      baseMoveTolerance: deps.baseMoveTolerance,
      shortcutMoveToleranceDelta: 10,
      eventTarget: deps.windowObj,
      timerApi: deps.windowObj
    });

    const scheduleLongPressDrag = (event, target) => {
      return longPressDragController.schedule(event, target);
    };

    const startPaddingDrag = (event, corner) => {
      deps.startWidgetPaddingDragSession({
        event,
        corner,
        instance,
        isEditMode: () => deps.getState().mode === "edit",
        setSelected: deps.setSelected,
        widgetPaddingFallback: deps.widgetPaddingFallback,
        resolveWidgetPadding: deps.resolveWidgetPadding,
        normalizeContentPadding: deps.normalizeContentPadding,
        projectContentPaddingFromDrag: deps.projectContentPaddingFromDrag,
        hasContentPaddingChanged: deps.hasContentPaddingChanged,
        recordHistorySnapshot: deps.recordHistorySnapshot,
        runtimeMap: deps.runtimeMap,
        applyCardVisual: deps.applyCardVisual,
        modalState: deps.modalState,
        renderSettings: deps.renderSettings,
        queueSave: deps.queueSave,
        setLastDragEndAt: deps.setLastDragEndAt,
        eventTarget: deps.windowObj
      });
    };

    deps.attachWidgetCardInteractionEvents({
      head,
      title,
      card,
      dragBtn,
      paddingHandleTopRight,
      paddingHandleBottomLeft,
      instance,
      isEditMode: () => deps.getState().mode === "edit",
      hasPointerEvent: () => typeof deps.windowObj.PointerEvent !== "undefined",
      startDrag,
      scheduleLongPressDrag,
      startPaddingDrag,
      openWidgetTitleRenameModal: deps.openWidgetTitleRenameModal
    });

    deps.attachWidgetResizeHandle({
      resizeHandle,
      instance,
      isEditMode: () => deps.getState().mode === "edit",
      setSelected: deps.setSelected,
      isGridLayoutMode: deps.isGridLayoutMode,
      recordHistorySnapshot: deps.recordHistorySnapshot,
      gridMetrics: deps.gridMetrics,
      normalizeGridLayout: deps.normalizeGridLayout,
      widgetDefaultGridSize: deps.widgetDefaultGridSize,
      widgetRegistry: deps.widgetRegistry,
      startGridResizeSession: deps.startGridResizeSession,
      applyGridLayout: deps.applyGridLayout,
      queueSave: deps.queueSave,
      setLastDragEndAt: deps.setLastDragEndAt,
      startFreeResizeSession: deps.startFreeResizeSession,
      patchWidgetLayout: deps.patchWidgetLayout,
      getBoardRect: () => deps.elements.board.getBoundingClientRect(),
      snap: deps.snap,
      eventTarget: deps.windowObj
    });

    deps.elements.board.append(card);
    deps.runtimeMap.set(instance.id, {
      card,
      controller,
      instance,
      type: instance.type
    });
  }

  return {
    createWidgetCard
  };
}
