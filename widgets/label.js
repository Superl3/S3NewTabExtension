import { clamp } from "../core/utils/number.js";
import { luminanceFromHex, normalizeHexColor } from "../core/widget-common-style.js";

const AUTO_LIGHT_TEXT = "#f3f7ff";
const AUTO_DARK_TEXT = "#151a23";

function estimateBackdropLuminance(ui) {
  const mode = String(ui?.background?.mode || "gradient");
  const overlay = clamp(Number(ui?.background?.overlayOpacity) || 0.24, 0, 0.85);
  const overlayLum = luminanceFromHex("#080B10");

  const themeBackgroundLum = luminanceFromHex(normalizeHexColor(ui?.theme?.background, "#f3efe6"));
  const themeSurfaceLum = luminanceFromHex(normalizeHexColor(ui?.theme?.surface, "#fffaf2"));
  const themeAccentLum = luminanceFromHex(normalizeHexColor(ui?.theme?.accent, "#1f4f9f"));

  let baseLum = themeBackgroundLum;
  if (mode === "solid") {
    baseLum = luminanceFromHex(normalizeHexColor(ui?.background?.solidColor, "#1f2937"));
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
      const manualColor = normalizeHexColor(cfg.color, "#ffffff");
      const autoFallbackColor = resolveAutoColor(ui);

      value.textContent = cfg.text || "";
      value.style.color = isTransparent && useAutoContrast
        ? `var(--widget-transparent-text, ${autoFallbackColor})`
        : manualColor;
      value.style.fontSize = `${clamp(Number(cfg.fontSize) || 36, 12, 128)}px`;
      value.style.fontWeight = String(clamp(Number(cfg.fontWeight) || 700, 200, 900));
      text.style.textAlign = align;

      if (isTransparent && useAutoContrast) {
        value.style.textShadow = "0 1px 2px rgba(2, 6, 9, 0.56), 0 0 1px rgba(243, 247, 255, 0.34)";
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
