import test from "node:test";
import assert from "node:assert/strict";

import {
  applyWidgetCommonMaster,
  applyWidgetCommonMasterPatch,
  defaultWidgetCommonMaster,
  inferCommonOverrides,
  instanceCommonValue,
  normalizeBackdropOverlayOpacity,
  normalizeCommonOverrides,
  normalizeHexColor,
  normalizeTransparency,
  normalizeWidgetContentFontScale,
  normalizeWidgetColor,
  normalizeWidgetCommonMaster,
  resolveTransparentGhostOpacity,
  resolveTransparentWidgetText,
  resolveWidgetPadding,
  setInstanceCommonValue
} from "../core/widget-common-style.js";

test("normalizeHexColor keeps valid hex and falls back for invalid", () => {
  assert.equal(normalizeHexColor("#abc", "#000000"), "#abc");
  assert.equal(normalizeHexColor("#A1B2C3", "#000000"), "#A1B2C3");
  assert.equal(normalizeHexColor("abc", "#FF00FF"), "#FF00FF");
});

test("normalizeWidgetColor uppercases normalized values", () => {
  assert.equal(normalizeWidgetColor("#abc", "#112233"), "#ABC");
  assert.equal(normalizeWidgetColor("#112233", "#445566"), "#112233");
});

test("numeric common style normalizers preserve fallback semantics", () => {
  assert.equal(normalizeTransparency("2", 0.94), 1);
  assert.equal(normalizeTransparency("bad", 2), 1);
  assert.equal(Number.isNaN(normalizeTransparency("bad", "bad")), true);
  assert.equal(normalizeWidgetContentFontScale("0.25", 1), 0.5);
  assert.equal(normalizeWidgetContentFontScale("bad", 3), 2);
  assert.equal(normalizeWidgetContentFontScale("bad", 0), 1);
});

test("overlay opacity normalization preserves falsy fallback behavior", () => {
  assert.equal(normalizeBackdropOverlayOpacity(0), 0.24);
  assert.equal(normalizeBackdropOverlayOpacity(""), 0.24);
  assert.equal(normalizeBackdropOverlayOpacity(null), 0.24);
  assert.equal(normalizeBackdropOverlayOpacity(-1), 0);
  assert.equal(normalizeBackdropOverlayOpacity(2), 0.85);
  assert.equal(normalizeBackdropOverlayOpacity(0.5), 0.5);
});

test("resolveWidgetPadding resolves directional and uniform paddings", () => {
  const padding = resolveWidgetPadding({
    type: "note",
    contentPadding: 12,
    contentPaddingTop: 10,
    contentPaddingRight: 11,
    contentPaddingBottom: 13,
    contentPaddingLeft: 14
  });

  assert.deepEqual(padding, {
    top: 10,
    right: 11,
    bottom: 13,
    left: 14,
    uniform: 12
  });
});

test("normalizeWidgetCommonMaster and override helpers keep contracts", () => {
  const master = normalizeWidgetCommonMaster({
    transparency: 2,
    contentPadding: -5,
    contentFontScale: 3,
    customTextColor: "#abc"
  });

  assert.equal(master.transparency, 1);
  assert.equal(master.contentPadding, 0);
  assert.equal(master.contentFontScale, 2);
  assert.equal(master.customTextColor, "#ABC");

  const instance = {
    type: "note",
    commonOverrides: normalizeCommonOverrides({ contentPadding: true }),
    contentPadding: 20,
    contentPaddingTop: 20,
    contentPaddingRight: 20,
    contentPaddingBottom: 20,
    contentPaddingLeft: 20,
    contentFontScale: 1,
    transparency: 0.94,
    backdropBlur: true,
    edgeRoundness: 12,
    contentAlignY: "top",
    titleAlign: "center",
    contentFillParent: false,
    viewMode: "window",
    surfaceMode: "normal",
    transparentAutoContrast: true,
    transparentGhostStrength: 100,
    widgetThemeMode: "inherit",
    useCustomColors: false,
    customTextColor: "#1F2226",
    customAccentColor: "#1F4F9F",
    customSurfaceColor: "#FFFAF2"
  };

  applyWidgetCommonMaster(instance, master, false);
  assert.equal(instanceCommonValue(instance, "contentPadding"), 20);

  const overrides = inferCommonOverrides(instance, master);
  assert.equal(overrides.contentPadding, true);
});

test("setInstanceCommonValue applies content and color fields", () => {
  const instance = {
    type: "note",
    contentPadding: 10,
    contentPaddingTop: 10,
    contentPaddingRight: 10,
    contentPaddingBottom: 10,
    contentPaddingLeft: 10,
    contentPaddingTopRight: 10,
    contentPaddingBottomLeft: 10
  };

  setInstanceCommonValue(instance, "contentPadding", 18);
  setInstanceCommonValue(instance, "customTextColor", "#abc");

  assert.equal(instance.contentPadding, 18);
  assert.equal(instance.contentPaddingTop, 18);
  assert.equal(instance.customTextColor, "#ABC");
});

test("applyWidgetCommonMasterPatch applies changed master fields despite existing overrides", () => {
  const master = normalizeWidgetCommonMaster({
    viewMode: "headless",
    contentPadding: 16
  });
  const instance = {
    type: "note",
    commonOverrides: normalizeCommonOverrides({
      viewMode: true,
      contentPadding: true
    }),
    viewMode: "window",
    contentPadding: 22,
    contentPaddingTop: 22,
    contentPaddingRight: 22,
    contentPaddingBottom: 22,
    contentPaddingLeft: 22,
    contentPaddingTopRight: 22,
    contentPaddingBottomLeft: 22,
    contentFontScale: 1,
    transparency: 0.94,
    backdropBlur: true,
    edgeRoundness: 12,
    contentAlignY: "top",
    titleAlign: "center",
    contentFillParent: false,
    surfaceMode: "normal",
    transparentAutoContrast: true,
    transparentGhostStrength: 100,
    widgetThemeMode: "inherit",
    useCustomColors: false,
    customTextColor: "#1F2226",
    customAccentColor: "#1F4F9F",
    customSurfaceColor: "#FFFAF2"
  };

  applyWidgetCommonMasterPatch(instance, master, { viewMode: "headless" });

  assert.equal(instance.viewMode, "headless");
  assert.equal(instance.commonOverrides.viewMode, false);
  assert.equal(instanceCommonValue(instance, "contentPadding"), 22);
  assert.equal(instance.commonOverrides.contentPadding, true);
});

test("resolveTransparentWidgetText and ghost opacity remain deterministic", () => {
  const ui = {
    background: {
      mode: "wallpaper",
      overlayOpacity: 0.24
    },
    theme: {
      text: "#101010",
      background: "#F3EFE6",
      surface: "#FFFAF2",
      accent: "#1F4F9F"
    }
  };

  const textColor = resolveTransparentWidgetText(
    {
      useCustomColors: false,
      transparentAutoContrast: true
    },
    ui,
    { sampledWallpaperBaseLuminance: 0.1 }
  );

  assert.equal(typeof textColor, "string");
  assert.equal(textColor.startsWith("#"), true);
  assert.equal(resolveTransparentGhostOpacity(ui, 120) > 0, true);
  assert.deepEqual(Object.keys(defaultWidgetCommonMaster()).length > 0, true);
});
