import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCommonMasterToDraft,
  buildWidgetModalDraft
} from "../core/widget-modal-draft.js";

const deps = {
  resolveWidgetPadding: () => ({ top: 12, right: 14, bottom: 16, left: 18, uniform: 15 }),
  normalizeWidgetPage: (page) => page,
  normalizeSurfaceMode: (value, fallback) => value || fallback,
  normalizeTransparentGhostStrength: (value, fallback) => value ?? fallback,
  normalizeEdgeRoundness: (value, fallback) => value ?? fallback,
  normalizeTransparency: (value, fallback) => value ?? fallback,
  normalizeTitleAlign: (value, fallback) => value || fallback,
  defaultWidgetTitleAlign: () => "center",
  normalizeAlign: (value, fallback) => value || fallback,
  defaultWidgetContentAlign: () => "top",
  normalizeContentPadding: (value) => Number(value),
  normalizeWidgetContentFontScale: (value, fallback) => value ?? fallback,
  normalizeWidgetThemeMode: (value, fallback) => value || fallback,
  normalizeWidgetColor: (value, fallback) => value || fallback,
  widgetPaddingFallback: () => 10
};

test("buildWidgetModalDraft builds modal draft with normalized values", () => {
  const draft = buildWidgetModalDraft(
    {
      type: "weather",
      title: "Weather",
      page: 2,
      viewMode: "window",
      surfaceMode: "transparent",
      transparentAutoContrast: true,
      transparentGhostStrength: 120,
      backdropBlur: true,
      edgeRoundness: 8,
      transparency: 0.7,
      titleAlign: "left",
      contentAlignY: "center",
      contentFillParent: true,
      contentFontScale: 1.1,
      widgetThemeMode: "dark",
      useCustomColors: true,
      customTextColor: "#111111",
      customAccentColor: "#222222",
      customSurfaceColor: "#333333",
      layout: { x: 1, y: 2, w: 3, h: 4 },
      config: { a: 1 }
    },
    { pageCount: 5 },
    deps
  );

  assert.equal(draft.page, 3);
  assert.equal(draft.contentPaddingTop, 12);
  assert.equal(draft.contentPaddingBottomLeft, 17);
  assert.equal(draft.customSurfaceColor, "#333333");
  assert.deepEqual(draft.layout, { x: 1, y: 2, w: 3, h: 4 });
});

test("applyCommonMasterToDraft updates draft defaults from master", () => {
  const draft = {};
  const result = applyCommonMasterToDraft(
    draft,
    "weather",
    {
      viewMode: "headless",
      surfaceMode: "transparent",
      transparentAutoContrast: false,
      transparentGhostStrength: 150,
      backdropBlur: false,
      edgeRoundness: 9,
      transparency: 0.6,
      titleAlign: "right",
      contentAlignY: "bottom",
      contentFillParent: true,
      contentPadding: 21,
      contentFontScale: 1.2,
      widgetThemeMode: "light",
      useCustomColors: true,
      customTextColor: "#abcdef",
      customAccentColor: "#123456",
      customSurfaceColor: "#654321"
    },
    deps
  );

  assert.equal(result, draft);
  assert.equal(draft.viewMode, "headless");
  assert.equal(draft.contentPaddingLeft, 21);
  assert.equal(draft.contentFontScale, 1.2);
  assert.equal(draft.customAccentColor, "#123456");
});
