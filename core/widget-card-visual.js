export function applyCardVisual(card, instance, deps) {
  card.classList.toggle("headless", instance.viewMode === "headless");
  const surfaceMode = deps.normalizeSurfaceMode(instance.surfaceMode, "normal");
  const edgeRoundness = deps.normalizeEdgeRoundness(instance.edgeRoundness, 12);
  const opacity = surfaceMode === "transparent" ? 0 : deps.normalizeTransparency(instance.transparency, 0.94);

  const ui = deps.getUi();
  const globalBlurEnabled = ui?.home?.widgetBackdropBlur !== false;
  const widgetBlurEnabled = instance.backdropBlur !== false;
  const cardBlurActive = globalBlurEnabled && widgetBlurEnabled;
  card.style.setProperty("--widget-backdrop-blur", cardBlurActive ? "12px" : "0px");
  card.style.setProperty("--widget-label-backdrop-blur", cardBlurActive ? "0px" : "11px");
  card.style.setProperty("--widget-edge-roundness", `${edgeRoundness}px`);
  card.classList.toggle("surface-transparent", surfaceMode === "transparent");
  card.style.setProperty("--widget-opacity", String(opacity));

  const align = instance.type === "aiChat" ? "top" : deps.normalizeAlign(instance.contentAlignY, deps.defaultWidgetContentAlign(instance.type));
  const titleAlign = deps.normalizeTitleAlign(instance.titleAlign, deps.defaultWidgetTitleAlign());
  instance.titleAlign = titleAlign;
  card.dataset.titleAlign = titleAlign;
  card.style.setProperty("--widget-title-align", titleAlign);
  card.dataset.contentAlignY = align;
  card.dataset.contentFill = instance.contentFillParent ? "true" : "false";

  const padding = deps.resolveWidgetPadding(instance);
  card.style.setProperty("--widget-content-padding", `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`);
  card.style.setProperty("--widget-pad-top", `${padding.top}px`);
  card.style.setProperty("--widget-pad-right", `${padding.right}px`);
  card.style.setProperty("--widget-pad-bottom", `${padding.bottom}px`);
  card.style.setProperty("--widget-pad-left", `${padding.left}px`);
  card.style.setProperty("--widget-head-offset", instance.viewMode === "headless" ? "0px" : "44px");

  instance.contentPaddingTop = padding.top;
  instance.contentPaddingRight = padding.right;
  instance.contentPaddingBottom = padding.bottom;
  instance.contentPaddingLeft = padding.left;
  instance.contentPaddingTopRight = deps.normalizeContentPadding((padding.top + padding.right) / 2, padding.uniform);
  instance.contentPaddingBottomLeft = deps.normalizeContentPadding((padding.bottom + padding.left) / 2, padding.uniform);
  instance.contentPadding = deps.normalizeContentPadding((padding.top + padding.right + padding.bottom + padding.left) / 4, padding.uniform);

  instance.contentFontScale = deps.normalizeWidgetContentFontScale(instance.contentFontScale, 1);
  const widgetContentFontScale = deps.shortTextWidgetTypes.has(instance.type)
    ? Math.max(instance.contentFontScale, deps.shortTextMinContentFontScale)
    : instance.contentFontScale;
  card.style.setProperty("--widget-content-font-scale", String(widgetContentFontScale));

  instance.edgeRoundness = edgeRoundness;
  const justify = align === "center" ? "center" : align === "bottom" ? "flex-end" : "flex-start";
  card.style.setProperty("--widget-content-justify", justify);

  const themeMode = deps.normalizeWidgetThemeMode(instance.widgetThemeMode, "inherit");
  card.dataset.widgetThemeMode = themeMode;

  const useCustom = Boolean(instance.useCustomColors);
  card.dataset.useCustomColors = useCustom ? "true" : "false";
  if (useCustom) {
    card.style.setProperty("--widget-custom-text", deps.normalizeWidgetColor(instance.customTextColor, "#1F2226"));
    card.style.setProperty("--widget-custom-accent", deps.normalizeWidgetColor(instance.customAccentColor, "#1F4F9F"));
    card.style.setProperty("--widget-custom-surface", deps.normalizeWidgetColor(instance.customSurfaceColor, "#FFFAF2"));
  } else {
    card.style.removeProperty("--widget-custom-text");
    card.style.removeProperty("--widget-custom-accent");
    card.style.removeProperty("--widget-custom-surface");
  }

  if (surfaceMode === "transparent") {
    const textColor = deps.resolveTransparentWidgetText(instance, ui, {
      sampledWallpaperBaseLuminance: deps.sampledWallpaperBaseLuminance
    });
    card.style.setProperty("--widget-transparent-text", textColor);
    card.style.setProperty(
      "--widget-transparent-ghost-opacity",
      String(deps.resolveTransparentGhostOpacity(ui, instance.transparentGhostStrength))
    );
  } else {
    card.style.removeProperty("--widget-transparent-text");
    card.style.removeProperty("--widget-transparent-ghost-opacity");
  }
}
