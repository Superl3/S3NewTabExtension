import test from "node:test";
import assert from "node:assert/strict";

import { patchBackgroundRuntime } from "../core/background-patch.js";

function createHarness(overrides = {}) {
  const state = {
    ui: {
      background: {
        wallpaperProvider: "wallhaven",
        wallpaperTheme: "",
        redditSubreddit: "",
        redditTime: "",
        rotateMinutes: 999,
        videoSource: "unknown",
        videoUrl: "  https://video.example/test.mp4  ",
        redditVideoSubreddit: "",
        redditVideoTime: "",
        localMediaDataUrl: "",
        localMediaType: "",
        localMediaName: "",
        localMediaBackgroundColor: "",
        localMediaFit: "bad-fit",
        videoCacheSignature: "cache-signature",
        videoCacheStoredAt: 123,
        blurAmount: 99,
        overlayOpacity: 9
      }
    }
  };

  const calls = {
    history: [],
    applyBackground: 0,
    refreshCards: 0,
    refreshType: [],
    renderSettings: 0,
    queueSave: 0
  };

  const deps = {
    getState: () => state,
    recordHistorySnapshot: (label) => {
      calls.history.push(label);
    },
    normalizeWallpaperProvider: (_value, fallback) => fallback,
    normalizeText: (value, fallback = "") => {
      const text = String(value || "").trim();
      return text || fallback;
    },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    normalizeVideoSource: (_value, fallback) => fallback,
    normalizeLocalMediaType: (value, fallback) => value || fallback,
    inferLocalMediaTypeFromDataUrl: (value) => (String(value || "").startsWith("data:image/") ? "image" : "video"),
    normalizeHexColor: (value, fallback) => value || fallback,
    defaultBackground: () => ({ localMediaBackgroundColor: "#101010" }),
    normalizeLocalMediaFit: (_value, fallback) => fallback,
    applyBackground: () => {
      calls.applyBackground += 1;
    },
    refreshAllWidgetCardsVisual: () => {
      calls.refreshCards += 1;
    },
    refreshWidgetsByType: (type) => {
      calls.refreshType.push(type);
    },
    renderSettings: () => {
      calls.renderSettings += 1;
    },
    queueSave: () => {
      calls.queueSave += 1;
    },
    ...overrides
  };

  return { state, calls, deps };
}

test("patchBackgroundRuntime normalizes background and resets video cache fields", () => {
  const harness = createHarness();

  patchBackgroundRuntime(
    {
      videoSource: "reddit",
      videoUrl: "  ",
      localMediaDataUrl: "data:image/png;base64,AAAA",
      localMediaType: "",
      blurAmount: -2,
      overlayOpacity: 2
    },
    harness.deps
  );

  const bg = harness.state.ui.background;
  assert.deepEqual(harness.calls.history, ["Update background settings"]);
  assert.equal(bg.wallpaperProvider, "picsum");
  assert.equal(bg.wallpaperTheme, "nature");
  assert.equal(bg.redditSubreddit, "EarthPorn");
  assert.equal(bg.redditTime, "week");
  assert.equal(bg.rotateMinutes, 240);
  assert.equal(bg.videoSource, "manual");
  assert.equal(bg.videoUrl, "");
  assert.equal(bg.redditVideoSubreddit, "loopingvideos");
  assert.equal(bg.redditVideoTime, "week");
  assert.equal(bg.localMediaType, "image");
  assert.equal(bg.localMediaBackgroundColor, "#101010");
  assert.equal(bg.localMediaFit, "stretch");
  assert.equal(bg.videoCacheSignature, "");
  assert.equal(bg.videoCacheStoredAt, 0);
  assert.equal(bg.blurAmount, 0);
  assert.equal(bg.overlayOpacity, 0.85);
  assert.equal(harness.calls.applyBackground, 1);
  assert.equal(harness.calls.refreshCards, 1);
  assert.deepEqual(harness.calls.refreshType, ["label"]);
  assert.equal(harness.calls.renderSettings, 1);
  assert.equal(harness.calls.queueSave, 1);
});

test("patchBackgroundRuntime keeps existing video cache when non-video fields are patched", () => {
  const harness = createHarness();

  patchBackgroundRuntime(
    {
      wallpaperTheme: "space",
      rotateMinutes: 5
    },
    harness.deps
  );

  const bg = harness.state.ui.background;
  assert.equal(bg.videoCacheSignature, "cache-signature");
  assert.equal(bg.videoCacheStoredAt, 123);
  assert.equal(bg.wallpaperTheme, "space");
  assert.equal(bg.rotateMinutes, 5);
});
