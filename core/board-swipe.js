import { clampFiniteOrMin } from "./utils/number.js";

export function resolveBoardSwipeStartState(dx, dy, { minDx = 3, axisRatio = 0.55 } = {}) {
  const absX = Math.abs(Number(dx) || 0);
  const absY = Math.abs(Number(dy) || 0);

  if (absX < minDx) {
    return "pending";
  }

  if (absX < absY * axisRatio) {
    return "cancel";
  }

  return "start";
}

export function resolveBoardSwipeThreshold(boardWidth, { min = 34, max = 130, ratio = 0.14 } = {}) {
  const width = Number.isFinite(Number(boardWidth)) ? Number(boardWidth) : 1;
  const raw = Math.round(width * ratio);
  return clampFiniteOrMin(raw, min, max);
}

export function resolveBoardSwipeNextPage(
  {
    dx,
    velocity,
    activePage,
    minPage,
    maxPage,
    threshold
  } = {},
  { velocityThreshold = 0.42 } = {}
) {
  const currentPage = Number.isFinite(Number(activePage)) ? Number(activePage) : 0;
  let nextPage = currentPage;
  const deltaX = Number(dx) || 0;
  const speed = Number(velocity) || 0;

  if (deltaX <= -threshold || speed <= -velocityThreshold) {
    nextPage = currentPage + 1;
  } else if (deltaX >= threshold || speed >= velocityThreshold) {
    nextPage = currentPage - 1;
  }

  return clampFiniteOrMin(nextPage, minPage, maxPage);
}
