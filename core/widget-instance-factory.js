import { callIfFunction as call } from "./utils/function.js";

export function createWidgetInstanceDraft(
  {
    type,
    def,
    options = {},
    nextId = 1,
    zIndex = 1,
    targetPage = 0,
    gridPlacement = null,
    pageLocalIndex = 0,
    colSpan = 1,
    rowSpan = 1,
    defaultPadding = 10
  } = {},
  deps = {}
) {
  const {
    normalizeText,
    isHeadlessDefaultType,
    isHeadlessTransparentDefaultType,
    defaultWidgetBackdropBlur,
    defaultWidgetTitleAlign,
    defaultWidgetContentAlign,
    normalizeCommonOverrides,
    normalizeGridLayout,
    cloneLayout
  } = deps;

  return {
    id: `${type}-${nextId}`,
    type,
    title: call(normalizeText, options.title, def?.title) ?? def?.title,
    zIndex,
    viewMode: call(isHeadlessDefaultType, type) ? "headless" : "window",
    surfaceMode: call(isHeadlessTransparentDefaultType, type) ? "transparent" : "normal",
    transparentAutoContrast: true,
    transparentGhostStrength: 100,
    backdropBlur: call(defaultWidgetBackdropBlur, type),
    edgeRoundness: 12,
    transparency: 0.94,
    titleAlign: call(defaultWidgetTitleAlign),
    contentAlignY: call(defaultWidgetContentAlign, type),
    contentFillParent: type === "aiChat",
    contentPadding: defaultPadding,
    contentPaddingTop: defaultPadding,
    contentPaddingRight: defaultPadding,
    contentPaddingBottom: defaultPadding,
    contentPaddingLeft: defaultPadding,
    contentPaddingTopRight: defaultPadding,
    contentPaddingBottomLeft: defaultPadding,
    contentFontScale: 1,
    widgetThemeMode: "inherit",
    useCustomColors: false,
    customTextColor: "#1F2226",
    customAccentColor: "#1F4F9F",
    customSurfaceColor: "#FFFAF2",
    commonOverrides: call(normalizeCommonOverrides, {}),
    page: targetPage,
    dockOrder: null,
    containerId: "",
    enabled: true,
    config: structuredClone(def?.defaultConfig || {}),
    gridLayout:
      call(normalizeGridLayout, null, {
        col: gridPlacement ? gridPlacement.col : pageLocalIndex % 4,
        row: gridPlacement ? gridPlacement.row : Math.floor(pageLocalIndex / 4),
        colSpan: gridPlacement ? gridPlacement.colSpan : colSpan,
        rowSpan: gridPlacement ? gridPlacement.rowSpan : rowSpan
      }) || {
        col: gridPlacement ? gridPlacement.col : pageLocalIndex % 4,
        row: gridPlacement ? gridPlacement.row : Math.floor(pageLocalIndex / 4),
        colSpan: gridPlacement ? gridPlacement.colSpan : colSpan,
        rowSpan: gridPlacement ? gridPlacement.rowSpan : rowSpan
      },
    layout: call(cloneLayout, def?.defaultLayout || { x: 0, y: 0, w: 100, h: 100 }) || {
      ...(def?.defaultLayout || { x: 0, y: 0, w: 100, h: 100 })
    }
  };
}

export function applyFreeLayoutPlacement(
  instance,
  {
    pageLocalIndex = 0,
    colSpan = 1,
    rowSpan = 1,
    defaultSize = { colSpan: 1, rowSpan: 1 },
    boardRect = { width: 0, height: 0 }
  } = {},
  deps = {}
) {
  if (!instance || !instance.layout) {
    return instance;
  }

  const clamp = typeof deps.clamp === "function" ? deps.clamp : (value, min, max) => Math.min(max, Math.max(min, value));

  instance.layout.x += (pageLocalIndex % 6) * 24;
  instance.layout.y += (pageLocalIndex % 4) * 24;

  const scaleX = colSpan / Math.max(1, Number(defaultSize?.colSpan) || 1);
  const scaleY = rowSpan / Math.max(1, Number(defaultSize?.rowSpan) || 1);

  instance.layout.w = clamp(
    Math.round(instance.layout.w * scaleX),
    80,
    Math.max(80, Math.floor(Number(boardRect?.width) || 0))
  );
  instance.layout.h = clamp(
    Math.round(instance.layout.h * scaleY),
    80,
    Math.max(80, Math.floor(Number(boardRect?.height) || 0))
  );

  return instance;
}
