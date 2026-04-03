function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const WIDGET_COMMON_MASTER_KEYS = [
  "viewMode",
  "surfaceMode",
  "transparentAutoContrast",
  "transparentGhostStrength",
  "backdropBlur",
  "edgeRoundness",
  "transparency",
  "titleAlign",
  "contentAlignY",
  "contentFillParent",
  "contentPadding",
  "contentFontScale",
  "widgetThemeMode",
  "useCustomColors",
  "customTextColor",
  "customAccentColor",
  "customSurfaceColor"
];

const AUTO_LIGHT_WIDGET_TEXT = "#F3F7FF";
const AUTO_DARK_WIDGET_TEXT = "#151A23";
export const SHORT_TEXT_WIDGET_TYPES = new Set(["clock", "flexWorktime", "mondayMeetingNote"]);
export const SHORT_TEXT_MIN_CONTENT_FONT_SCALE = 1.25;

export function defaultWidgetCommonMaster() {
  return {
    viewMode: "window",
    surfaceMode: "normal",
    transparentAutoContrast: true,
    transparentGhostStrength: 100,
    backdropBlur: true,
    edgeRoundness: 12,
    transparency: 0.94,
    titleAlign: "center",
    contentAlignY: "top",
    contentFillParent: false,
    contentPadding: 10,
    contentFontScale: 1,
    widgetThemeMode: "inherit",
    useCustomColors: false,
    customTextColor: "#1F2226",
    customAccentColor: "#1F4F9F",
    customSurfaceColor: "#FFFAF2"
  };
}

export function defaultPresets() {
  return [];
}

export function normalizeTransparency(value, fallback = 0.94) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(fallback, 0, 1);
  }
  return clamp(num, 0, 1);
}

export function normalizeContentPadding(value, fallback = 10) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 0, 48);
  }
  return clamp(Math.round(num), 0, 48);
}

export function normalizeWidgetContentFontScale(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Number(fallback) || 1, 0.5, 2);
  }
  return clamp(num, 0.5, 2);
}

export function normalizeEdgeRoundness(value, fallback = 12) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 0, 40);
  }
  return clamp(Math.round(num), 0, 40);
}

export function widgetPaddingFallback(type) {
  return type === "shortcut" || type === "aiChat" || type === "container" ? 8 : 10;
}

export function isHeadlessTransparentDefaultType(type) {
  return type === "shortcut" || type === "clock" || type === "search" || type === "container";
}

export function isHeadlessDefaultType(type) {
  return type === "weather" || isHeadlessTransparentDefaultType(type);
}

export function defaultWidgetContentAlign(type) {
  if (type === "weather") {
    return "top";
  }
  return isHeadlessDefaultType(type) ? "center" : "top";
}

export function defaultWidgetTitleAlign() {
  return "center";
}

export function defaultWidgetBackdropBlur(type) {
  return !isHeadlessTransparentDefaultType(type);
}

export function resolveWidgetPadding(instance) {
  const fallback = widgetPaddingFallback(instance?.type);
  const uniform = normalizeContentPadding(instance?.contentPadding, fallback);

  const legacyTopRight = normalizeContentPadding(instance?.contentPaddingTopRight, uniform);
  const legacyBottomLeft = normalizeContentPadding(instance?.contentPaddingBottomLeft, uniform);

  const top = normalizeContentPadding(instance?.contentPaddingTop, legacyTopRight);
  const right = normalizeContentPadding(instance?.contentPaddingRight, legacyTopRight);
  const bottom = normalizeContentPadding(instance?.contentPaddingBottom, legacyBottomLeft);
  const left = normalizeContentPadding(instance?.contentPaddingLeft, legacyBottomLeft);

  return { top, right, bottom, left, uniform };
}

export function normalizeAlign(value, fallback = "top") {
  if (value === "top" || value === "center" || value === "bottom") {
    return value;
  }
  return fallback;
}

export function normalizeTitleAlign(value, fallback = "center") {
  if (value === "left" || value === "center" || value === "right") {
    return value;
  }
  return fallback;
}

export function normalizeSurfaceMode(value, fallback = "normal") {
  if (value === "normal" || value === "transparent") {
    return value;
  }
  return fallback;
}

