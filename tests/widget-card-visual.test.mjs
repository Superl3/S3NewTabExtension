import test from "node:test";
import assert from "node:assert/strict";

import { applyCardVisual } from "../core/widget-card-visual.js";

function createClassList() {
  const set = new Set();
  return {
    toggle(name, force) {
      const next = typeof force === "boolean" ? force : !set.has(name);
      if (next) {
        set.add(name);
      } else {
        set.delete(name);
      }
      return next;
    },
    has(name) {
      return set.has(name);
    }
  };
}

function createCard() {
  const styleMap = new Map();
  return {
    dataset: {},
    classList: createClassList(),
    style: {
      setProperty(name, value) {
        styleMap.set(name, String(value));
      },
      removeProperty(name) {
        styleMap.delete(name);
      },
      get(name) {
        return styleMap.get(name);
      },
      has(name) {
        return styleMap.has(name);
      }
    }
  };
}

test("applyCardVisual applies transparent card styles and short-text font floor", () => {
  const card = createCard();
  const instance = {
    viewMode: "headless",
    surfaceMode: "transparent",
    edgeRoundness: 15,
    transparency: 0.5,
    backdropBlur: true,
    type: "note",
    contentAlignY: "bottom",
    titleAlign: "left",
    contentFillParent: true,
    contentFontScale: 0.6,
    useCustomColors: true,
    customTextColor: "#111111",
    customAccentColor: "#222222",
    customSurfaceColor: "#333333",
    widgetThemeMode: "dark",
    transparentGhostStrength: 0.8
  };

  applyCardVisual(card, instance, {
    normalizeSurfaceMode: (value) => value,
    normalizeEdgeRoundness: (value) => Number(value),
    normalizeTransparency: (value) => Number(value),
    getUi: () => ({ home: { widgetBackdropBlur: true } }),
    normalizeAlign: (value) => value,
    defaultWidgetContentAlign: () => "top",
    normalizeTitleAlign: (value, fallback) => value || fallback,
    defaultWidgetTitleAlign: () => "center",
    resolveWidgetPadding: () => ({ top: 4, right: 6, bottom: 8, left: 10, uniform: 7 }),
    normalizeContentPadding: (value) => Math.round(Number(value) || 0),
    normalizeWidgetContentFontScale: (value) => Number(value) || 1,
    shortTextWidgetTypes: new Set(["note"]),
    shortTextMinContentFontScale: 0.9,
    normalizeWidgetThemeMode: (value, fallback) => value || fallback,
    normalizeWidgetColor: (value, fallback) => value || fallback,
    resolveTransparentWidgetText: () => "#FAFAFA",
    sampledWallpaperBaseLuminance: 0.33,
    resolveTransparentGhostOpacity: () => 0.55
  });

  assert.equal(card.classList.has("headless"), true);
  assert.equal(card.classList.has("surface-transparent"), true);
  assert.equal(card.style.get("--widget-opacity"), "0");
  assert.equal(card.style.get("--widget-content-font-scale"), "0.9");
  assert.equal(card.style.get("--widget-custom-text"), "#111111");
  assert.equal(card.style.get("--widget-transparent-text"), "#FAFAFA");
  assert.equal(card.style.get("--widget-transparent-ghost-opacity"), "0.55");
  assert.equal(card.style.get("--widget-content-justify"), "flex-end");
  assert.equal(card.dataset.titleAlign, "left");
  assert.equal(card.dataset.useCustomColors, "true");
  assert.equal(instance.contentPaddingTop, 4);
  assert.equal(instance.contentPaddingBottomLeft, 9);
  assert.equal(instance.edgeRoundness, 15);
});

test("applyCardVisual clears custom and transparent styles in normal mode", () => {
  const card = createCard();
  card.style.setProperty("--widget-custom-text", "#old");
  card.style.setProperty("--widget-transparent-text", "#old");

  const instance = {
    viewMode: "normal",
    surfaceMode: "normal",
    edgeRoundness: 12,
    transparency: 0.8,
    backdropBlur: false,
    type: "clock",
    contentAlignY: "top",
    titleAlign: "",
    contentFillParent: false,
    contentFontScale: 1,
    useCustomColors: false,
    widgetThemeMode: "inherit",
    transparentGhostStrength: 0.3
  };

  applyCardVisual(card, instance, {
    normalizeSurfaceMode: (value) => value,
    normalizeEdgeRoundness: (value) => Number(value),
    normalizeTransparency: (value) => Number(value),
    getUi: () => ({ home: { widgetBackdropBlur: false } }),
    normalizeAlign: (value) => value,
    defaultWidgetContentAlign: () => "top",
    normalizeTitleAlign: (_value, fallback) => fallback,
    defaultWidgetTitleAlign: () => "center",
    resolveWidgetPadding: () => ({ top: 2, right: 2, bottom: 2, left: 2, uniform: 2 }),
    normalizeContentPadding: (value) => Math.round(Number(value) || 0),
    normalizeWidgetContentFontScale: (value) => Number(value) || 1,
    shortTextWidgetTypes: new Set(["note"]),
    shortTextMinContentFontScale: 0.9,
    normalizeWidgetThemeMode: (value, fallback) => value || fallback,
    normalizeWidgetColor: (value, fallback) => value || fallback,
    resolveTransparentWidgetText: () => "#unused",
    sampledWallpaperBaseLuminance: null,
    resolveTransparentGhostOpacity: () => 0.4
  });

  assert.equal(card.classList.has("surface-transparent"), false);
  assert.equal(card.style.get("--widget-opacity"), "0.8");
  assert.equal(card.style.get("--widget-backdrop-blur"), "0px");
  assert.equal(card.style.has("--widget-custom-text"), false);
  assert.equal(card.style.has("--widget-transparent-text"), false);
  assert.equal(card.dataset.useCustomColors, "false");
  assert.equal(card.dataset.titleAlign, "center");
});
