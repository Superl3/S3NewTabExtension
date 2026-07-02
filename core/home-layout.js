import {
  normalizeActivePage,
  normalizeLauncherPageIndexList,
  normalizePageCount
} from "./launcher-pages.js";
import { clampFiniteOrMin, toTruthyNumberOrFallback } from "./utils/number.js";
import { normalizeText } from "./utils/text.js";

export function normalizeHomeMode(value, fallback = "grid") {
  if (value === "grid" || value === "free") {
    return value;
  }
  return fallback;
}

export function normalizeMarginPreset(value, fallback = "medium") {
  if (value === "wide" || value === "medium" || value === "narrow" || value === "none") {
    return value;
  }
  return fallback;
}

export function normalizeGapPreset(value, fallback = "narrow") {
  if (value === "wide" || value === "narrow" || value === "none") {
    return value;
  }
  return fallback;
}

export function normalizeDockShape(value, fallback = "raised") {
  if (value === "raised" || value === "flat") {
    return value;
  }
  return fallback;
}

export function normalizeDockVisibility(value, fallback = "fixed") {
  const raw = normalizeText(value, fallback).toLowerCase();
  if (raw === "fixed" || raw === "always") {
    return "fixed";
  }
  if (raw === "collapsible" || raw === "hover") {
    return "collapsible";
  }

  const normalizedFallback = normalizeText(fallback, "fixed").toLowerCase();
  if (normalizedFallback === "collapsible" || normalizedFallback === "hover") {
    return "collapsible";
  }
  return "fixed";
}

export function normalizeDockPosition(value, fallback = "bottom") {
  if (value === "top" || value === "bottom" || value === "left" || value === "right") {
    return value;
  }
  return fallback;
}

export function normalizeDockLength(value, fallback = 6) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clampFiniteOrMin(Math.floor(fallback), 5, 14);
  }
  return clampFiniteOrMin(Math.floor(num), 5, 14);
}

export function normalizeDockHeight(value, fallback = 44) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clampFiniteOrMin(Math.round(fallback), 36, 72);
  }
  return clampFiniteOrMin(Math.round(num), 36, 72);
}

export function normalizeDockSize(value, fallback = 44) {
  return normalizeDockHeight(value, fallback);
}

export function defaultHomeLayout() {
  return {
    mode: "grid",
    gridColumns: 4,
    gridRows: 3,
    marginHorizontal: "medium",
    marginVertical: "medium",
    itemGap: "narrow",
    pageCount: 1,
    activePage: 0,
    homePage: 0,
    manualPages: [],
    dockEnabled: true,
    dockShape: "raised",
    dockVisibility: "fixed",
    dockPosition: "bottom",
    dockLength: 6,
    dockHeight: 44,
    widgetBackdropBlur: true,
    legacyHeadlessSurfaceMigrated: false
  };
}

export function normalizeHomeLayout(layout, { gridMaxColumns = 16, gridMaxRows = 16 } = {}) {
  const base = {
    ...defaultHomeLayout(),
    ...(layout || {})
  };
  const pageCount = normalizePageCount(base.pageCount, 1);
  const homePage = normalizeActivePage(base.homePage, pageCount, 0);
  const manualPages = normalizeLauncherPageIndexList(base.manualPages, pageCount);

  return {
    mode: normalizeHomeMode(base.mode, "grid"),
    gridColumns: clampFiniteOrMin(toTruthyNumberOrFallback(base.gridColumns, 4), 1, gridMaxColumns),
    gridRows: clampFiniteOrMin(toTruthyNumberOrFallback(base.gridRows, 3), 1, gridMaxRows),
    marginHorizontal: normalizeMarginPreset(base.marginHorizontal, "medium"),
    marginVertical: normalizeMarginPreset(base.marginVertical, "medium"),
    itemGap: normalizeGapPreset(base.itemGap, "narrow"),
    pageCount,
    activePage: normalizeActivePage(base.activePage, pageCount, 0),
    homePage,
    manualPages,
    dockEnabled: base.dockEnabled !== false,
    dockShape: normalizeDockShape(base.dockShape, "raised"),
    dockVisibility: normalizeDockVisibility(base.dockVisibility, "fixed"),
    dockPosition: normalizeDockPosition(base.dockPosition, "bottom"),
    dockLength: normalizeDockLength(base.dockLength, 6),
    dockHeight: normalizeDockHeight(base.dockHeight ?? base.dockSize, 44),
    widgetBackdropBlur: base.widgetBackdropBlur !== false,
    legacyHeadlessSurfaceMigrated: base.legacyHeadlessSurfaceMigrated === true
  };
}

export function marginPresetToPx(value) {
  if (value === "wide") {
    return 40;
  }
  if (value === "narrow") {
    return 14;
  }
  if (value === "none") {
    return 0;
  }
  return 26;
}

export function gapPresetToPx(value) {
  if (value === "wide") {
    return 16;
  }
  if (value === "none") {
    return 0;
  }
  return 8;
}
