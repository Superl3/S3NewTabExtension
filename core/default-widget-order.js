import { clamp, toPositiveInteger, toTruthyNumberOrFallback } from "./utils/number.js";

export const FALLBACK_DEFAULT_WIDGET_TYPES = Object.freeze([
  "clock",
  "search",
  "weather",
  "bookmarks",
  "shortcut",
  "todo",
  "notes"
]);

export const FALLBACK_DEFAULT_GRID = Object.freeze({
  columns: 12,
  rows: 8
});

function createOccupancy(rows, columns) {
  return Array.from({ length: rows }, () => Array(columns).fill(false));
}

function canPlace(occupancy, row, col, rowSpan, colSpan) {
  for (let y = row; y < row + rowSpan; y += 1) {
    for (let x = col; x < col + colSpan; x += 1) {
      if (occupancy[y]?.[x]) {
        return false;
      }
    }
  }
  return true;
}

function occupy(occupancy, row, col, rowSpan, colSpan) {
  for (let y = row; y < row + rowSpan; y += 1) {
    for (let x = col; x < col + colSpan; x += 1) {
      occupancy[y][x] = true;
    }
  }
}

function findOpenGridSlot(occupancy, colSpan, rowSpan) {
  const rows = occupancy.length;
  const columns = occupancy[0]?.length || 1;
  for (let row = 0; row <= rows - rowSpan; row += 1) {
    for (let col = 0; col <= columns - colSpan; col += 1) {
      if (canPlace(occupancy, row, col, rowSpan, colSpan)) {
        return { row, col };
      }
    }
  }
  return null;
}

export function assignFallbackDefaultGridLayouts(widgetTypes, {
  widgetRegistry = {},
  widgetDefaultGridSize,
  columns = FALLBACK_DEFAULT_GRID.columns,
  rows = FALLBACK_DEFAULT_GRID.rows
} = {}) {
  const gridColumns = toPositiveInteger(
    toTruthyNumberOrFallback(columns, FALLBACK_DEFAULT_GRID.columns),
    FALLBACK_DEFAULT_GRID.columns
  );
  const gridRows = toPositiveInteger(
    toTruthyNumberOrFallback(rows, FALLBACK_DEFAULT_GRID.rows),
    FALLBACK_DEFAULT_GRID.rows
  );
  const occupancyByPage = [createOccupancy(gridRows, gridColumns)];

  return (Array.isArray(widgetTypes) ? widgetTypes : []).map((type) => {
    const def = widgetRegistry[type];
    const defaultSize = widgetDefaultGridSize?.(type, def) || { colSpan: 1, rowSpan: 1 };
    const colSpan = clamp(toPositiveInteger(defaultSize.colSpan, 1), 1, gridColumns);
    const rowSpan = clamp(toPositiveInteger(defaultSize.rowSpan, 1), 1, gridRows);
    let page = 0;
    let slot = null;

    while (!slot) {
      if (!occupancyByPage[page]) {
        occupancyByPage[page] = createOccupancy(gridRows, gridColumns);
      }
      slot = findOpenGridSlot(occupancyByPage[page], colSpan, rowSpan);
      if (!slot) {
        page += 1;
      }
    }

    occupy(occupancyByPage[page], slot.row, slot.col, rowSpan, colSpan);

    return {
      type,
      page,
      gridLayout: {
        col: slot.col,
        row: slot.row,
        colSpan,
        rowSpan
      }
    };
  });
}
