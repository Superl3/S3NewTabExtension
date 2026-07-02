import { toTruthyNumberOrFallback } from "./utils/number.js";

export function beginBoardSwipeSession(event, {
  elements,
  state,
  widgetLongPressState,
  boardSwipeState,
  canStartBoardSwipeFromTarget,
  modalState,
  isAddWidgetModalOpen,
  shortcutIconEditorState,
  isDockSettingsModalOpen,
  performanceNow = () => performance.now()
} = {}) {
  if (!event || !elements || !boardSwipeState || !state) {
    return;
  }
  if (!elements.board || !state?.ui?.home) {
    return;
  }
  if (widgetLongPressState?.pending) {
    return;
  }
  if (boardSwipeState.active) {
    return;
  }
  if (Number.isFinite(event.button) && event.button !== 0) {
    return;
  }
  if (!canStartBoardSwipeFromTarget?.(event.target)) {
    return;
  }
  if (modalState?.open || isAddWidgetModalOpen?.() || shortcutIconEditorState?.open || isDockSettingsModalOpen?.()) {
    return;
  }
  const captureHost =
    typeof Element !== "undefined" && event.currentTarget instanceof Element
      ? event.currentTarget
      : elements.workspace || elements.board;

  boardSwipeState.active = true;
  boardSwipeState.pointerId = event.pointerId;
  boardSwipeState.captureTarget = captureHost;
  boardSwipeState.startX = event.clientX;
  boardSwipeState.startY = event.clientY;
  boardSwipeState.startAt = toTruthyNumberOrFallback(performanceNow?.(), Date.now);
  boardSwipeState.dragOffsetX = 0;
  boardSwipeState.dragging = false;
  captureHost?.setPointerCapture?.(event.pointerId);
}

export function moveBoardSwipeSession(event, {
  boardSwipeState,
  resolveBoardSwipeStartState,
  endBoardSwipe,
  renderBoardViewport
} = {}) {
  if (!event || !boardSwipeState) {
    return;
  }
  if (!boardSwipeState.active || boardSwipeState.pointerId !== event.pointerId) {
    return;
  }

  const dx = event.clientX - boardSwipeState.startX;
  const dy = event.clientY - boardSwipeState.startY;

  if (!boardSwipeState.dragging) {
    const startState = resolveBoardSwipeStartState?.(dx, dy);
    if (startState === "pending") {
      return;
    }
    if (startState === "cancel") {
      endBoardSwipe?.(event, { cancelled: true });
      return;
    }
    boardSwipeState.dragging = true;
  }

  boardSwipeState.dragOffsetX = dx;
  renderBoardViewport?.({ dragOffsetX: dx, animate: false, dragging: true });
  event.preventDefault?.();
}

export function endBoardSwipeSession(event, { cancelled = false } = {}, {
  state,
  elements,
  boardSwipeState,
  syncLauncherPagingState,
  currentLauncherViewportPage,
  currentLauncherActivePage,
  resolveBoardSwipeThreshold,
  resolveBoardSwipeNextPage,
  isPlaceholderLauncherPage,
  setLauncherVirtualPage,
  setActiveLauncherPage,
  renderBoardViewport,
  setLastDragEndAt,
  performanceNow = () => performance.now(),
  nowMs = () => Date.now()
} = {}) {
  if (!event || !boardSwipeState || !state) {
    return;
  }
  if (!boardSwipeState.active || boardSwipeState.pointerId !== event.pointerId) {
    return;
  }

  const dx = event.clientX - boardSwipeState.startX;
  const elapsed = Math.max(1, toTruthyNumberOrFallback(performanceNow?.(), Date.now) - boardSwipeState.startAt);
  const velocity = dx / elapsed;
  const didDrag = boardSwipeState.dragging;

  boardSwipeState.active = false;
  boardSwipeState.pointerId = null;
  const captureHost = boardSwipeState.captureTarget;
  boardSwipeState.captureTarget = null;
  boardSwipeState.startX = 0;
  boardSwipeState.startY = 0;
  boardSwipeState.startAt = 0;
  boardSwipeState.dragOffsetX = 0;
  boardSwipeState.dragging = false;
  captureHost?.releasePointerCapture?.(event.pointerId);

  if (cancelled || !didDrag) {
    renderBoardViewport?.({ dragOffsetX: 0, animate: true, dragging: false });
    return;
  }

  const home = syncLauncherPagingState?.({ expandToFitInstances: true }) || { pageCount: 1 };
  const pageCount = home.pageCount;
  const activePage = state.mode === "edit" ? currentLauncherViewportPage?.() : currentLauncherActivePage?.();
  const minPage = state.mode === "edit" ? -1 : 0;
  const maxPage = state.mode === "edit" ? pageCount : Math.max(0, pageCount - 1);
  const threshold = resolveBoardSwipeThreshold?.(elements?.board?.clientWidth || 1) || 0;
  const nextPage = resolveBoardSwipeNextPage?.({
    dx,
    velocity,
    activePage,
    minPage,
    maxPage,
    threshold
  });
  if (state.mode === "edit" && isPlaceholderLauncherPage?.(nextPage, pageCount)) {
    setLauncherVirtualPage?.(nextPage, { animate: true });
  } else {
    setActiveLauncherPage?.(nextPage, { shouldSave: true, animate: true });
  }
  setLastDragEndAt?.(nowMs());
}
