import { clampFiniteOrMin } from "./utils/number.js";

function pointInsideRect(clientX, clientY, rect) {
  if (!rect) {
    return false;
  }
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

export function isHorizontalDockPosition(position = "bottom") {
  return position === "top" || position === "bottom";
}

export function resolveDockSlotIndexAtPoint(
  clientX,
  clientY,
  {
    stripRect,
    slotCount = 1,
    unitSize = 44,
    gap = 6,
    horizontal = true,
    clampToRange = false
  } = {}
) {
  const count = Math.max(1, Math.floor(Number(slotCount) || 1));
  const unit = Math.max(1, Number(unitSize) || 44);
  const gapSize = Math.max(0, Number(gap) || 0);

  if (!stripRect) {
    return null;
  }
  if (!pointInsideRect(clientX, clientY, stripRect) && !clampToRange) {
    return null;
  }

  const step = Math.max(1, unit + gapSize);
  const local = horizontal
    ? clampFiniteOrMin(clientX - stripRect.left, 0, Math.max(0, stripRect.width - 1))
    : clampFiniteOrMin(clientY - stripRect.top, 0, Math.max(0, stripRect.height - 1));

  const slot = Math.floor((local + gapSize * 0.5) / step);
  if (slot < 0 || slot >= count) {
    if (!clampToRange) {
      return null;
    }
    return clampFiniteOrMin(slot, 0, count - 1);
  }
  return slot;
}

export function resolveDockSlotRectRelativeToHost(
  slotIndex,
  {
    hostRect,
    stripRect,
    slotCount = 1,
    unitSize = 44,
    gap = 6,
    horizontal = true
  } = {}
) {
  const count = Math.max(1, Math.floor(Number(slotCount) || 1));
  const unit = Math.max(1, Number(unitSize) || 44);
  const gapSize = Math.max(0, Number(gap) || 0);
  const slot = Number(slotIndex);

  if (!hostRect || !stripRect || !Number.isFinite(slot) || slot < 0 || slot >= count) {
    return null;
  }

  const baseX = stripRect.left - hostRect.left;
  const baseY = stripRect.top - hostRect.top;
  const offset = Math.floor(slot) * (unit + gapSize);

  return {
    x: Math.round(baseX + (horizontal ? offset : 0)),
    y: Math.round(baseY + (horizontal ? 0 : offset)),
    w: unit,
    h: unit,
    borderRadius: Math.round(unit * 0.28)
  };
}
