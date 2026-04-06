export function createBoardWheelState() {
  return {
    accumulatedX: 0,
    lastEventAt: 0,
    cooldownUntil: 0
  };
}

export function resolveBoardWheelAxisDelta(event) {
  const deltaX = Number(event?.deltaX) || 0;
  const deltaY = Number(event?.deltaY) || 0;
  return Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
}

export function handleBoardWheelNavigate(event, {
  boardWheelState,
  boardSwipeState,
  state,
  elements,
  syncLauncherPagingState,
  currentLauncherViewportPage,
  currentLauncherActivePage,
  resolveBoardSwipeThreshold,
  resolveBoardSwipeNextPage,
  isPlaceholderLauncherPage,
  setLauncherVirtualPage,
  setActiveLauncherPage,
  canStartBoardSwipeFromTarget,
  isTextEditableTarget,
  modalState,
  isAddWidgetModalOpen,
  shortcutIconEditorState,
  isDockSettingsModalOpen,
  nowMs = () => Date.now(),
  resetGapMs = 120,
  cooldownMs = 220
} = {}) {
  if (!event || !boardWheelState || !state?.ui?.home || !elements?.board) {
    return false;
  }
  if (typeof resolveBoardSwipeThreshold !== "function" || typeof resolveBoardSwipeNextPage !== "function") {
    return false;
  }
  if (boardSwipeState?.active) {
    return false;
  }

  const target = event.target;
  if (!canStartBoardSwipeFromTarget?.(target) || isTextEditableTarget?.(target)) {
    return false;
  }
  if (modalState?.open || isAddWidgetModalOpen?.() || shortcutIconEditorState?.open || isDockSettingsModalOpen?.()) {
    return false;
  }

  const now = Number(nowMs?.()) || Date.now();
  const cooldownUntil = Number(boardWheelState.cooldownUntil) || 0;
  if (now < cooldownUntil) {
    return false;
  }

  const lastEventAt = Number(boardWheelState.lastEventAt) || 0;
  if (lastEventAt <= 0 || now - lastEventAt > resetGapMs) {
    boardWheelState.accumulatedX = 0;
  }

  boardWheelState.lastEventAt = now;
  boardWheelState.accumulatedX += resolveBoardWheelAxisDelta(event);

  const threshold = resolveBoardSwipeThreshold(elements.board.clientWidth || 1) || 0;
  if (Math.abs(boardWheelState.accumulatedX) < threshold) {
    return false;
  }

  const home = syncLauncherPagingState?.({ expandToFitInstances: true }) || { pageCount: 1 };
  const pageCount = home.pageCount;
  const activePage = state.mode === "edit" ? currentLauncherViewportPage?.() : currentLauncherActivePage?.();
  const minPage = state.mode === "edit" ? -1 : 0;
  const maxPage = state.mode === "edit" ? pageCount : Math.max(0, pageCount - 1);
  const nextPage = resolveBoardSwipeNextPage({
    dx: boardWheelState.accumulatedX,
    velocity: 0,
    activePage,
    minPage,
    maxPage,
    threshold
  });

  boardWheelState.accumulatedX = 0;
  if (nextPage === activePage) {
    return false;
  }

  if (state.mode === "edit" && isPlaceholderLauncherPage?.(nextPage, pageCount)) {
    setLauncherVirtualPage?.(nextPage, { animate: true });
  } else {
    setActiveLauncherPage?.(nextPage, { shouldSave: true, animate: true });
  }

  boardWheelState.cooldownUntil = now + cooldownMs;
  event.preventDefault?.();
  return true;
}
