import { callIfFunction as call } from "./utils/function.js";
import { clampFiniteOrMin } from "./utils/number.js";

export function findFirstAvailableBoardGridSlot(page, colSpan, rowSpan, deps = {}) {
  const {
    isGridLayoutMode,
    syncLauncherPagingState,
    gridMetrics,
    clamp,
    normalizeWidgetPage,
    instances,
    isWidgetDocked,
    isWidgetInContainer,
    widgetRegistry,
    widgetDefaultGridSize,
    normalizeGridLayout
  } = deps;

  if (call(isGridLayoutMode) === false) {
    return null;
  }

  const clampValue = typeof clamp === "function" ? clamp : clampFiniteOrMin;
  const home = call(syncLauncherPagingState, { expandToFitInstances: true }) || { pageCount: 1 };
  const metrics = call(gridMetrics) || {};
  const cols = Math.max(1, Math.floor(Number(metrics.cols) || 1));
  const rows = Math.max(1, Math.floor(Number(metrics.rows) || 1));
  const placementColSpan = clampValue(Math.max(1, Math.floor(Number(colSpan) || 1)), 1, cols);
  const placementRowSpan = clampValue(Math.max(1, Math.floor(Number(rowSpan) || 1)), 1, rows);
  const targetPage = call(normalizeWidgetPage, page, home.pageCount, 0) ?? 0;
  const occupancy = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (const instance of Array.isArray(instances) ? instances : []) {
    if (!instance || instance.enabled === false || call(isWidgetDocked, instance) || call(isWidgetInContainer, instance)) {
      continue;
    }

    if ((call(normalizeWidgetPage, instance.page, home.pageCount, 0) ?? 0) !== targetPage) {
      continue;
    }

    const def = widgetRegistry?.[instance.type];
    const fallback = call(widgetDefaultGridSize, instance.type, def) || { colSpan: 1, rowSpan: 1 };
    const grid =
      call(normalizeGridLayout, instance.gridLayout, {
        col: 0,
        row: 0,
        colSpan: fallback.colSpan,
        rowSpan: fallback.rowSpan
      }) || {
        col: 0,
        row: 0,
        colSpan: fallback.colSpan,
        rowSpan: fallback.rowSpan
      };

    if (instance.type === "container") {
      grid.colSpan = 1;
      grid.rowSpan = 1;
    }

    const occupiedColSpan = clampValue(grid.colSpan, 1, cols);
    const occupiedRowSpan = clampValue(grid.rowSpan, 1, rows);
    const occupiedCol = clampValue(grid.col, 0, Math.max(0, cols - occupiedColSpan));
    const occupiedRow = clampValue(grid.row, 0, Math.max(0, rows - occupiedRowSpan));
    const occupiedColEnd = occupiedCol + occupiedColSpan;
    const occupiedRowEnd = occupiedRow + occupiedRowSpan;

    for (let y = Math.floor(occupiedRow); y < Math.ceil(occupiedRowEnd); y += 1) {
      for (let x = Math.floor(occupiedCol); x < Math.ceil(occupiedColEnd); x += 1) {
        if (y < 0 || y >= rows || x < 0 || x >= cols) {
          continue;
        }
        if (Math.max(occupiedRow, y) >= Math.min(occupiedRowEnd, y + 1)) {
          continue;
        }
        if (Math.max(occupiedCol, x) >= Math.min(occupiedColEnd, x + 1)) {
          continue;
        }
        occupancy[y][x] = true;
      }
    }
  }

  for (let rowIndex = 0; rowIndex <= rows - placementRowSpan; rowIndex += 1) {
    for (let colIndex = 0; colIndex <= cols - placementColSpan; colIndex += 1) {
      let blocked = false;
      for (let y = rowIndex; y < rowIndex + placementRowSpan && !blocked; y += 1) {
        for (let x = colIndex; x < colIndex + placementColSpan; x += 1) {
          if (occupancy[y][x]) {
            blocked = true;
            break;
          }
        }
      }

      if (!blocked) {
        return {
          row: rowIndex,
          col: colIndex,
          rowSpan: placementRowSpan,
          colSpan: placementColSpan
        };
      }
    }
  }

  return null;
}
