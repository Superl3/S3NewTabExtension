import { clampFiniteOrMin, toFiniteNumber } from "./utils/number.js";

export function resolveDraftPlacementAtPointer(
  clientX,
  clientY,
  {
    viewportRect = null,
    boardRect = null,
    layout = null,
    pointerOffset = null
  } = {}
) {
  if (!viewportRect || !boardRect || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }

  const width = Math.max(0, toFiniteNumber(layout?.w, 0));
  const height = Math.max(0, toFiniteNumber(layout?.h, 0));

  const offsetX = Number(pointerOffset?.x);
  const offsetY = Number(pointerOffset?.y);
  const anchorOffsetX = Number.isFinite(offsetX) ? clampFiniteOrMin(offsetX, 0, width) : width / 2;
  const anchorOffsetY = Number.isFinite(offsetY) ? clampFiniteOrMin(offsetY, 0, height) : height / 2;

  const maxLocalX = Math.max(0, toFiniteNumber(boardRect.width, 0) - width);
  const maxLocalY = Math.max(0, toFiniteNumber(boardRect.height, 0) - height);

  return {
    x: clampFiniteOrMin(clientX - toFiniteNumber(viewportRect.left, 0) - anchorOffsetX, 0, maxLocalX),
    y: clampFiniteOrMin(clientY - toFiniteNumber(viewportRect.top, 0) - anchorOffsetY, 0, maxLocalY)
  };
}

export function resolveBoundedDragPositionFromDelta(layout = null, dx = 0, dy = 0, boardRect = null) {
  const width = Math.max(0, toFiniteNumber(layout?.w, 0));
  const height = Math.max(0, toFiniteNumber(layout?.h, 0));
  const currentX = toFiniteNumber(layout?.x, 0);
  const currentY = toFiniteNumber(layout?.y, 0);

  const maxLocalX = Math.max(0, toFiniteNumber(boardRect?.width, 0) - width);
  const maxLocalY = Math.max(0, toFiniteNumber(boardRect?.height, 0) - height);

  return {
    x: clampFiniteOrMin(currentX + toFiniteNumber(dx, 0), 0, maxLocalX),
    y: clampFiniteOrMin(currentY + toFiniteNumber(dy, 0), 0, maxLocalY)
  };
}

export function resolveSnappedPosition(x, y, snap = 20) {
  const snapUnit = Math.max(1, Math.floor(toFiniteNumber(snap, 1)));
  const currentX = toFiniteNumber(x, 0);
  const currentY = toFiniteNumber(y, 0);
  const snappedX = Math.round(currentX / snapUnit) * snapUnit;
  const snappedY = Math.round(currentY / snapUnit) * snapUnit;

  return {
    x: snappedX,
    y: snappedY,
    changed: snappedX !== currentX || snappedY !== currentY
  };
}
