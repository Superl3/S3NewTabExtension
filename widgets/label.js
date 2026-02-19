function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const AUTO_LIGHT_TEXT = "#f3f7ff";
const AUTO_DARK_TEXT = "#151a23";

function normalizeHex(value, fallback) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text) || /^#[0-9a-fA-F]{3}$/.test(text)) {
    return text;
  }
  return fallback;
}

function hexToRgb(hex) {
  const value = normalizeHex(hex, "#000000").slice(1);
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

function srgbToLinear(channel) {
  const c = clamp(channel, 0, 255) / 255;
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb) {
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

function estimateBackdropLuminance(ui) {
  const mode = String(ui?.background?.mode || "gradient");
  const overlay = clamp(Number(ui?.background?.overlayOpacity) || 0.24, 0, 0.85);
  const overlayLum = luminance({ r: 8, g: 11, b: 16 });

  const themeBackgroundLum = luminance(hexToRgb(normalizeHex(ui?.theme?.background, "#f3efe6")));
  const themeSurfaceLum = luminance(hexToRgb(normalizeHex(ui?.theme?.surface, "#fffaf2")));
  const themeAccentLum = luminance(hexToRgb(normalizeHex(ui?.theme?.accent, "#1f4f9f")));

  let baseLum = themeBackgroundLum;
  if (mode === "solid") {
    baseLum = luminance(hexToRgb(normalizeHex(ui?.background?.solidColor, "#1f2937")));
  } else if (mode === "gradient") {
    baseLum = (themeBackgroundLum + themeSurfaceLum + themeAccentLum) / 3;
  } else if (mode === "wallpaper" || mode === "video") {
    baseLum = clamp((themeBackgroundLum + 0.58) / 2, 0, 1);
  }

  return baseLum * (1 - overlay) + overlayLum * overlay;
}

function resolveAutoColor(ui) {
  const lum = estimateBackdropLuminance(ui);
  return lum >= 0.5 ? AUTO_DARK_TEXT : AUTO_LIGHT_TEXT;
}

export const labelWidget = {
  type: "label",
  title: "Label",
  defaultConfig: {
    text: "Your Label",
    autoContrastOnTransparent: true,
    color: "#ffffff",
    fontSize: 36,
    fontWeight: 700,
    align: "center"
  },
  defaultLayout: {
    x: 580,
    y: 570,
    w: 560,
    h: 150
  },
  settingsSchema: [
    { key: "text", label: "Text", type: "textarea", placeholder: "Type your text" },
    {
      key: "autoContrastOnTransparent",
      label: "Auto contrast in transparent mode",
      type: "checkbox",
      helpText: "When surface mode is transparent, pick light/dark label color from background tone automatically."
    },
    { key: "color", label: "Text color", type: "color" },
    { key: "fontSize", label: "Font size", type: "number", min: 12, max: 128, step: 1 },
    { key: "fontWeight", label: "Font weight", type: "number", min: 200, max: 900, step: 100 },
    {
      key: "align",
      label: "Align",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" }
      ]
    }
  ],
  create({ container, getConfig, getUi, getWidget }) {
    const text = document.createElement("div");
    text.className = "label-widget-text";
    const value = document.createElement("span");
    value.className = "label-widget-value";
    text.append(value);
    container.append(text);

    function render() {
      const cfg = getConfig();
      const widget = typeof getWidget === "function" ? getWidget() : null;
      const ui = typeof getUi === "function" ? getUi() : null;
      const useAutoContrast = cfg.autoContrastOnTransparent !== false;
      const isTransparent = widget?.surfaceMode === "transparent";
      const align = ["left", "center", "right"].includes(cfg.align) ? cfg.align : "center";
      const manualColor = normalizeHex(cfg.color, "#ffffff");
      const resolvedColor = isTransparent && useAutoContrast ? resolveAutoColor(ui) : manualColor;

      value.textContent = cfg.text || "";
      value.style.color = resolvedColor;
      value.style.fontSize = `${clamp(Number(cfg.fontSize) || 36, 12, 128)}px`;
      value.style.fontWeight = String(clamp(Number(cfg.fontWeight) || 700, 200, 900));
      text.style.textAlign = align;

      if (isTransparent && useAutoContrast) {
        value.style.textShadow =
          resolvedColor === AUTO_DARK_TEXT ? "0 2px 10px rgba(255, 255, 255, 0.34)" : "0 2px 12px rgba(2, 6, 9, 0.5)";
      } else {
        value.style.removeProperty("text-shadow");
      }
    }

    render();

    return {
      refresh: render
    };
  }
};
