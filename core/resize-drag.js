function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

export function resolveGridResizeLayout(startGrid = {}, metrics = {}, pointer = {}) {
  const stepX = Math.max(1, toFinite(metrics.cellW, 1) + toFinite(metrics.gapX, 0));
  const stepY = Math.max(1, toFinite(metrics.cellH, 1) + toFinite(metrics.gapY, 0));

  const dCol = Math.round((toFinite(pointer.clientX, 0) - toFinite(pointer.startX, 0)) / stepX);
  const dRow = Math.round((toFinite(pointer.clientY, 0) - toFinite(pointer.startY, 0)) / stepY);

  const startCol = Math.floor(toFinite(startGrid.col, 0));
  const startColSpan = Math.max(1, Math.floor(toFinite(startGrid.colSpan, 1)));
  const startRowSpan = Math.max(1, Math.floor(toFinite(startGrid.rowSpan, 1)));

  const maxColSpan = Math.max(1, Math.floor(toFinite(metrics.cols, 1)) - startCol);
  const maxRowSpan = Math.max(1, Math.floor(toFinite(metrics.rows, 1)) - Math.floor(toFinite(startGrid.row, 0)));

  return {
    ...startGrid,
    colSpan: clamp(startColSpan + dCol, 1, maxColSpan),
    rowSpan: clamp(startRowSpan + dRow, 1, maxRowSpan)
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
  const maxW = Math.max(1, Math.floor(toFinite(boardRect?.width, 1) - toFinite(layoutX, 0)));
  const maxH = Math.max(1, Math.floor(toFinite(boardRect?.height, 1) - toFinite(layoutY, 0)));
  const minW = Math.min(80, maxW);
  const minH = Math.min(80, maxH);

  return {
    w: clamp(toFinite(startW, minW) + toFinite(dx, 0), minW, maxW),
    h: clamp(toFinite(startH, minH) + toFinite(dy, 0), minH, maxH)
  };
}

export function resolveSnappedSize(width, height, snap = 20) {
  const unit = Math.max(1, Math.floor(toFinite(snap, 1)));
  const w = toFinite(width, 0);
  const h = toFinite(height, 0);
  return {
    w: Math.round(w / unit) * unit,
    h: Math.round(h / unit) * unit
  };
}
