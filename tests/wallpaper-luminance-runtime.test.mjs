import test from "node:test";
import assert from "node:assert/strict";

import { requestWallpaperLuminanceSample } from "../core/wallpaper-luminance-runtime.js";

function waitTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createHarness(overrides = {}) {
  const state = {
    ui: {
      background: {
        mode: "wallpaper"
      }
    }
  };

  let sampledWallpaperSource = "";
  let sampledWallpaperBaseLuminance = null;
  let wallpaperSampleToken = 0;

  const calls = {
    sampleFromUrl: [],
    refreshCards: 0,
    refreshByType: []
  };

  const deps = {
    normalizeText: (value) => String(value || "").trim(),
    getSampledWallpaperSource: () => sampledWallpaperSource,
    incrementWallpaperSampleToken: () => {
      wallpaperSampleToken += 1;
      return wallpaperSampleToken;
    },
    getWallpaperSampleToken: () => wallpaperSampleToken,
    elements: {
      bgImage: {
        currentSrc: "",
        complete: false,
        naturalWidth: 0,
        naturalHeight: 0,
        getAttribute() {
          return "";
        }
      }
    },
    sampleImageBaseLuminanceFromUrl: async (source) => {
      calls.sampleFromUrl.push(source);
      return 0.42;
    },
    getState: () => state,
    setSampledWallpaperBaseLuminance: (value) => {
      sampledWallpaperBaseLuminance = value;
    },
    setSampledWallpaperSource: (value) => {
      sampledWallpaperSource = value;
    },
    refreshAllWidgetCardsVisual: () => {
      calls.refreshCards += 1;
    },
    refreshWidgetsByType: (type) => {
      calls.refreshByType.push(type);
    },
    documentObj: {
      createElement() {
        return {
          width: 0,
          height: 0,
          getContext() {
            return null;
          }
        };
      }
    },
    srgbToLinear: (value) => value,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    ...overrides
  };

  return {
    deps,
    state,
    calls,
    getSampledWallpaperSource: () => sampledWallpaperSource,
    getSampledWallpaperBaseLuminance: () => sampledWallpaperBaseLuminance,
    getWallpaperSampleToken: () => wallpaperSampleToken
  };
}

test("requestWallpaperLuminanceSample is no-op for empty or duplicate source", () => {
  const harness = createHarness();
  requestWallpaperLuminanceSample("", harness.deps);
  assert.equal(harness.getWallpaperSampleToken(), 0);

  harness.deps.setSampledWallpaperSource("https://example.com/a.jpg");
  requestWallpaperLuminanceSample("https://example.com/a.jpg", harness.deps);
  assert.equal(harness.getWallpaperSampleToken(), 0);
  assert.deepEqual(harness.calls.sampleFromUrl, []);
});

test("requestWallpaperLuminanceSample samples url and refreshes widget visuals", async () => {
  const harness = createHarness();

  requestWallpaperLuminanceSample("https://example.com/a.jpg", harness.deps);
  await waitTick();

  assert.equal(harness.getSampledWallpaperSource(), "https://example.com/a.jpg");
  assert.equal(harness.getSampledWallpaperBaseLuminance(), 0.42);
  assert.deepEqual(harness.calls.sampleFromUrl, ["https://example.com/a.jpg"]);
  assert.equal(harness.calls.refreshCards, 1);
  assert.deepEqual(harness.calls.refreshByType, ["label"]);
});

test("requestWallpaperLuminanceSample stores null luminance on failure", async () => {
  const harness = createHarness({
    sampleImageBaseLuminanceFromUrl: async () => {
      throw new Error("sample-failed");
    }
  });

  requestWallpaperLuminanceSample("https://example.com/b.jpg", harness.deps);
  await waitTick();

  assert.equal(harness.getSampledWallpaperSource(), "https://example.com/b.jpg");
  assert.equal(harness.getSampledWallpaperBaseLuminance(), null);
  assert.equal(harness.calls.refreshCards, 1);
  assert.deepEqual(harness.calls.refreshByType, ["label"]);
});
