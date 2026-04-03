import test from "node:test";
import assert from "node:assert/strict";

import { hydrateState } from "../core/hydrate-state.js";

function createDeps() {
  const defaultThemeValue = {
    primary: "#111111",
    accent: "#222222",
    secondary: "#333333",
    background: "#444444",
    surface: "#555555",
    text: "#666666",
    line: "#777777",
    fontScale: 1
  };

  const defaultBackgroundValue = {
    solidColor: "#0f0f0f",
    wallpaperProvider: "picsum",
    wallpaperTheme: "nature",
    redditSubreddit: "EarthPorn",
    redditTime: "week",
    rotateMinutes: 15,
    wallpaperCachedUrl: "",
    wallpaperCachedSignature: "",
    wallpaperCachedAt: 0,
    videoSource: "manual",
    videoUrl: "",
    redditVideoSubreddit: "loopingvideos",
    redditVideoTime: "week",
    localMediaDataUrl: "",
    localMediaType: "",
    localMediaName: "",
    localMediaBackgroundColor: "#000000",
    localMediaFit: "stretch",
    videoCacheSignature: "",
    videoCacheStoredAt: 0,
    blurAmount: 0,
    overlayOpacity: 0.24
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const normalizeText = (value, fallback = "") => {
    const text = String(value ?? "").trim();
    return text || String(fallback || "").trim();
  };

  return {
    defaultState: () => ({
      instances: [{ id: "base-instance" }],
      ui: {}
    }),
    widgetRegistry: {
      note: {
        title: "Note",
        defaultConfig: { enabled: true },
        defaultLayout: { x: 10, y: 20, w: 300, h: 180 }
      }
    },
    isHeadlessTransparentDefaultType: () => false,
    isHeadlessDefaultType: () => false,
    normalizeSurfaceMode: (value, fallback) =>
      value === "transparent" || value === "normal" ? value : fallback,
    resolveWidgetPadding: () => ({ top: 10, right: 10, bottom: 10, left: 10, uniform: 10 }),
    normalizeContainerExpandedCols: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    normalizeContainerExpandedRows: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    clamp,
    normalizeText,
    applyRuntimeOnlyWidgetConfigDefaults: () => {},
    normalizeGridLayout: (value, fallback) => ({ ...fallback, ...(value || {}) }),
    widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 }),
    cloneLayout: (layout) => ({ ...layout }),
    idSuffix: () => "abc123",
    defaultWidgetBackdropBlur: () => false,
    normalizeTransparentGhostStrength: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    normalizeEdgeRoundness: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    normalizeTransparency: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    normalizeTitleAlign: (value, fallback) => normalizeText(value, fallback),
    defaultWidgetTitleAlign: () => "left",
    normalizeAlign: (value, fallback) => normalizeText(value, fallback),
    defaultWidgetContentAlign: () => "top",
    normalizeContentPadding: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    normalizeWidgetContentFontScale: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    normalizeWidgetThemeMode: (value, fallback) => normalizeText(value, fallback),
    normalizeWidgetColor: (value, fallback) => normalizeText(value, fallback),
    normalizeCommonOverrides: (value) => (value && typeof value === "object" ? value : {}),
    normalizeWidgetPage: (value, maxPages, fallback) => {
      const page = Number(value);
      if (!Number.isFinite(page)) {
        return fallback;
      }
      return clamp(page, 0, Math.max(0, maxPages - 1));
    },
    normalizeDockOrder: (value, fallback) => {
      if (value === null || value === undefined) {
        return fallback;
      }
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : fallback;
    },
    normalizeContainerId: (value) => normalizeText(value),
    normalizeDockedWidgetOrders: () => false,
    normalizeContainerAssignments: () => {},
    defaultTheme: () => ({ ...defaultThemeValue }),
    defaultBackground: () => ({ ...defaultBackgroundValue }),
    isWidgetDocked: () => false,
    isWidgetInContainer: () => false,
    normalizeHomeLayout: (value) => ({ ...value, pageCount: Math.max(1, Number(value?.pageCount) || 1) }),
    normalizeWidgetCommonMaster: (value) => ({ ...(value || {}) }),
    normalizeMondayGlobalSettings: (value) => ({ ...(value || {}) }),
    clonePresetSnapshot: (value) => structuredClone(value),
    normalizeHexColor: (value, fallback) => normalizeText(value, fallback),
    normalizeWallpaperProvider: (value, fallback) => normalizeText(value, fallback),
    normalizeVideoSource: (value, fallback) => normalizeText(value, fallback),
    normalizeLocalMediaType: (value, fallback) => normalizeText(value, fallback),
    normalizeLocalMediaFit: (value, fallback) => normalizeText(value, fallback),
    inferLocalMediaTypeFromDataUrl: () => "image",
    inferCommonOverrides: () => ({}),
    applyWidgetCommonMaster: () => {},
    maxLauncherPages: 12
  };
}

test("hydrateState normalizes explicit instances and filters unknown types", () => {
  const deps = createDeps();
  const result = hydrateState(
    {
      mode: "edit",
      nextId: 500,
      instances: [
        {
          id: "n1",
          type: "note",
          title: "My Note",
          layout: { x: 1, y: 2, w: 200, h: 100 },
          config: { enabled: false }
        },
        {
          id: "bad",
          type: "does-not-exist"
        }
      ],
      ui: {
        activeTab: "profile"
      }
    },
    deps
  );

  assert.equal(result.mode, "edit");
  assert.equal(result.nextId, 500);
  assert.equal(result.instances.length, 1);
  assert.equal(result.instances[0].id, "n1");
  assert.equal(result.instances[0].type, "note");
  assert.equal(result.ui.activeTab, "profile");
});

test("hydrateState falls back to base instances when input has no instances array", () => {
  const deps = createDeps();
  const result = hydrateState(
    {
      mode: "use",
      ui: {}
    },
    deps
  );

  assert.equal(Array.isArray(result.instances), true);
  assert.equal(result.instances.length, 1);
  assert.equal(result.instances[0].id, "base-instance");
  assert.equal(result.mode, "use");
});
