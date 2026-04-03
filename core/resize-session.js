import {
  resolveFreeResizeDimensions,
  resolveGridResizeLayout,
  resolveSnappedSize
} from "./resize-drag.js";

function resolveEventTarget(eventTarget = null) {
  return eventTarget || globalThis.window || null;
}

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

export function startGridResizeSession({
  startX = 0,
  startY = 0,
  startGrid = {},
  metrics = {},
  setGridLayout,
  applyGridLayout,
  onComplete,
  eventTarget = null
} = {}) {
  const target = resolveEventTarget(eventTarget);

  const move = (moveEvent) => {
    const nextGrid = resolveGridResizeLayout(startGrid, metrics, {
      startX,
      startY,
      clientX: moveEvent?.clientX,
      clientY: moveEvent?.clientY
    });
    if (typeof setGridLayout === "function") {
      setGridLayout(nextGrid);
    }
    if (typeof applyGridLayout === "function") {
      applyGridLayout();
    }
  };

  const up = () => {
    target?.removeEventListener?.("pointermove", move);
    target?.removeEventListener?.("pointerup", up);
    if (typeof onComplete === "function") {
      onComplete();
    }
  };

  target?.addEventListener?.("pointermove", move);
  target?.addEventListener?.("pointerup", up);

  return {
    stop: up
  };
}

export function startFreeResizeSession({
  startX = 0,
  startY = 0,
  startW = 0,
  startH = 0,
  getLayoutPosition,
  getBoardRect,
  patchSize,
  onComplete,
  snap = 20,
  eventTarget = null
} = {}) {
  const target = resolveEventTarget(eventTarget);

  const move = (moveEvent) => {
    const layoutPosition =
      typeof getLayoutPosition === "function"
        ? getLayoutPosition()
        : { x: 0, y: 0 };
    const boardRect = typeof getBoardRect === "function" ? getBoardRect() : null;
    const nextSize = resolveFreeResizeDimensions({
      startW,
      startH,
      dx: toFinite(moveEvent?.clientX, startX) - startX,
      dy: toFinite(moveEvent?.clientY, startY) - startY,
      layoutX: layoutPosition?.x,
      layoutY: layoutPosition?.y,
      boardRect
    });
    if (typeof patchSize === "function") {
      patchSize(nextSize, { commit: false });
    }
  };

  const up = () => {
    target?.removeEventListener?.("pointermove", move);
    target?.removeEventListener?.("pointerup", up);
    if (typeof patchSize === "function") {
      const snapped = resolveSnappedSize(
        typeof onComplete?.getCurrentWidth === "function" ? onComplete.getCurrentWidth() : 0,
        typeof onComplete?.getCurrentHeight === "function" ? onComplete.getCurrentHeight() : 0,
        snap
      );
      patchSize(snapped, { commit: true });
    }
    if (typeof onComplete?.afterCommit === "function") {
      onComplete.afterCommit();
    }
  };

  target?.addEventListener?.("pointermove", move);
  target?.addEventListener?.("pointerup", up);

  return {
    stop: up
  };
}
