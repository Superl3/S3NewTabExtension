const INTERACTIVE_DRAG_BLOCK_SELECTOR = "button, input, textarea, select, a";
const PAGE_SWITCH_THRESHOLD = 42;
const PAGE_SWITCH_HOLD_MS = 280;
const PAGE_SWITCH_COOLDOWN_MS = 190;

function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.floor(numeric);
}

function applyClamp(clampFn, value, min, max) {
  if (typeof clampFn === "function") {
    return clampFn(value, min, max);
  }
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : min;
  return Math.min(max, Math.max(min, safeValue));
}

export function startWidgetCardDragSession({
  event = null,
  target = null,
  fromHandleButton = false,
  startX = null,
  startY = null,
  allowUseMode = false,
  fromLongPress = false,
  instance,
  card,
  isEditMode,
  setSelected,
  closeBoardContextMenu,
  bringWidgetToFront,
  createDragPreviewSession,
  createWidgetDropSilhouette,
  setWidgetDropSilhouetteVisible,
  setDragDeleteZoneActive,
  setLauncherDragPlaceholderPolicy,
  updateDragDeleteZoneHover,
  createNoneDropPlan,
  resolveEdgeDirectionFromPointer,
  getLauncherViewportRect,
  syncLauncherPagingState,
  isLauncherPlaceholderPolicyActive,
  isPlaceholderLauncherPage,
  currentLauncherPageCount,
  currentLauncherActivePage,
  setLauncherVirtualPage,
  setLauncherVirtualPageState,
  applyActiveDragPage,
  renderBoardViewport,
  createDeferredEdgeSwitchScheduler,
  getBoardRect,
  evaluateAndRenderWidgetDragIndicators,
  evaluateFinalWidgetDrop,
  resolveDraftPlacementAtPointer,
  patchWidgetLayout,
  runtimeMap,
  applyLayout,
  isGridLayoutMode,
  recordHistorySnapshot,
  gridMetrics,
  widgetRegistry,
  widgetDefaultGridSize,
  normalizeGridLayout,
  clamp,
  resolveBoundedDragPositionFromDelta,
  cleanupBoardDragSession,
  applyWidgetDropPlan,
  clearPendingPlaceholderDrop,
  normalizeWidgetPage,
  applyGridLayout,
  compactEmptyLauncherPagesForUseMode,
  queueSave,
  updateBoardBounds,
  renderSettings,
  resolveSnappedPosition,
  snap = 20,
  windowObj,
  performanceNow = () => performance.now()
} = {}) {
  if (!instance || !card || !windowObj) {
    return false;
  }

  const editMode = Boolean(isEditMode?.());
  if (!editMode && !allowUseMode) {
    return false;
  }
  if (event && Number.isFinite(event.button) && event.button !== 0 && event.button !== -1) {
    return false;
  }
  if (!fromHandleButton && !allowUseMode && target?.closest?.(INTERACTIVE_DRAG_BLOCK_SELECTOR)) {
    return false;
  }

  event?.stopPropagation?.();
  event?.preventDefault?.();
  closeBoardContextMenu?.();

  if (editMode) {
    setSelected?.(instance.id);
  }

  const dragStartX = Number.isFinite(startX) ? startX : event?.clientX;
  const dragStartY = Number.isFinite(startY) ? startY : event?.clientY;
  if (!Number.isFinite(dragStartX) || !Number.isFinite(dragStartY)) {
    return false;
  }

  if (fromLongPress) {
    card.classList.remove("longpress-drag-armed");
  }

  bringWidgetToFront?.(instance.id);
  card.classList.add("widget-drag-active");
  const previewSession = createDragPreviewSession?.(instance, {
    sourceCard: card,
    pointerEvent: event,
    pointerX: dragStartX,
    pointerY: dragStartY
  });
  if (!previewSession) {
    card.classList.remove("widget-drag-active");
    return false;
  }

  card.classList.add("widget-drag-origin-hidden");
  const dropSilhouette = createWidgetDropSilhouette?.(card);
  const hideAndRemoveDropSilhouette = () => {
    setWidgetDropSilhouetteVisible?.(dropSilhouette, false);
    dropSilhouette?.remove?.();
  };
  setDragDeleteZoneActive?.(true);
  setLauncherDragPlaceholderPolicy?.(true);
  updateDragDeleteZoneHover?.(dragStartX, dragStartY);
  previewSession.update?.(dragStartX, dragStartY);

  let lastPageSwitchAt = 0;
  let pageChangedDuringDrag = false;
  let dragReleasePage =
    typeof normalizeWidgetPage === "function"
      ? normalizeWidgetPage(instance.page, currentLauncherPageCount?.(), currentLauncherActivePage?.())
      : toInteger(instance.page, 0);
  let lastDropPlan = createNoneDropPlan?.();

  const edgeDirectionFromPointer = (clientX) => {
    return resolveEdgeDirectionFromPointer?.(clientX, getLauncherViewportRect?.(), PAGE_SWITCH_THRESHOLD) || 0;
  };

  let lastPointerX = dragStartX;
  let lastPointerY = dragStartY;
  const boardRect = getBoardRect?.() || null;

  const commitPageSwitch = (direction, moveEvent, onSwitched = null) => {
    if (!direction) {
      return false;
    }

    const now = Number(performanceNow?.()) || Date.now();
    if (now - lastPageSwitchAt < PAGE_SWITCH_COOLDOWN_MS) {
      return false;
    }

    const home = syncLauncherPagingState?.({ expandToFitInstances: true }) || {};
    const pageCount = Math.max(
      1,
      toInteger(home.pageCount, Math.max(1, toInteger(currentLauncherPageCount?.(), 1)))
    );
    const minPage = isLauncherPlaceholderPolicyActive?.() ? -1 : 0;
    const currentPage = dragReleasePage;
    const nextPage = currentPage + direction;
    const maxPage = isLauncherPlaceholderPolicyActive?.() ? pageCount : pageCount - 1;

    if (nextPage < minPage || nextPage > maxPage) {
      return false;
    }

    dragReleasePage = nextPage;
    if (isPlaceholderLauncherPage?.(nextPage, currentLauncherPageCount?.())) {
      setLauncherVirtualPage?.(nextPage, { animate: true });
    } else {
      setLauncherVirtualPageState?.(null);
      applyActiveDragPage?.(nextPage);
    }
    pageChangedDuringDrag = true;
    lastPageSwitchAt = now;

    if (typeof onSwitched === "function") {
      onSwitched(direction, nextPage, currentPage, moveEvent);
    }

    renderBoardViewport?.({ animate: true, dragging: false, dragOffsetX: 0 });
    return true;
  };

  const pageSwitchScheduler = createDeferredEdgeSwitchScheduler?.({
    holdMs: PAGE_SWITCH_HOLD_MS,
    edgeDirectionFromPointer,
    getPointerX: () => lastPointerX,
    onTriggered: (direction, context) => {
      const syntheticEvent = {
        clientX: lastPointerX,
        clientY: lastPointerY
      };
      return commitPageSwitch(direction, syntheticEvent, context?.onSwitched || null);
    }
  });

  const resetPendingPageSwitch = () => {
    pageSwitchScheduler?.reset?.();
  };

  const schedulePageSwitch = (direction, moveEvent, onSwitched = null) => {
    return pageSwitchScheduler?.schedule?.(direction, { moveEvent, onSwitched }) || false;
  };

  const evaluateDragIndicatorsAtPointer = (clientX, clientY) => {
    const pointerEvaluation = evaluateAndRenderWidgetDragIndicators?.(instance, {
      previewSession,
      clientX,
      clientY,
      page: dragReleasePage,
      pageFallback: dragReleasePage,
      silhouette: dropSilhouette,
      suppressSurfaceTargets: false,
      allowDeleteZone: true
    });
    if (pointerEvaluation?.dropPlan) {
      lastDropPlan = pointerEvaluation.dropPlan;
    }
    return pointerEvaluation;
  };

  const resolveFinalDropOutcome = (pointerEvent, fallbackX, fallbackY) => {
    const finalDropOutcome = evaluateFinalWidgetDrop?.(instance, {
      pointerEvent,
      fallbackX,
      fallbackY,
      previewSession,
      page: dragReleasePage,
      pageFallback: dragReleasePage,
      suppressSurfaceTargets: false,
      allowDeleteZone: true
    });
    if (finalDropOutcome?.finalDropPlan) {
      lastDropPlan = finalDropOutcome.finalDropPlan;
    }
    return finalDropOutcome || {
      finalPayload: {
        clientX: fallbackX,
        clientY: fallbackY,
        page: dragReleasePage
      },
      finalDropPlan: lastDropPlan
    };
  };

  const placeDraftAtPointerInCurrentViewport = (clientX, clientY, { commit = false } = {}) => {
    const nextPlacement = resolveDraftPlacementAtPointer?.(clientX, clientY, {
      viewportRect: getLauncherViewportRect?.(),
      boardRect,
      layout: instance.layout,
      pointerOffset: previewSession.getPointerOffset?.()
    });
    if (!nextPlacement) {
      return;
    }
    if (commit) {
      patchWidgetLayout?.(
        instance.id,
        {
          x: nextPlacement.x,
          y: nextPlacement.y
        },
        { record: false }
      );
      const rt = runtimeMap?.get?.(instance.id);
      if (rt?.card) {
        applyLayout?.(rt.card, instance.layout, instance.page);
      }
    } else {
      instance.layout.x = nextPlacement.x;
      instance.layout.y = nextPlacement.y;
    }
    lastPointerX = clientX;
    lastPointerY = clientY;
  };

  if (isGridLayoutMode?.()) {
    recordHistorySnapshot?.("Move widget");
    const metrics = gridMetrics?.();
    const defForGrid = widgetRegistry?.[instance.type];
    const gridFallback = {
      col: 0,
      row: 0,
      ...(widgetDefaultGridSize?.(instance.type, defForGrid) || {})
    };
    const stepX = Math.max(1, (Number(metrics?.cellW) || 0) + (Number(metrics?.gapX) || 0));
    const stepY = Math.max(1, (Number(metrics?.cellH) || 0) + (Number(metrics?.gapY) || 0));

    const projectedGridDropLayout = () => {
      const currentGrid = normalizeGridLayout?.(instance.gridLayout, gridFallback) || gridFallback;
      const maxCol = Math.max(0, (Number(metrics?.cols) || 0) - currentGrid.colSpan);
      const maxRow = Math.max(0, (Number(metrics?.rows) || 0) - currentGrid.rowSpan);
      const snappedCol = applyClamp(
        clamp,
        Math.round((instance.layout.x - (Number(metrics?.marginX) || 0)) / stepX),
        0,
        maxCol
      );
      const snappedRow = applyClamp(
        clamp,
        Math.round((instance.layout.y - (Number(metrics?.marginY) || 0)) / stepY),
        0,
        maxRow
      );

      return {
        grid: {
          ...currentGrid,
          col: snappedCol,
          row: snappedRow
        },
        layout: {
          x: (Number(metrics?.marginX) || 0) + snappedCol * stepX,
          y: (Number(metrics?.marginY) || 0) + snappedRow * stepY,
          w: (Number(metrics?.cellW) || 0) * currentGrid.colSpan + (Number(metrics?.gapX) || 0) * (currentGrid.colSpan - 1),
          h: (Number(metrics?.cellH) || 0) * currentGrid.rowSpan + (Number(metrics?.gapY) || 0) * (currentGrid.rowSpan - 1)
        }
      };
    };

    const snapLayoutToGrid = () => {
      const projected = projectedGridDropLayout();
      instance.gridLayout = projected.grid;
      instance.layout.x = projected.layout.x;
      instance.layout.y = projected.layout.y;
      instance.layout.w = projected.layout.w;
      instance.layout.h = projected.layout.h;
    };

    const move = (moveEvent) => {
      previewSession.update?.(moveEvent.clientX, moveEvent.clientY);
      const dx = moveEvent.clientX - lastPointerX;
      const dy = moveEvent.clientY - lastPointerY;
      lastPointerX = moveEvent.clientX;
      lastPointerY = moveEvent.clientY;

      const bounded = resolveBoundedDragPositionFromDelta?.(instance.layout, dx, dy, boardRect) || instance.layout;
      instance.layout.x = bounded.x;
      instance.layout.y = bounded.y;

      const direction = edgeDirectionFromPointer(moveEvent.clientX);
      schedulePageSwitch(direction, moveEvent, () => {
        placeDraftAtPointerInCurrentViewport(moveEvent.clientX, moveEvent.clientY);
      });

      evaluateDragIndicatorsAtPointer(moveEvent.clientX, moveEvent.clientY);
    };

    const up = (upEvent) => {
      const finalDropOutcome = resolveFinalDropOutcome(upEvent, lastPointerX, lastPointerY);
      const finalPayload = finalDropOutcome.finalPayload;

      cleanupBoardDragSession?.({
        moveHandler: move,
        upHandler: up,
        resetPendingPageSwitch,
        hideAndRemoveDropSilhouette,
        card,
        previewSession
      });

      if (applyWidgetDropPlan?.(instance, lastDropPlan, finalPayload, { record: false })) {
        return;
      }

      clearPendingPlaceholderDrop?.({ clearVirtualPage: true });

      snapLayoutToGrid();
      instance.page =
        typeof normalizeWidgetPage === "function"
          ? normalizeWidgetPage(dragReleasePage, currentLauncherPageCount?.(), currentLauncherActivePage?.())
          : dragReleasePage;
      applyGridLayout?.({ commitFreeLayout: false, shouldSave: false });
      compactEmptyLauncherPagesForUseMode?.();
      queueSave?.();
    };

    windowObj.addEventListener("pointermove", move);
    windowObj.addEventListener("pointerup", up);
    windowObj.addEventListener("pointercancel", up);
    evaluateDragIndicatorsAtPointer(dragStartX, dragStartY);
    return true;
  }

  const move = (moveEvent) => {
    previewSession.update?.(moveEvent.clientX, moveEvent.clientY);
    const dx = moveEvent.clientX - lastPointerX;
    const dy = moveEvent.clientY - lastPointerY;
    lastPointerX = moveEvent.clientX;
    lastPointerY = moveEvent.clientY;

    const bounded = resolveBoundedDragPositionFromDelta?.(instance.layout, dx, dy, boardRect) || instance.layout;

    patchWidgetLayout?.(
      instance.id,
      {
        x: bounded.x,
        y: bounded.y
      },
      { record: false }
    );

    const direction = edgeDirectionFromPointer(moveEvent.clientX);
    schedulePageSwitch(direction, moveEvent, () => {
      placeDraftAtPointerInCurrentViewport(moveEvent.clientX, moveEvent.clientY, { commit: true });
    });
    evaluateDragIndicatorsAtPointer(moveEvent.clientX, moveEvent.clientY);
  };

  const up = (upEvent) => {
    const finalDropOutcome = resolveFinalDropOutcome(upEvent, lastPointerX, lastPointerY);
    const finalPayload = finalDropOutcome.finalPayload;

    cleanupBoardDragSession?.({
      moveHandler: move,
      upHandler: up,
      resetPendingPageSwitch,
      hideAndRemoveDropSilhouette,
      card,
      previewSession
    });

    if (applyWidgetDropPlan?.(instance, lastDropPlan, finalPayload, { record: true })) {
      return;
    }

    clearPendingPlaceholderDrop?.({ clearVirtualPage: true });
    instance.page =
      typeof normalizeWidgetPage === "function"
        ? normalizeWidgetPage(dragReleasePage, currentLauncherPageCount?.(), currentLauncherActivePage?.())
        : dragReleasePage;

    const snapped = resolveSnappedPosition?.(instance.layout.x, instance.layout.y, snap) || {
      x: instance.layout.x,
      y: instance.layout.y,
      changed: false
    };

    if (snapped.changed) {
      patchWidgetLayout?.(
        instance.id,
        {
          x: snapped.x,
          y: snapped.y
        },
        { label: "Move widget" }
      );
      return;
    }

    if (pageChangedDuringDrag) {
      recordHistorySnapshot?.("Move widget");
      compactEmptyLauncherPagesForUseMode?.();
      updateBoardBounds?.();
      renderSettings?.();
      queueSave?.();
    }
  };

  windowObj.addEventListener("pointermove", move);
  windowObj.addEventListener("pointerup", up);
  windowObj.addEventListener("pointercancel", up);
  evaluateDragIndicatorsAtPointer(dragStartX, dragStartY);

  return true;
}
