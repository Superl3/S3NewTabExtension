const INTERACTIVE_DRAG_BLOCK_SELECTOR = "button, input, textarea, select, [contenteditable='true']";

export function startDockWidgetDragSession({
  event,
  card,
  item,
  closeBoardContextMenu,
  createDragPreviewSession,
  runtimeMap,
  createWidgetDropSilhouette,
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
  setActiveLauncherPage,
  createDeferredEdgeSwitchScheduler,
  isDockDropPoint,
  persistentDockElement,
  evaluateAndRenderWidgetDragIndicators,
  evaluateFinalWidgetDrop,
  clearWidgetDragGuideState,
  setDockDropTargetActive,
  setContainerDropTargetActive,
  setWidgetDropSilhouetteVisible,
  applyWidgetDropPlan,
  releaseWidgetFromDockByDrop,
  removeDragPointerListeners,
  setLastDragEndAt,
  windowObj,
  performanceNow = () => performance.now(),
  nowMs = () => Date.now()
} = {}) {
  if (!event || !item || !card || !windowObj) {
    return false;
  }
  if (event.button !== 0) {
    return false;
  }
  if (event?.target?.closest?.(INTERACTIVE_DRAG_BLOCK_SELECTOR)) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  closeBoardContextMenu?.();

  card.classList.add("widget-drag-active");

  const previewSession = createDragPreviewSession?.(item, {
    sourceCard: card,
    pointerEvent: event,
    pointerX: event.clientX,
    pointerY: event.clientY
  });
  if (!previewSession) {
    card.classList.remove("widget-drag-active");
    return false;
  }

  card.classList.add("dock-widget-item-dragging");
  card.classList.add("widget-drag-origin-hidden");
  card.style.animation = "widget-drag-jiggle 340ms cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite";
  card.style.transformOrigin = "50% 0%";
  setLauncherDragPlaceholderPolicy?.(true);
  const sourceCard = runtimeMap?.get?.(item.id)?.card;
  sourceCard?.classList?.add("widget-drag-active");
  sourceCard?.classList?.add("widget-drag-origin-hidden");

  const dropSilhouette = createWidgetDropSilhouette?.(sourceCard || card);
  setDragDeleteZoneActive?.(true);

  let lastPointerX = event.clientX;
  let lastPointerY = event.clientY;
  updateDragDeleteZoneHover?.(lastPointerX, lastPointerY);
  const pageSwitchThreshold = 42;
  const pageSwitchHoldMs = 280;
  const pageSwitchCooldownMs = 190;
  let lastPageSwitchAt = 0;
  let dragReleasePage = Number(currentLauncherActivePage?.());
  if (!Number.isFinite(dragReleasePage)) {
    dragReleasePage = 0;
  }
  let lastDropPlan = createNoneDropPlan?.();

  const edgeDirectionFromPointer = (clientX) => {
    return resolveEdgeDirectionFromPointer?.(clientX, getLauncherViewportRect?.(), pageSwitchThreshold);
  };

  const commitPageSwitch = (direction) => {
    if (!direction) {
      return false;
    }

    const now = performanceNow();
    if (now - lastPageSwitchAt < pageSwitchCooldownMs) {
      return false;
    }

    const home = syncLauncherPagingState?.({ expandToFitInstances: true });
    const pageCount = home?.pageCount ?? 1;
    const minPage = isLauncherPlaceholderPolicyActive?.() ? -1 : 0;
    const maxPage = isLauncherPlaceholderPolicyActive?.() ? pageCount : pageCount - 1;
    const nextPage = dragReleasePage + direction;

    if (nextPage < minPage || nextPage > maxPage) {
      return false;
    }

    dragReleasePage = nextPage;
    lastPageSwitchAt = now;

    if (isPlaceholderLauncherPage?.(nextPage, currentLauncherPageCount?.())) {
      setLauncherVirtualPage?.(nextPage, { animate: true });
    } else {
      setLauncherVirtualPageState?.(null);
      setActiveLauncherPage?.(nextPage, { shouldSave: false, animate: true });
    }
    return true;
  };

  const pageSwitchScheduler = createDeferredEdgeSwitchScheduler?.({
    holdMs: pageSwitchHoldMs,
    edgeDirectionFromPointer,
    getPointerX: () => lastPointerX,
    onTriggered: (direction) => commitPageSwitch(direction)
  });

  const resetPendingPageSwitch = () => {
    pageSwitchScheduler?.reset?.();
  };

  const schedulePageSwitch = (direction) => {
    return pageSwitchScheduler?.schedule?.(direction);
  };

  const updateGhost = (clientX, clientY) => {
    previewSession.update(clientX, clientY);
    lastPointerX = clientX;
    lastPointerY = clientY;
    const insideDock = isDockDropPoint?.(clientX, clientY);
    persistentDockElement?.classList?.toggle?.("is-drag-out-active", !insideDock);

    if (!insideDock) {
      schedulePageSwitch(edgeDirectionFromPointer(clientX));
    }

    const pointerEvaluation = evaluateAndRenderWidgetDragIndicators?.(item, {
      previewSession,
      clientX,
      clientY,
      page: dragReleasePage,
      pageFallback: dragReleasePage,
      silhouette: dropSilhouette,
      suppressSurfaceTargets: false,
      allowDeleteZone: true
    });
    lastDropPlan = pointerEvaluation?.dropPlan ?? lastDropPlan;
  };

  updateGhost(event.clientX, event.clientY);

  const detachPointerListeners = () => {
    if (typeof removeDragPointerListeners === "function") {
      removeDragPointerListeners(move, finish);
      return;
    }
    windowObj.removeEventListener("pointermove", move);
    windowObj.removeEventListener("pointerup", finish);
    windowObj.removeEventListener("pointercancel", finish);
  };

  const finish = (upEvent) => {
    detachPointerListeners();

    resetPendingPageSwitch();
    setLauncherDragPlaceholderPolicy?.(false);
    const finalDropOutcome = evaluateFinalWidgetDrop?.(item, {
      pointerEvent: upEvent,
      fallbackX: event.clientX,
      fallbackY: event.clientY,
      previewSession,
      page: dragReleasePage,
      pageFallback: dragReleasePage,
      suppressSurfaceTargets: false,
      allowDeleteZone: true
    });
    const finalPayload = finalDropOutcome?.finalPayload;
    const finalDropPlan = finalDropOutcome?.finalDropPlan;
    lastDropPlan = finalDropPlan ?? lastDropPlan;

    persistentDockElement?.classList?.remove?.("is-drag-out-active");
    clearWidgetDragGuideState?.();
    setDockDropTargetActive?.(false);
    setContainerDropTargetActive?.("");
    setWidgetDropSilhouetteVisible?.(dropSilhouette, false);
    dropSilhouette?.remove?.();
    setDragDeleteZoneActive?.(false);
    card.classList.remove("dock-widget-item-dragging");
    card.classList.remove("widget-drag-active");
    card.classList.remove("widget-drag-origin-hidden");
    card.style.removeProperty("animation");
    card.style.removeProperty("transform-origin");
    sourceCard?.classList?.remove?.("widget-drag-active");
    sourceCard?.classList?.remove?.("widget-drag-origin-hidden");
    previewSession.dispose();

    card.dataset.suppressClick = "true";
    setLastDragEndAt?.(nowMs());
    if (applyWidgetDropPlan?.(item, lastDropPlan, finalPayload, { record: true })) {
      return;
    }

    releaseWidgetFromDockByDrop?.(item.id, finalPayload);
  };

  const move = (moveEvent) => {
    updateGhost(moveEvent.clientX, moveEvent.clientY);
  };

  windowObj.addEventListener("pointermove", move);
  windowObj.addEventListener("pointerup", finish);
  windowObj.addEventListener("pointercancel", finish);
  return true;
}
