import { callIfFunction as call } from "./utils/function.js";
import { toTruthyNumberOrFallback } from "./utils/number.js";

export function applyWidgetDraftToInstance(
  instance,
  draft,
  {
    defTitle = "",
    pageCount = 1,
    previousPage = 0
  } = {},
  deps = {}
) {
  if (!instance || !draft) {
    return instance;
  }

  const {
    normalizeText,
    normalizeSurfaceMode,
    normalizeTransparentGhostStrength,
    normalizeEdgeRoundness,
    normalizeTransparency,
    normalizeTitleAlign,
    defaultWidgetTitleAlign,
    normalizeAlign,
    defaultWidgetContentAlign,
    resolveDirectionalPaddingFromDraft,
    widgetPaddingFallback,
    normalizeContentPadding,
    normalizeWidgetContentFontScale,
    normalizeWidgetThemeMode,
    normalizeWidgetColor,
    normalizeWidgetPage,
    cloneLayout
  } = deps;

  instance.title = call(normalizeText, draft.title, defTitle) ?? defTitle;
  instance.viewMode = draft.viewMode === "headless" ? "headless" : "window";
  instance.surfaceMode = call(normalizeSurfaceMode, draft.surfaceMode, "normal") ?? "normal";
  instance.transparentAutoContrast = draft.transparentAutoContrast !== false;
  instance.transparentGhostStrength = call(normalizeTransparentGhostStrength, draft.transparentGhostStrength, 100) ?? 100;
  instance.backdropBlur = draft.backdropBlur !== false;
  instance.edgeRoundness = call(normalizeEdgeRoundness, draft.edgeRoundness, 12) ?? 12;
  instance.transparency = call(normalizeTransparency, draft.transparency, 0.94) ?? 0.94;
  instance.titleAlign = call(normalizeTitleAlign, draft.titleAlign, call(defaultWidgetTitleAlign)) ?? call(defaultWidgetTitleAlign);
  instance.contentAlignY =
    instance.type === "aiChat"
      ? "top"
      : (call(normalizeAlign, draft.contentAlignY, call(defaultWidgetContentAlign, instance.type)) ?? call(defaultWidgetContentAlign, instance.type));
  instance.contentFillParent = instance.type === "aiChat" ? true : Boolean(draft.contentFillParent);

  const resolvedPadding =
    call(
      resolveDirectionalPaddingFromDraft,
      draft,
      call(widgetPaddingFallback, instance.type),
      normalizeContentPadding
    ) || {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
      topRight: 10,
      bottomLeft: 10,
      all: 10
    };

  instance.contentPaddingTop = resolvedPadding.top;
  instance.contentPaddingRight = resolvedPadding.right;
  instance.contentPaddingBottom = resolvedPadding.bottom;
  instance.contentPaddingLeft = resolvedPadding.left;
  instance.contentPaddingTopRight = resolvedPadding.topRight;
  instance.contentPaddingBottomLeft = resolvedPadding.bottomLeft;
  instance.contentPadding = resolvedPadding.all;
  instance.contentFontScale = call(normalizeWidgetContentFontScale, draft.contentFontScale, 1) ?? 1;
  instance.widgetThemeMode = call(normalizeWidgetThemeMode, draft.widgetThemeMode, "inherit") ?? "inherit";
  instance.useCustomColors = Boolean(draft.useCustomColors);
  instance.customTextColor = call(normalizeWidgetColor, draft.customTextColor, "#1F2226") ?? "#1F2226";
  instance.customAccentColor = call(normalizeWidgetColor, draft.customAccentColor, "#1F4F9F") ?? "#1F4F9F";
  instance.customSurfaceColor = call(normalizeWidgetColor, draft.customSurfaceColor, "#FFFAF2") ?? "#FFFAF2";
  instance.page = call(normalizeWidgetPage, toTruthyNumberOrFallback(draft.page, 1) - 1, pageCount, previousPage) ?? previousPage;
  instance.layout = call(cloneLayout, draft.layout) || draft.layout;
  instance.config = {
    ...instance.config,
    ...draft.config
  };

  return instance;
}

export function normalizeContainerWidgetDraftConfig(instance, deps = {}) {
  if (!instance || instance.type !== "container") {
    return instance;
  }

  const {
    normalizeContainerExpandedCols,
    normalizeContainerExpandedRows,
    enforceContainerWidgetSize
  } = deps;

  instance.config = instance.config || {};
  instance.config.expanded = instance.config.expanded === true;
  instance.config.expandedCols = call(normalizeContainerExpandedCols, instance.config.expandedCols, 4) ?? 4;
  instance.config.expandedRows = call(normalizeContainerExpandedRows, instance.config.expandedRows, 3) ?? 3;
  delete instance.config.expandedWidth;
  delete instance.config.expandedHeight;

  if (instance.gridLayout && typeof instance.gridLayout === "object") {
    instance.gridLayout.colSpan = 1;
    instance.gridLayout.rowSpan = 1;
  }

  call(enforceContainerWidgetSize, instance);
  return instance;
}
