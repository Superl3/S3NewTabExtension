import { callIfFunction as call } from "./utils/function.js";

export function applyCommonMasterToDraft(draft, instanceType, master, deps = {}) {
  if (!draft || !master) {
    return draft;
  }

  const {
    normalizeSurfaceMode,
    normalizeTransparentGhostStrength,
    normalizeEdgeRoundness,
    normalizeTransparency,
    normalizeTitleAlign,
    defaultWidgetTitleAlign,
    normalizeAlign,
    defaultWidgetContentAlign,
    normalizeContentPadding,
    widgetPaddingFallback,
    normalizeWidgetContentFontScale,
    normalizeWidgetThemeMode,
    normalizeWidgetColor
  } = deps;

  draft.viewMode = master.viewMode === "headless" ? "headless" : "window";
  draft.surfaceMode = call(normalizeSurfaceMode, master.surfaceMode, "normal") ?? "normal";
  draft.transparentAutoContrast = master.transparentAutoContrast !== false;
  draft.transparentGhostStrength = call(normalizeTransparentGhostStrength, master.transparentGhostStrength, 100) ?? 100;
  draft.backdropBlur = master.backdropBlur !== false;
  draft.edgeRoundness = call(normalizeEdgeRoundness, master.edgeRoundness, 12) ?? 12;
  draft.transparency = call(normalizeTransparency, master.transparency, 0.94) ?? 0.94;
  draft.titleAlign = call(normalizeTitleAlign, master.titleAlign, call(defaultWidgetTitleAlign)) ?? call(defaultWidgetTitleAlign);
  draft.contentAlignY =
    instanceType === "aiChat"
      ? "top"
      : (call(normalizeAlign, master.contentAlignY, call(defaultWidgetContentAlign, instanceType)) ?? call(defaultWidgetContentAlign, instanceType));
  draft.contentFillParent = instanceType === "aiChat" ? true : Boolean(master.contentFillParent);
  const paddingFallback = call(widgetPaddingFallback, instanceType);
  const padding = call(normalizeContentPadding, master.contentPadding, paddingFallback) ?? paddingFallback;
  draft.contentPadding = padding;
  draft.contentPaddingTop = padding;
  draft.contentPaddingRight = padding;
  draft.contentPaddingBottom = padding;
  draft.contentPaddingLeft = padding;
  draft.contentPaddingTopRight = padding;
  draft.contentPaddingBottomLeft = padding;
  draft.contentFontScale = call(normalizeWidgetContentFontScale, master.contentFontScale, 1) ?? 1;
  draft.widgetThemeMode = call(normalizeWidgetThemeMode, master.widgetThemeMode, "inherit") ?? "inherit";
  draft.useCustomColors = Boolean(master.useCustomColors);
  draft.customTextColor = call(normalizeWidgetColor, master.customTextColor, "#1F2226") ?? "#1F2226";
  draft.customAccentColor = call(normalizeWidgetColor, master.customAccentColor, "#1F4F9F") ?? "#1F4F9F";
  draft.customSurfaceColor = call(normalizeWidgetColor, master.customSurfaceColor, "#FFFAF2") ?? "#FFFAF2";

  return draft;
}

export function buildWidgetModalDraft(instance, { pageCount = 1 } = {}, deps = {}) {
  if (!instance) {
    return null;
  }

  const {
    resolveWidgetPadding,
    normalizeWidgetPage,
    normalizeSurfaceMode,
    normalizeTransparentGhostStrength,
    normalizeEdgeRoundness,
    normalizeTransparency,
    normalizeTitleAlign,
    defaultWidgetTitleAlign,
    normalizeAlign,
    defaultWidgetContentAlign,
    normalizeContentPadding,
    normalizeWidgetContentFontScale,
    normalizeWidgetThemeMode,
    normalizeWidgetColor
  } = deps;

  const padding = call(resolveWidgetPadding, instance) || {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
    uniform: 10
  };

  const uniformPadding = call(normalizeContentPadding, (padding.top + padding.right + padding.bottom + padding.left) / 4, padding.uniform) ?? padding.uniform;

  return {
    title: instance.title,
    page: (call(normalizeWidgetPage, instance.page, pageCount, 0) ?? 0) + 1,
    viewMode: instance.viewMode || "window",
    surfaceMode: call(normalizeSurfaceMode, instance.surfaceMode, "normal") ?? "normal",
    transparentAutoContrast: instance.transparentAutoContrast !== false,
    transparentGhostStrength: call(normalizeTransparentGhostStrength, instance.transparentGhostStrength, 100) ?? 100,
    backdropBlur: instance.backdropBlur !== false,
    edgeRoundness: call(normalizeEdgeRoundness, instance.edgeRoundness, 12) ?? 12,
    transparency: call(normalizeTransparency, instance.transparency, 0.94) ?? 0.94,
    titleAlign: call(normalizeTitleAlign, instance.titleAlign, call(defaultWidgetTitleAlign)) ?? call(defaultWidgetTitleAlign),
    contentAlignY:
      instance.type === "aiChat"
        ? "top"
        : (call(normalizeAlign, instance.contentAlignY, call(defaultWidgetContentAlign, instance.type)) ?? call(defaultWidgetContentAlign, instance.type)),
    contentFillParent: Boolean(instance.contentFillParent),
    contentPadding: uniformPadding,
    contentPaddingTop: padding.top,
    contentPaddingRight: padding.right,
    contentPaddingBottom: padding.bottom,
    contentPaddingLeft: padding.left,
    contentPaddingTopRight: call(normalizeContentPadding, (padding.top + padding.right) / 2, padding.uniform) ?? padding.uniform,
    contentPaddingBottomLeft: call(normalizeContentPadding, (padding.bottom + padding.left) / 2, padding.uniform) ?? padding.uniform,
    contentFontScale: call(normalizeWidgetContentFontScale, instance.contentFontScale, 1) ?? 1,
    widgetThemeMode: call(normalizeWidgetThemeMode, instance.widgetThemeMode, "inherit") ?? "inherit",
    useCustomColors: Boolean(instance.useCustomColors),
    customTextColor: call(normalizeWidgetColor, instance.customTextColor, "#1F2226") ?? "#1F2226",
    customAccentColor: call(normalizeWidgetColor, instance.customAccentColor, "#1F4F9F") ?? "#1F4F9F",
    customSurfaceColor: call(normalizeWidgetColor, instance.customSurfaceColor, "#FFFAF2") ?? "#FFFAF2",
    layout: {
      ...instance.layout
    },
    config: {
      ...instance.config
    }
  };
}
