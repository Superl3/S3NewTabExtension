import { clampFiniteOrMin, toFiniteNumber } from "./utils/number.js";

export function resolveBoardSwipeStartState(dx, dy, { minDx = 3, axisRatio = 0.55 } = {}) {
  const absX = Math.abs(toFiniteNumber(dx, 0));
  const absY = Math.abs(toFiniteNumber(dy, 0));

  if (absX < minDx) {
    return "pending";
  }

  if (absX < absY * axisRatio) {
    return "cancel";
  }

  return "start";
}

export function resolveBoardSwipeThreshold(boardWidth, { min = 34, max = 130, ratio = 0.14 } = {}) {
  const width = toFiniteNumber(boardWidth, 1);
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
  const currentPage = toFiniteNumber(activePage, 0);
  let nextPage = currentPage;
  const deltaX = toFiniteNumber(dx, 0);
  const speed = toFiniteNumber(velocity, 0);

  if (deltaX <= -threshold || speed <= -velocityThreshold) {
    nextPage = currentPage + 1;
  } else if (deltaX >= threshold || speed >= velocityThreshold) {
    nextPage = currentPage - 1;
  }

  return clampFiniteOrMin(nextPage, minPage, maxPage);
}
