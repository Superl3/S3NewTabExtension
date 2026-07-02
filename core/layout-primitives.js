import { snapToHalfGridTrack } from "./utils/grid.js";
import { clamp, normalizeIntegerInRange, toFiniteNumber } from "./utils/number.js";

const GRID_MAX_COLUMNS_FALLBACK = 16;
const GRID_MAX_ROWS_FALLBACK = 16;

export { clamp };

export function idSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

export function cloneLayout(layout) {
  return {
    x: Number(layout?.x ?? 40),
    y: Number(layout?.y ?? 40),
    w: Number(layout?.w ?? 340),
    h: Number(layout?.h ?? 220)
  };
}

export function widgetDefaultGridSize(type, def) {
  const rawW = Number(def?.defaultGridSize?.w);
  const rawH = Number(def?.defaultGridSize?.h);
  if (Number.isFinite(rawW) && Number.isFinite(rawH) && rawW >= 1 && rawH >= 1) {
    return {
      colSpan: Math.max(1, Math.floor(rawW)),
      rowSpan: Math.max(1, Math.floor(rawH))
    };
  }
  if (type === "container") {
    return { colSpan: 1, rowSpan: 1 };
  }
  if (type === "shortcut") {
    return { colSpan: 1, rowSpan: 1 };
  }
  return { colSpan: 2, rowSpan: 2 };
}

export function normalizeContainerExpandedCols(
  value,
  fallback = 4,
  maxColumns = GRID_MAX_COLUMNS_FALLBACK
) {
  return normalizeIntegerInRange(value, fallback, 1, maxColumns);
}

export function normalizeContainerExpandedRows(
  value,
  fallback = 3,
  maxRows = GRID_MAX_ROWS_FALLBACK
) {
  return normalizeIntegerInRange(value, fallback, 1, maxRows);
}

export function normalizeGridTrackPosition(value, fallback = 0) {
  const source = toFiniteNumber(value, toFiniteNumber(fallback, 0));
  return Math.max(0, snapToHalfGridTrack(source));
}

export function normalizeGridLayout(layout, fallback) {
  const rawCol = Number(layout?.col);
  const rawRow = Number(layout?.row);
  const rawColSpan = Number(layout?.colSpan);
  const rawRowSpan = Number(layout?.rowSpan);
  const fallbackCol = Number(fallback?.col) || 0;
  const fallbackRow = Number(fallback?.row) || 0;
  const fallbackColSpan = Number(fallback?.colSpan) || 1;
  const fallbackRowSpan = Number(fallback?.rowSpan) || 1;

  return {
    col: normalizeGridTrackPosition(rawCol, fallbackCol),
    row: normalizeGridTrackPosition(rawRow, fallbackRow),
    colSpan: Math.max(1, Math.floor(Number.isFinite(rawColSpan) ? rawColSpan : fallbackColSpan)),
    rowSpan: Math.max(1, Math.floor(Number.isFinite(rawRowSpan) ? rawRowSpan : fallbackRowSpan))
  };
}
