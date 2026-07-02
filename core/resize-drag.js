import { clampFiniteOrMin, toFiniteNumber } from "./utils/number.js";

export function resolveGridResizeLayout(startGrid = {}, metrics = {}, pointer = {}) {
  const stepX = Math.max(1, toFiniteNumber(metrics.cellW, 1) + toFiniteNumber(metrics.gapX, 0));
  const stepY = Math.max(1, toFiniteNumber(metrics.cellH, 1) + toFiniteNumber(metrics.gapY, 0));

  const dCol = Math.round((toFiniteNumber(pointer.clientX, 0) - toFiniteNumber(pointer.startX, 0)) / stepX);
  const dRow = Math.round((toFiniteNumber(pointer.clientY, 0) - toFiniteNumber(pointer.startY, 0)) / stepY);

  const startCol = Math.floor(toFiniteNumber(startGrid.col, 0));
  const startColSpan = Math.max(1, Math.floor(toFiniteNumber(startGrid.colSpan, 1)));
  const startRowSpan = Math.max(1, Math.floor(toFiniteNumber(startGrid.rowSpan, 1)));

  const maxColSpan = Math.max(1, Math.floor(toFiniteNumber(metrics.cols, 1)) - startCol);
  const maxRowSpan = Math.max(1, Math.floor(toFiniteNumber(metrics.rows, 1)) - Math.floor(toFiniteNumber(startGrid.row, 0)));

  return {
    ...startGrid,
    colSpan: clampFiniteOrMin(startColSpan + dCol, 1, maxColSpan),
    rowSpan: clampFiniteOrMin(startRowSpan + dRow, 1, maxRowSpan)
  };
}

export function resolveFreeResizeDimensions(
  {
    startW = 0,
    startH = 0,
    dx = 0,
    dy = 0,
    layoutX = 0,
    layoutY = 0,
    boardRect = null
  } = {}
) {
  const maxW = Math.max(1, Math.floor(toFiniteNumber(boardRect?.width, 1) - toFiniteNumber(layoutX, 0)));
  const maxH = Math.max(1, Math.floor(toFiniteNumber(boardRect?.height, 1) - toFiniteNumber(layoutY, 0)));
  const minW = Math.min(80, maxW);
  const minH = Math.min(80, maxH);

  return {
    w: clampFiniteOrMin(toFiniteNumber(startW, minW) + toFiniteNumber(dx, 0), minW, maxW),
    h: clampFiniteOrMin(toFiniteNumber(startH, minH) + toFiniteNumber(dy, 0), minH, maxH)
  };
}

export function resolveSnappedSize(width, height, snap = 20) {
  const unit = Math.max(1, Math.floor(toFiniteNumber(snap, 1)));
  const w = toFiniteNumber(width, 0);
  const h = toFiniteNumber(height, 0);
  return {
    w: Math.round(w / unit) * unit,
    h: Math.round(h / unit) * unit
  };
}
