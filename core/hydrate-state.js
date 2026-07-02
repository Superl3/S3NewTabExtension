import { arrayOrEmpty } from "./utils/array.js";
import { clampTruthyNumberOrFallback, toNonNegativeNumberOrFallback, toTruthyNumberOrFallback } from "./utils/number.js";

export function hydrateState(raw, deps = {}) {
  const {
    defaultState,
    widgetRegistry,
    isHeadlessTransparentDefaultType,
    isHeadlessDefaultType,
    normalizeSurfaceMode,
    resolveWidgetPadding,
    normalizeContainerExpandedCols,
    normalizeContainerExpandedRows,
    clamp,
    normalizeText,
    applyRuntimeOnlyWidgetConfigDefaults,
    normalizeGridLayout,
    widgetDefaultGridSize,
    cloneLayout,
    idSuffix,
    defaultWidgetBackdropBlur,
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
    normalizeWidgetColor,
    normalizeCommonOverrides,
    normalizeWidgetPage,
    normalizeDockOrder,
    normalizeContainerId,
    normalizeDockedWidgetOrders,
    normalizeContainerAssignments,
    defaultTheme,
    defaultBackground,
    isWidgetDocked,
    isWidgetInContainer,
    normalizeHomeLayout,
    normalizeWidgetCommonMaster,
    normalizeMondayGlobalSettings,
    clonePresetSnapshot,
    normalizeHexColor,
    normalizeWallpaperProvider,
    normalizeVideoSource,
    normalizeLocalMediaType,
    normalizeLocalMediaFit,
    inferLocalMediaTypeFromDataUrl,
    inferCommonOverrides,
    applyWidgetCommonMaster,
    maxLauncherPages
  } = deps;

  const base = defaultState();
  const hasExplicitInstances = Array.isArray(raw.instances);
  const instances = hasExplicitInstances ? raw.instances : base.instances;
  const legacyHeadlessSurfaceMigrated = raw?.ui?.home?.legacyHeadlessSurfaceMigrated === true;
  let didLegacyHeadlessSurfaceMigration = false;
  const normalized = [];

  for (const item of instances) {
    const def = widgetRegistry[item.type];
    if (!def) {
      continue;
    }

    const isShortcut = item.type === "shortcut";
    const headlessTransparentByDefault = isHeadlessTransparentDefaultType(item.type);
    const headlessByDefault = isHeadlessDefaultType(item.type);
    const isAiChat = item.type === "aiChat";
    const isContainerWidget = item.type === "container";
    const viewMode =
      item.viewMode === "headless" || item.viewMode === "window"
        ? item.viewMode
        : headlessByDefault
          ? "headless"
          : "window";
    const legacySurfaceFallback = headlessTransparentByDefault ? "transparent" : "normal";
    let surfaceMode = normalizeSurfaceMode(item.surfaceMode, legacySurfaceFallback);
    if (
      !legacyHeadlessSurfaceMigrated &&
      headlessTransparentByDefault &&
      viewMode === "headless" &&
      item.surfaceMode === "normal"
    ) {
      surfaceMode = "transparent";
      didLegacyHeadlessSurfaceMigration = true;
    }
    const padding = resolveWidgetPadding({ type: item.type, ...item });
    const mergedConfig = {
      ...(structuredClone(def.defaultConfig || {})),
      ...(item.config || {})
    };

    if (isContainerWidget) {
      const legacyWidth = Number(mergedConfig.expandedWidth);
      const legacyHeight = Number(mergedConfig.expandedHeight);
      const fallbackCols = Number.isFinite(legacyWidth) ? Math.max(1, Math.round(legacyWidth / 220)) : 4;
      const fallbackRows = Number.isFinite(legacyHeight) ? Math.max(1, Math.round(legacyHeight / 180)) : 3;
      mergedConfig.expanded = mergedConfig.expanded === true;
      mergedConfig.expandedCols = normalizeContainerExpandedCols(mergedConfig.expandedCols, fallbackCols);
      mergedConfig.expandedRows = normalizeContainerExpandedRows(mergedConfig.expandedRows, fallbackRows);
      delete mergedConfig.expandedWidth;
      delete mergedConfig.expandedHeight;
    }

    if (isShortcut) {
      if (typeof mergedConfig.useGlobalIconSize !== "boolean") {
        mergedConfig.useGlobalIconSize = true;
      }
      const iconSize = Number(mergedConfig.iconSizePercent);
      mergedConfig.iconSizePercent = clamp(Number.isFinite(iconSize) ? iconSize : 100, 40, 220);
    }

    if (isAiChat) {
      mergedConfig.providerMode = mergedConfig.providerMode === "browser" ? "browser" : "chatgpt";
      if (!normalizeText(mergedConfig.endpoint)) {
        mergedConfig.endpoint =
          mergedConfig.providerMode === "browser"
            ? "https://api.openai.com/v1/responses"
            : "https://api.openai.com/v1/chat/completions";
      }
      mergedConfig.model = normalizeText(
        mergedConfig.model,
        mergedConfig.providerMode === "browser" ? "gpt-4.1-mini" : "gpt-4o-mini"
      );
    }

    applyRuntimeOnlyWidgetConfigDefaults(item.type, mergedConfig);

    const normalizedGrid = normalizeGridLayout(item.gridLayout, {
      col: normalized.length % 4,
      row: Math.floor(normalized.length / 4),
      ...widgetDefaultGridSize(item.type, def)
    });
    if (item.type === "weather") {
      const detailMode = normalizeText(mergedConfig.detailMode, "simple").toLowerCase();
      normalizedGrid.rowSpan = detailMode === "advanced" ? 2 : 1;
    }
    if (isContainerWidget) {
      normalizedGrid.colSpan = 1;
      normalizedGrid.rowSpan = 1;
    }

    normalized.push({
      id: item.id || `${item.type}-${idSuffix()}`,
      type: item.type,
      title: item.title || def.title,
      zIndex: clampTruthyNumberOrFallback(item.zIndex, normalized.length + 1, 1, Number.POSITIVE_INFINITY),
      viewMode,
      surfaceMode,
      transparentAutoContrast: item.transparentAutoContrast !== false,
      transparentGhostStrength: normalizeTransparentGhostStrength(item.transparentGhostStrength, 100),
      backdropBlur: typeof item.backdropBlur === "boolean" ? item.backdropBlur : defaultWidgetBackdropBlur(item.type),
      edgeRoundness: normalizeEdgeRoundness(item.edgeRoundness, 12),
      transparency: normalizeTransparency(item.transparency, 0.94),
      titleAlign: normalizeTitleAlign(item.titleAlign, defaultWidgetTitleAlign()),
      contentAlignY:
        isAiChat
          ? "top"
          : headlessTransparentByDefault &&
        (item.contentAlignY === undefined || item.contentAlignY === null || item.contentAlignY === "" || item.contentAlignY === "top")
            ? "center"
            : normalizeAlign(item.contentAlignY, defaultWidgetContentAlign(item.type)),
      contentFillParent: isShortcut ? false : isAiChat ? true : Boolean(item.contentFillParent),
      contentPadding: normalizeContentPadding((padding.top + padding.right + padding.bottom + padding.left) / 4, padding.uniform),
      contentPaddingTop: padding.top,
      contentPaddingRight: padding.right,
      contentPaddingBottom: padding.bottom,
      contentPaddingLeft: padding.left,
      contentPaddingTopRight: normalizeContentPadding((padding.top + padding.right) / 2, padding.uniform),
      contentPaddingBottomLeft: normalizeContentPadding((padding.bottom + padding.left) / 2, padding.uniform),
      contentFontScale: normalizeWidgetContentFontScale(item.contentFontScale, 1),
      widgetThemeMode: normalizeWidgetThemeMode(item.widgetThemeMode, "inherit"),
      useCustomColors: Boolean(item.useCustomColors),
      customTextColor: normalizeWidgetColor(item.customTextColor, "#1F2226"),
      customAccentColor: normalizeWidgetColor(item.customAccentColor, "#1F4F9F"),
      customSurfaceColor: normalizeWidgetColor(item.customSurfaceColor, "#FFFAF2"),
      commonOverrides: normalizeCommonOverrides(item.commonOverrides),
      page: normalizeWidgetPage(item.page, maxLauncherPages, 0),
      dockOrder: normalizeDockOrder(item.dockOrder, null),
      containerId: isContainerWidget ? "" : normalizeContainerId(item.containerId),
      enabled: item.enabled !== false,
      gridLayout: normalizedGrid,
      layout: cloneLayout(item.layout || def.defaultLayout),
      config: mergedConfig
    });
  }

  const rawUi = raw?.ui || {};
  normalizeDockedWidgetOrders(normalized, rawUi.home);
  normalizeContainerAssignments(normalized);

  const theme = {
    ...defaultTheme(),
    ...(rawUi.theme || {})
  };
  const background = {
    ...defaultBackground(),
    ...(rawUi.background || {})
  };
  const maxInstancePage = normalized.reduce((max, instance) => {
    if (isWidgetDocked(instance) || isWidgetInContainer(instance)) {
      return max;
    }
    return Math.max(max, normalizeWidgetPage(instance.page, maxLauncherPages, 0));
  }, 0);
  const home = normalizeHomeLayout({
    ...(rawUi.home || {}),
    pageCount: Math.max(toTruthyNumberOrFallback(rawUi?.home?.pageCount, 1), maxInstancePage + 1)
  });
  for (const instance of normalized) {
    instance.page = normalizeWidgetPage(instance.page, home.pageCount, 0);
  }
  if (didLegacyHeadlessSurfaceMigration) {
    home.legacyHeadlessSurfaceMigrated = true;
  }
  const widgetCommonMaster = normalizeWidgetCommonMaster(rawUi.widgetCommonMaster || {});
  const shortcuts = {
    iconSizePercent: clampTruthyNumberOrFallback(rawUi.shortcuts?.iconSizePercent, 100, 40, 220)
  };
  const monday = normalizeMondayGlobalSettings(rawUi.monday);
  const defaultProfileSnapshot =
    rawUi.defaultProfileSnapshot && typeof rawUi.defaultProfileSnapshot === "object" && !Array.isArray(rawUi.defaultProfileSnapshot)
      ? clonePresetSnapshot(rawUi.defaultProfileSnapshot)
      : null;
  const defaultProfileUpdatedAt = toNonNegativeNumberOrFallback(rawUi.defaultProfileUpdatedAt);
  const rawPresets = arrayOrEmpty(raw?.presets);
  const presets = rawPresets
    .map((preset) => {
      if (!preset || typeof preset !== "object") {
        return null;
      }
      const snapshot = preset.snapshot;
      if (!snapshot || typeof snapshot !== "object") {
        return null;
      }
      return {
        id: normalizeText(preset.id, `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
        name: normalizeText(preset.name, "Preset"),
        createdAt: toTruthyNumberOrFallback(preset.createdAt, Date.now),
        updatedAt: toTruthyNumberOrFallback(preset.updatedAt, Date.now),
        snapshot: clonePresetSnapshot(snapshot)
      };
    })
    .filter(Boolean);

  theme.primary = normalizeHexColor(theme.primary, defaultTheme().primary);
  theme.accent = normalizeHexColor(theme.accent, defaultTheme().accent);
  theme.secondary = normalizeHexColor(theme.secondary, defaultTheme().secondary);
  theme.background = normalizeHexColor(theme.background, defaultTheme().background);
  theme.surface = normalizeHexColor(theme.surface, defaultTheme().surface);
  theme.text = normalizeHexColor(theme.text, defaultTheme().text);
  theme.line = normalizeHexColor(theme.line, defaultTheme().line);
  theme.fontScale = clampTruthyNumberOrFallback(theme.fontScale, 1, 0.5, 2);

  background.solidColor = normalizeHexColor(background.solidColor, defaultBackground().solidColor);
  background.wallpaperProvider = normalizeWallpaperProvider(background.wallpaperProvider, "picsum");
  background.wallpaperTheme = normalizeText(background.wallpaperTheme, "nature");
  background.redditSubreddit = normalizeText(background.redditSubreddit, "EarthPorn");
  background.redditTime = normalizeText(background.redditTime, "week");
  background.rotateMinutes = clampTruthyNumberOrFallback(background.rotateMinutes, 15, 1, 240);
  background.wallpaperCachedUrl = normalizeText(background.wallpaperCachedUrl);
  background.wallpaperCachedSignature = normalizeText(background.wallpaperCachedSignature);
  background.wallpaperCachedAt = toNonNegativeNumberOrFallback(background.wallpaperCachedAt);
  background.videoSource = normalizeVideoSource(background.videoSource, "manual");
  background.videoUrl = normalizeText(background.videoUrl);
  background.redditVideoSubreddit = normalizeText(background.redditVideoSubreddit, "loopingvideos");
  background.redditVideoTime = normalizeText(background.redditVideoTime, "week");
  background.localMediaDataUrl = normalizeText(background.localMediaDataUrl);
  background.localMediaType = normalizeLocalMediaType(background.localMediaType, "");
  if (!background.localMediaType && background.localMediaDataUrl) {
    background.localMediaType = inferLocalMediaTypeFromDataUrl(background.localMediaDataUrl);
  }
  background.localMediaName = normalizeText(background.localMediaName);
  background.localMediaBackgroundColor = normalizeHexColor(
    background.localMediaBackgroundColor,
    defaultBackground().localMediaBackgroundColor
  );
  background.localMediaFit = normalizeLocalMediaFit(background.localMediaFit, "stretch");
  background.videoCacheSignature = normalizeText(background.videoCacheSignature);
  background.videoCacheStoredAt = toNonNegativeNumberOrFallback(background.videoCacheStoredAt);
  background.blurAmount = clampTruthyNumberOrFallback(background.blurAmount, 0, 0, 28);
  background.overlayOpacity = clampTruthyNumberOrFallback(background.overlayOpacity, 0.24, 0, 0.85);

  for (const instance of normalized) {
    const hasSavedOverrides = Boolean(instance.commonOverrides && Object.values(instance.commonOverrides).some(Boolean));
    if (!hasSavedOverrides) {
      instance.commonOverrides = inferCommonOverrides(instance, widgetCommonMaster);
    }
    applyWidgetCommonMaster(instance, widgetCommonMaster, false);
  }

  return {
    mode: raw.mode === "edit" ? "edit" : "use",
    selectedWidgetId: raw.selectedWidgetId || "",
    nextId: Number(raw.nextId || 100),
    meta: {
      lastUserMutationAt: toNonNegativeNumberOrFallback(raw?.meta?.lastUserMutationAt)
    },
    ui: {
      activeTab:
        rawUi.activeTab === "background"
          ? "background"
          : rawUi.activeTab === "profile"
            ? "profile"
            : "global",
      theme,
      background,
      home,
      widgetCommonMaster,
      shortcuts,
      monday,
      defaultProfileSnapshot,
      defaultProfileUpdatedAt
    },
    presets,
    instances: hasExplicitInstances ? normalized : base.instances
  };
}
