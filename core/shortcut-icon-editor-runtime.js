export function createShortcutIconEditorRuntime(deps) {
  const getTheme = () => deps.getTheme?.() || {};

  function shortcutEditorContext() {
    const canvas = deps.elements?.shortcutIconEditorCanvas;
    const isCanvasElement = typeof HTMLCanvasElement !== "undefined"
      ? canvas instanceof HTMLCanvasElement
      : Boolean(canvas && typeof canvas.getContext === "function");
    if (!isCanvasElement) {
      return null;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    return { canvas, ctx };
  }

  function normalizeShortcutIconShape(value) {
    const raw = deps.normalizeText(value);
    if (raw === "round" || raw === "flatSquared" || raw === "roundSquared") {
      return raw;
    }
    return "roundSquared";
  }

  function normalizeShortcutIconCache(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      const normalizedKey = deps.normalizeText(key);
      const normalizedValue = deps.normalizeText(value);
      if (!normalizedKey || !normalizedValue.startsWith("data:image/")) {
        continue;
      }
      out[normalizedKey] = normalizedValue;
    }
    return out;
  }

  function escapeXml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function shortcutEditorThemeColors() {
    const fallback = deps.defaultTheme();
    const theme = getTheme();
    return {
      surface: deps.normalizeDisplayColor(theme.surface, fallback.surface),
      line: deps.normalizeDisplayColor(theme.line, fallback.line),
      text: deps.normalizeDisplayColor(theme.text, fallback.text),
      accent: deps.normalizeDisplayColor(theme.accent, fallback.accent)
    };
  }

  function shortcutEditorShapeSvg(shape, inset, fill, stroke, strokeWidth = 6) {
    if (shape === "round") {
      const radius = Math.max(1, 64 - inset);
      return `<circle cx="64" cy="64" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    const size = Math.max(1, 128 - inset * 2);
    const radius = shape === "roundSquared" ? 24 : 0;
    return `<rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  function shortcutEditorClipShapeSvg(shape, inset) {
    if (shape === "round") {
      const radius = Math.max(1, 64 - inset);
      return `<circle cx="64" cy="64" r="${radius}" />`;
    }

    const size = Math.max(1, 128 - inset * 2);
    const radius = shape === "roundSquared" ? 20 : 0;
    return `<rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}" />`;
  }

  function shortcutEditorSelectedPreset() {
    const target = deps.normalizeText(deps.shortcutIconEditorState.selectedPreset, deps.shortcutIconPresets[0].id);
    return deps.shortcutIconPresets.find((item) => item.id === target) || deps.shortcutIconPresets[0];
  }

  function renderShortcutEditorPreviewDataUrl(dataUrl) {
    const context = shortcutEditorContext();
    if (!context) {
      return;
    }

    const { canvas, ctx } = context;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!dataUrl) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = dataUrl;
  }

  function shortcutEditorBuildDataUrl() {
    const shape = normalizeShortcutIconShape(deps.shortcutIconEditorState.shape);
    const scale = deps.clamp(Number(deps.shortcutIconEditorState.scale) || 100, 60, 160);
    const textValue = deps.normalizeText(deps.shortcutIconEditorState.text).slice(0, 4);
    const textSize = deps.clamp(Number(deps.shortcutIconEditorState.textSize) || 58, 24, 92);
    const colors = shortcutEditorThemeColors();

    const containerSize = deps.clamp(Math.round(86 * (scale / 100)), 44, 112);
    const contentX = Math.round((128 - containerSize) / 2);
    const contentY = Math.round((128 - containerSize) / 2);

    let contentSvg = "";
    if (deps.shortcutIconEditorState.source === "text" && textValue) {
      const fontSize = deps.clamp(Math.round(textSize * (scale / 100)), 18, 100);
      const fontFamily = escapeXml(getTheme().fontFamily || deps.defaultTheme().fontFamily);
      contentSvg = `<text x="64" y="64" text-anchor="middle" dominant-baseline="middle" font-family="${fontFamily}" font-size="${fontSize}" font-weight="700" fill="${colors.text}">${escapeXml(textValue)}</text>`;
    } else if (deps.shortcutIconEditorState.source === "cache" || deps.shortcutIconEditorState.source === "image") {
      const sourceData = deps.shortcutIconEditorState.source === "cache"
        ? deps.normalizeText(
            deps.shortcutIconEditorState.cacheEntries.find((entry) => entry.key === deps.shortcutIconEditorState.selectedCache)?.data
          )
        : deps.normalizeText(deps.shortcutIconEditorState.importedDataUrl);
      if (sourceData) {
        const clipShape = shortcutEditorClipShapeSvg(shape, 14);
        contentSvg =
          `<defs><clipPath id="shortcutClipShape">${clipShape}</clipPath></defs>` +
          `<image href="${escapeXml(sourceData)}" x="${contentX}" y="${contentY}" width="${containerSize}" height="${containerSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shortcutClipShape)" />`;
      }
    } else {
      const preset = shortcutEditorSelectedPreset();
      contentSvg =
        `<svg x="${contentX}" y="${contentY}" width="${containerSize}" height="${containerSize}" viewBox="${preset.viewBox}" fill="none" stroke="${colors.text}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
        `${preset.markup}</svg>`;
    }

    if (!contentSvg) {
      return "";
    }

    const shell = shortcutEditorShapeSvg(shape, 6, colors.surface, colors.line, 6);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${shell}${contentSvg}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function shortcutEditorRefreshPreview() {
    deps.shortcutIconEditorState.shape = normalizeShortcutIconShape(deps.elements?.shortcutIconEditorShape?.value);
    deps.shortcutIconEditorState.scale = deps.clamp(Number(deps.elements?.shortcutIconEditorScale?.value) || 100, 60, 160);
    deps.shortcutIconEditorState.text = deps.normalizeText(deps.elements?.shortcutIconEditorText?.value).slice(0, 4);
    deps.shortcutIconEditorState.textSize = deps.clamp(Number(deps.elements?.shortcutIconEditorFontSize?.value) || 58, 24, 92);

    if (deps.shortcutIconEditorState.source === "text" && deps.shortcutIconEditorState.text.length === 0) {
      deps.shortcutIconEditorState.source = "preset";
    }

    const nextDataUrl = shortcutEditorBuildDataUrl();
    deps.shortcutIconEditorState.previewDataUrl = nextDataUrl;
    renderShortcutEditorPreviewDataUrl(nextDataUrl);
    renderShortcutIconEditorPresetGrid();
    renderShortcutIconEditorCachedGrid();
  }

  function renderShortcutIconEditorPresetGrid() {
    const host = deps.elements?.shortcutIconEditorPresetGrid;
    if (!host) {
      return;
    }
    host.replaceChildren();

    for (const preset of deps.shortcutIconPresets) {
      const button = deps.documentObj.createElement("button");
      button.type = "button";
      button.className = "shortcut-icon-editor-pick";
      button.classList.toggle(
        "active",
        deps.shortcutIconEditorState.source === "preset" && deps.shortcutIconEditorState.selectedPreset === preset.id
      );
      button.title = preset.label;
      button.innerHTML = `<svg class="icon" viewBox="${preset.viewBox}">${preset.markup}</svg>`;
      button.addEventListener("click", () => {
        deps.shortcutIconEditorState.source = "preset";
        deps.shortcutIconEditorState.selectedPreset = preset.id;
        shortcutEditorRefreshPreview();
      });
      host.append(button);
    }
  }

  function renderShortcutIconEditorCachedGrid() {
    const host = deps.elements?.shortcutIconEditorCachedGrid;
    if (!host) {
      return;
    }
    host.replaceChildren();

    if (!deps.shortcutIconEditorState.cacheEntries.length) {
      const muted = deps.documentObj.createElement("span");
      muted.className = "muted";
      muted.textContent = "No cached icons yet";
      host.append(muted);
      return;
    }

    for (const entry of deps.shortcutIconEditorState.cacheEntries) {
      const button = deps.documentObj.createElement("button");
      button.type = "button";
      button.className = "shortcut-icon-editor-pick";
      button.classList.toggle(
        "active",
        deps.shortcutIconEditorState.source === "cache" && deps.shortcutIconEditorState.selectedCache === entry.key
      );
      button.title = entry.key;
      const img = deps.documentObj.createElement("img");
      img.src = entry.data;
      img.alt = "";
      button.append(img);
      button.addEventListener("click", () => {
        deps.shortcutIconEditorState.source = "cache";
        deps.shortcutIconEditorState.selectedCache = entry.key;
        shortcutEditorRefreshPreview();
      });
      host.append(button);
    }
  }

  async function loadShortcutIconEditorCacheEntries() {
    try {
      const raw = await deps.storageLocalGet(deps.shortcutIconCacheKey);
      const normalized = normalizeShortcutIconCache(raw?.[deps.shortcutIconCacheKey]);
      deps.shortcutIconEditorState.cacheEntries = Object.entries(normalized)
        .slice(-48)
        .reverse()
        .map(([key, data]) => ({ key, data }));
    } catch {
      deps.shortcutIconEditorState.cacheEntries = [];
    }
    renderShortcutIconEditorCachedGrid();
  }

  function clearShortcutIconEditorCanvas() {
    const context = shortcutEditorContext();
    if (!context) {
      return;
    }
    context.ctx.clearRect(0, 0, context.canvas.width, context.canvas.height);
  }

  function resetShortcutIconEditorSource() {
    deps.shortcutIconEditorState.source = "none";
    deps.shortcutIconEditorState.selectedCache = "";
    deps.shortcutIconEditorState.importedDataUrl = "";
    deps.shortcutIconEditorState.text = "";
    if (deps.elements?.shortcutIconEditorText) {
      deps.elements.shortcutIconEditorText.value = "";
    }
    shortcutEditorRefreshPreview();
  }

  function closeShortcutIconEditor() {
    if (!deps.shortcutIconEditorState.open) {
      return false;
    }

    deps.shortcutIconEditorState.open = false;
    deps.shortcutIconEditorState.source = "none";
    deps.shortcutIconEditorState.onApply = null;
    deps.shortcutIconEditorState.previewDataUrl = "";
    deps.shortcutIconEditorState.importedDataUrl = "";
    clearShortcutIconEditorCanvas();
    deps.blurFocusedElementInOverlay(deps.elements?.shortcutIconEditorOverlay);
    deps.elements?.shortcutIconEditorOverlay?.classList.remove("open");
    deps.elements?.shortcutIconEditorOverlay?.setAttribute("aria-hidden", "true");
    return true;
  }

  function openShortcutIconEditor(iconValue, onApply) {
    const initial = deps.normalizeText(iconValue);
    deps.shortcutIconEditorState.open = true;
    deps.shortcutIconEditorState.onApply = typeof onApply === "function" ? onApply : null;
    deps.shortcutIconEditorState.shape = "roundSquared";
    deps.shortcutIconEditorState.scale = 100;
    deps.shortcutIconEditorState.textSize = 58;
    deps.shortcutIconEditorState.selectedPreset = deps.shortcutIconPresets[0].id;
    deps.shortcutIconEditorState.selectedCache = "";
    deps.shortcutIconEditorState.importedDataUrl = "";

    if (deps.elements?.shortcutIconEditorShape) {
      deps.elements.shortcutIconEditorShape.value = "roundSquared";
    }
    if (deps.elements?.shortcutIconEditorScale) {
      deps.elements.shortcutIconEditorScale.value = "100";
    }
    if (deps.elements?.shortcutIconEditorFontSize) {
      deps.elements.shortcutIconEditorFontSize.value = "58";
    }
    if (deps.elements?.shortcutIconEditorText) {
      deps.elements.shortcutIconEditorText.value = "";
    }

    if (initial.startsWith("data:image/")) {
      deps.shortcutIconEditorState.source = "image";
      deps.shortcutIconEditorState.importedDataUrl = initial;
    } else if (
      initial &&
      !initial.startsWith("http://") &&
      !initial.startsWith("https://") &&
      !initial.startsWith("chrome-extension://")
    ) {
      deps.shortcutIconEditorState.source = "text";
      deps.shortcutIconEditorState.text = initial.slice(0, 4);
      if (deps.elements?.shortcutIconEditorText) {
        deps.elements.shortcutIconEditorText.value = deps.shortcutIconEditorState.text;
      }
    } else {
      deps.shortcutIconEditorState.source = "preset";
    }

    deps.elements?.shortcutIconEditorOverlay?.classList.add("open");
    deps.elements?.shortcutIconEditorOverlay?.setAttribute("aria-hidden", "false");
    void loadShortcutIconEditorCacheEntries();
    renderShortcutIconEditorPresetGrid();
    renderShortcutIconEditorCachedGrid();
    shortcutEditorRefreshPreview();
  }

  function applyShortcutIconEditor() {
    if (!deps.shortcutIconEditorState.open) {
      return false;
    }

    try {
      const dataUrl = shortcutEditorBuildDataUrl();
      deps.shortcutIconEditorState.onApply?.(dataUrl || "");
      return true;
    } finally {
      closeShortcutIconEditor();
    }
  }

  function loadImageIntoShortcutEditor(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      if (!raw.startsWith("data:image/")) {
        return;
      }
      deps.shortcutIconEditorState.source = "image";
      deps.shortcutIconEditorState.importedDataUrl = raw;
      shortcutEditorRefreshPreview();
    };
    reader.readAsDataURL(file);
  }

  return {
    shortcutEditorContext,
    normalizeShortcutIconShape,
    normalizeShortcutIconCache,
    escapeXml,
    shortcutEditorThemeColors,
    shortcutEditorShapeSvg,
    shortcutEditorClipShapeSvg,
    shortcutEditorSelectedPreset,
    renderShortcutEditorPreviewDataUrl,
    shortcutEditorBuildDataUrl,
    shortcutEditorRefreshPreview,
    renderShortcutIconEditorPresetGrid,
    renderShortcutIconEditorCachedGrid,
    loadShortcutIconEditorCacheEntries,
    clearShortcutIconEditorCanvas,
    resetShortcutIconEditorSource,
    closeShortcutIconEditor,
    openShortcutIconEditor,
    applyShortcutIconEditor,
    loadImageIntoShortcutEditor
  };
}
