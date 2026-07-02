import test from "node:test";
import assert from "node:assert/strict";

import {
  applyWidgetDraftToInstance,
  normalizeContainerWidgetDraftConfig
} from "../core/widget-modal-apply.js";

const deps = {
  normalizeText: (value, fallback) => String(value || "").trim() || fallback,
  normalizeSurfaceMode: (value, fallback) => value || fallback,
  normalizeTransparentGhostStrength: (value, fallback) => value ?? fallback,
  normalizeEdgeRoundness: (value, fallback) => value ?? fallback,
  normalizeTransparency: (value, fallback) => value ?? fallback,
  normalizeTitleAlign: (value, fallback) => value || fallback,
  defaultWidgetTitleAlign: () => "center",
  normalizeAlign: (value, fallback) => value || fallback,
  defaultWidgetContentAlign: () => "top",
  resolveDirectionalPaddingFromDraft: () => ({
    top: 11,
    right: 12,
    bottom: 13,
    left: 14,
    topRight: 11.5,
    bottomLeft: 13.5,
    all: 12.5
  }),
  widgetPaddingFallback: () => 10,
  normalizeContentPadding: (value) => Number(value),
  normalizeWidgetContentFontScale: (value, fallback) => value ?? fallback,
  normalizeWidgetThemeMode: (value, fallback) => value || fallback,
  normalizeWidgetColor: (value, fallback) => value || fallback,
  normalizeWidgetPage: (page) => page,
  cloneLayout: (layout) => ({ ...layout })
};

test("applyWidgetDraftToInstance applies draft values and merges config", () => {
  const instance = {
    type: "weather",
    config: { a: 1 },
    layout: { x: 0, y: 0, w: 1, h: 1 }
  };
  const draft = {
    title: "  Weather  ",
    viewMode: "headless",
    surfaceMode: "transparent",
    transparentAutoContrast: true,
    transparentGhostStrength: 120,
    backdropBlur: false,
    edgeRoundness: 9,
    transparency: 0.8,
    titleAlign: "left",
    contentAlignY: "bottom",
    contentFillParent: true,
    contentFontScale: 1.1,
    widgetThemeMode: "dark",
    useCustomColors: true,
    customTextColor: "#111111",
    customAccentColor: "#222222",
    customSurfaceColor: "#333333",
    page: 3,
    layout: { x: 10, y: 20, w: 30, h: 40 },
    config: { b: 2 }
  };

  applyWidgetDraftToInstance(instance, draft, { defTitle: "Fallback", pageCount: 5, previousPage: 0 }, deps);

  assert.equal(instance.title, "Weather");
  assert.equal(instance.viewMode, "headless");
  assert.equal(instance.contentPaddingLeft, 14);
  assert.equal(instance.page, 2);
  assert.deepEqual(instance.layout, { x: 10, y: 20, w: 30, h: 40 });
  assert.deepEqual(instance.config, { a: 1, b: 2 });
});

test("applyWidgetDraftToInstance forces aiChat content behavior", () => {
  const instance = { type: "aiChat", config: {}, layout: {} };
  const draft = {
    viewMode: "window",
    contentAlignY: "bottom",
    contentFillParent: false,
    page: 1,
    layout: { x: 0, y: 0, w: 1, h: 1 },
    config: {}
  };

  applyWidgetDraftToInstance(instance, draft, { defTitle: "Chat", pageCount: 3, previousPage: 0 }, deps);

  assert.equal(instance.contentAlignY, "top");
  assert.equal(instance.contentFillParent, true);
});

test("applyWidgetDraftToInstance preserves draft page fallback semantics", () => {
  const normalizedPages = [];
  const pageDeps = {
    ...deps,
    normalizeWidgetPage: (page, pageCount, fallback) => {
      normalizedPages.push({ page, pageCount, fallback });
      return page;
    }
  };

  for (const draftPage of [0, "bad", Infinity]) {
    const instance = { type: "weather", config: {}, layout: {} };
    applyWidgetDraftToInstance(
      instance,
      {
        page: draftPage,
        layout: {},
        config: {}
      },
      { pageCount: 7, previousPage: 3 },
      pageDeps
    );
  }

  assert.deepEqual(normalizedPages, [
    { page: 0, pageCount: 7, fallback: 3 },
    { page: 0, pageCount: 7, fallback: 3 },
    { page: Infinity, pageCount: 7, fallback: 3 }
  ]);
});

test("normalizeContainerWidgetDraftConfig normalizes container-only fields", () => {
  const instance = {
    type: "container",
    config: {
      expanded: 1,
      expandedCols: "7",
      expandedRows: "5",
      expandedWidth: 999,
      expandedHeight: 888
    },
    gridLayout: { colSpan: 5, rowSpan: 4 }
  };
  let enforced = false;

  normalizeContainerWidgetDraftConfig(instance, {
    normalizeContainerExpandedCols: (value) => Number(value),
    normalizeContainerExpandedRows: (value) => Number(value),
    enforceContainerWidgetSize: () => {
      enforced = true;
    }
  });

  assert.equal(instance.config.expanded, false);
  assert.equal(instance.config.expandedCols, 7);
  assert.equal(instance.config.expandedRows, 5);
  assert.equal("expandedWidth" in instance.config, false);
  assert.equal("expandedHeight" in instance.config, false);
  assert.equal(instance.gridLayout.colSpan, 1);
  assert.equal(instance.gridLayout.rowSpan, 1);
  assert.equal(enforced, true);
});