export function normalizeWidgetThemeMode(value, fallback = "inherit") {
  if (value === "inherit" || value === "light" || value === "dark") {
    return value;
  }
  return fallback;
}

export function normalizeHexColor(value, fallback = "#000000") {
  if (typeof value !== "string") {
    return fallback;
  }
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v)) {
    return v;
  }
  return fallback;
}

export function normalizeWidgetColor(value, fallback) {
  const normalized = normalizeHexColor(value, fallback);
  return typeof normalized === "string" ? normalized.toUpperCase() : fallback;
}

export function normalizeTransparentGhostStrength(value, fallback = 100) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 40, 180);
  }
  return clamp(Math.round(num), 40, 180);
}

export function hexToRgb(hex, fallback = "#000000") {
  const value = normalizeHexColor(hex, fallback).slice(1);
  if (value.length === 3) {
    return {
      r: Number.parseInt(value[0] + value[0], 16),
      g: Number.parseInt(value[1] + value[1], 16),
      b: Number.parseInt(value[2] + value[2], 16)
    };
  }
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

export function srgbToLinear(channel) {
  const c = clamp(channel, 0, 255) / 255;
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return ((c + 0.055) / 1.055) ** 2.4;
}

export function luminanceFromHex(hex, fallback = "#000000") {
  const rgb = hexToRgb(hex, fallback);
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

export function contrastRatio(lumA, lumB) {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function applyBackdropOverlayLuminance(baseLum, ui) {
  const overlay = clamp(Number(ui?.background?.overlayOpacity) || 0.24, 0, 0.85);
  const overlayLum = luminanceFromHex("#080B10");
  return clamp(baseLum, 0, 1) * (1 - overlay) + overlayLum * overlay;
}

export function pickBestAutoTextColor(backdropLum) {
  const lightContrast = contrastRatio(luminanceFromHex(AUTO_LIGHT_WIDGET_TEXT), backdropLum);
  const darkContrast = contrastRatio(luminanceFromHex(AUTO_DARK_WIDGET_TEXT), backdropLum);
  return lightContrast >= darkContrast ? AUTO_LIGHT_WIDGET_TEXT : AUTO_DARK_WIDGET_TEXT;
}

export function estimateTransparentBackdropLuminance(ui) {
  const mode = String(ui?.background?.mode || "gradient");

  const themeBackgroundLum = luminanceFromHex(normalizeHexColor(ui?.theme?.background, "#F3EFE6"));
  const themeSurfaceLum = luminanceFromHex(normalizeHexColor(ui?.theme?.surface, "#FFFAF2"));
  const themeAccentLum = luminanceFromHex(normalizeHexColor(ui?.theme?.accent, "#1F4F9F"));

  let baseLum = themeBackgroundLum;
  if (mode === "solid") {
    baseLum = luminanceFromHex(normalizeHexColor(ui?.background?.solidColor, "#1F2937"));
  } else if (mode === "gradient") {
    baseLum = (themeBackgroundLum + themeSurfaceLum + themeAccentLum) / 3;
  } else if (mode === "wallpaper" || mode === "video") {
    baseLum = clamp((themeBackgroundLum + 0.58) / 2, 0, 1);
  }

  return applyBackdropOverlayLuminance(baseLum, ui);
}

export function resolveTransparentWidgetText(
  instance,
  ui,
  { sampledWallpaperBaseLuminance = Number.NaN } = {}
) {
  const mode = String(ui?.background?.mode || "gradient");
  const autoContrastEnabled = instance?.transparentAutoContrast !== false;
  const themeText = normalizeWidgetColor(ui?.theme?.text, "#1F2226");
  const manualText = instance.useCustomColors
    ? normalizeWidgetColor(instance.customTextColor, themeText)
    : themeText;

  if (!autoContrastEnabled) {
    return manualText;
  }

  const sampledBackdropLum =
    mode === "wallpaper" && Number.isFinite(sampledWallpaperBaseLuminance)
      ? applyBackdropOverlayLuminance(sampledWallpaperBaseLuminance, ui)
      : null;
  const backdropLum = Number.isFinite(sampledBackdropLum)
    ? sampledBackdropLum
    : estimateTransparentBackdropLuminance(ui);
  const manualLum = luminanceFromHex(manualText);
  const manualContrast = contrastRatio(manualLum, backdropLum);
  const minimumContrast = mode === "wallpaper" || mode === "video" ? 4.1 : 3.4;

  if (manualContrast >= minimumContrast) {
    return manualText;
  }

  return pickBestAutoTextColor(backdropLum);
}

export function resolveTransparentGhostOpacity(ui, strengthPercent = 100) {
  const mode = String(ui?.background?.mode || "gradient");
  const overlay = clamp(Number(ui?.background?.overlayOpacity) || 0.24, 0, 0.85);
  const base = mode === "wallpaper" || mode === "video" ? 0.16 : 0.08;
  const compensation = overlay < 0.16 ? (0.16 - overlay) * 0.35 : 0;
  const strength = normalizeTransparentGhostStrength(strengthPercent, 100) / 100;
  return clamp((base + compensation) * strength, 0.04, 0.32);
}

export function normalizeWidgetCommonMaster(value) {
  const base = {
    ...defaultWidgetCommonMaster(),
    ...(value && typeof value === "object" ? value : {})
  };

  return {
    viewMode: base.viewMode === "headless" ? "headless" : "window",
    surfaceMode: normalizeSurfaceMode(base.surfaceMode, "normal"),
    transparentAutoContrast: base.transparentAutoContrast !== false,
    transparentGhostStrength: normalizeTransparentGhostStrength(base.transparentGhostStrength, 100),
    backdropBlur: base.backdropBlur !== false,
    edgeRoundness: normalizeEdgeRoundness(base.edgeRoundness, 12),
    transparency: normalizeTransparency(base.transparency, 0.94),
    titleAlign: normalizeTitleAlign(base.titleAlign, defaultWidgetTitleAlign()),
    contentAlignY: normalizeAlign(base.contentAlignY, "top"),
    contentFillParent: Boolean(base.contentFillParent),
    contentPadding: normalizeContentPadding(base.contentPadding, 10),
    contentFontScale: normalizeWidgetContentFontScale(base.contentFontScale, 1),
    widgetThemeMode: normalizeWidgetThemeMode(base.widgetThemeMode, "inherit"),
    useCustomColors: Boolean(base.useCustomColors),
    customTextColor: normalizeWidgetColor(base.customTextColor, "#1F2226"),
    customAccentColor: normalizeWidgetColor(base.customAccentColor, "#1F4F9F"),
    customSurfaceColor: normalizeWidgetColor(base.customSurfaceColor, "#FFFAF2")
  };
}

export function normalizeCommonOverrides(value) {
  const out = {};
  const raw = value && typeof value === "object" ? value : {};
  for (const key of WIDGET_COMMON_MASTER_KEYS) {
    out[key] = Boolean(raw[key]);
  }
  return out;
}

export function instanceCommonValue(instance, key) {
  if (key === "contentPadding") {
    const padding = resolveWidgetPadding(instance);
    return normalizeContentPadding((padding.top + padding.right + padding.bottom + padding.left) / 4, padding.uniform);
  }
  if (key === "contentFontScale") {
    return normalizeWidgetContentFontScale(instance.contentFontScale, 1);
  }
  if (key === "transparency") {
    return normalizeTransparency(instance.transparency, 0.94);
  }
  if (key === "backdropBlur") {
    return instance.backdropBlur !== false;
  }
  if (key === "edgeRoundness") {
    return normalizeEdgeRoundness(instance.edgeRoundness, 12);
  }
  if (key === "contentAlignY") {
    return instance.type === "aiChat" ? "top" : normalizeAlign(instance.contentAlignY, defaultWidgetContentAlign(instance.type));
  }
  if (key === "titleAlign") {
    return normalizeTitleAlign(instance.titleAlign, defaultWidgetTitleAlign());
  }
  if (key === "contentFillParent") {
    return instance.type === "aiChat" ? true : Boolean(instance.contentFillParent);
  }
  if (key === "viewMode") {
    return instance.viewMode === "headless" ? "headless" : "window";
  }
  if (key === "surfaceMode") {
    return normalizeSurfaceMode(instance.surfaceMode, "normal");
  }
  if (key === "transparentAutoContrast") {
    return instance.transparentAutoContrast !== false;
  }
  if (key === "transparentGhostStrength") {
    return normalizeTransparentGhostStrength(instance.transparentGhostStrength, 100);
  }
  if (key === "widgetThemeMode") {
    return normalizeWidgetThemeMode(instance.widgetThemeMode, "inherit");
  }
  if (key === "useCustomColors") {
    return Boolean(instance.useCustomColors);
  }
  if (key === "customTextColor") {
    return normalizeWidgetColor(instance.customTextColor, "#1F2226");
  }
  if (key === "customAccentColor") {
    return normalizeWidgetColor(instance.customAccentColor, "#1F4F9F");
  }
  if (key === "customSurfaceColor") {
    return normalizeWidgetColor(instance.customSurfaceColor, "#FFFAF2");
  }
  return instance[key];
}

export function setInstanceCommonValue(instance, key, value) {
  if (key === "contentPadding") {
    const fallback = widgetPaddingFallback(instance.type);
    const padding = normalizeContentPadding(value, fallback);
    instance.contentPadding = padding;
    instance.contentPaddingTop = padding;
    instance.contentPaddingRight = padding;
    instance.contentPaddingBottom = padding;
    instance.contentPaddingLeft = padding;
    instance.contentPaddingTopRight = padding;
    instance.contentPaddingBottomLeft = padding;
    return;
  }

  if (key === "contentFontScale") {
    instance.contentFontScale = normalizeWidgetContentFontScale(value, 1);
    return;
  }

  if (key === "contentAlignY") {
    instance.contentAlignY = instance.type === "aiChat" ? "top" : normalizeAlign(value, defaultWidgetContentAlign(instance.type));
    return;
  }

  if (key === "titleAlign") {
    instance.titleAlign = normalizeTitleAlign(value, defaultWidgetTitleAlign());
    return;
  }

  if (key === "contentFillParent") {
    instance.contentFillParent = instance.type === "aiChat" ? true : Boolean(value);
    return;
  }

  if (key === "backdropBlur") {
    instance.backdropBlur = value !== false;
    return;
  }

  if (key === "edgeRoundness") {
    instance.edgeRoundness = normalizeEdgeRoundness(value, 12);
    return;
  }

  if (key === "viewMode") {
    instance.viewMode = value === "headless" ? "headless" : "window";
    return;
  }

  if (key === "surfaceMode") {
    instance.surfaceMode = normalizeSurfaceMode(value, "normal");
    return;
  }

  if (key === "transparentAutoContrast") {
    instance.transparentAutoContrast = value !== false;
    return;
  }

  if (key === "transparentGhostStrength") {
    instance.transparentGhostStrength = normalizeTransparentGhostStrength(value, 100);
    return;
  }

  if (key === "transparency") {
    instance.transparency = normalizeTransparency(value, 0.94);
    return;
  }

  if (key === "widgetThemeMode") {
    instance.widgetThemeMode = normalizeWidgetThemeMode(value, "inherit");
    return;
  }

  if (key === "useCustomColors") {
    instance.useCustomColors = Boolean(value);
    return;
  }

  if (key === "customTextColor") {
    instance.customTextColor = normalizeWidgetColor(value, "#1F2226");
    return;
  }

  if (key === "customAccentColor") {
    instance.customAccentColor = normalizeWidgetColor(value, "#1F4F9F");
    return;
  }

  if (key === "customSurfaceColor") {
    instance.customSurfaceColor = normalizeWidgetColor(value, "#FFFAF2");
  }
}

export function inferCommonOverrides(instance, master) {
  const out = {};
  for (const key of WIDGET_COMMON_MASTER_KEYS) {
    out[key] = instanceCommonValue(instance, key) !== master[key];
  }
  return out;
}

export function applyWidgetCommonMaster(instance, master, force = false) {
  const overrides = normalizeCommonOverrides(instance.commonOverrides);
  for (const key of WIDGET_COMMON_MASTER_KEYS) {
    if (!force && overrides[key]) {
      continue;
    }
    setInstanceCommonValue(instance, key, master[key]);
  }
  instance.commonOverrides = normalizeCommonOverrides(instance.commonOverrides);
}
