import test from "node:test";
import assert from "node:assert/strict";

import { createBackgroundRuntime } from "../core/background-runtime.js";

function createClassList() {
  const set = new Set();
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
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

function createHarness(overrides = {}) {
  const state = {
    ui: {
      theme: {
        background: "#101820",
        surface: "#202830",
        secondary: "#304050",
        accent: "#405060"
      },
      background: {
        mode: "solid",
        overlayOpacity: 0.24,
        solidColor: "#223344",
        videoUrl: "",
        videoSource: "manual",
        localMediaDataUrl: "",
        localMediaType: "",
        localMediaBackgroundColor: "#111111"
      }
    }
  };

  const calls = {
    clearWallpaperTimer: 0,
    hideVideo: 0,
    applyBackgroundMediaFitStyles: 0,
    clearBlurLayer: 0,
    loadVideoLoop: [],
    refreshWallpaper: [],
    scheduleWallpaperRefresh: [],
    videoLoad: 0,
    videoPlay: 0
  };

  let wallpaperSourceSignature = "initial";
  let wallpaperLoadToken = 10;
  let videoLoadToken = 20;

  const elements = {
    bgRefreshBtn: {
      disabled: false,
      title: "",
      classList: createClassList()
    },
    bgOverlay: { style: {} },
    bgLayer: { style: {} },
    bgImage: {
      src: "",
      classList: createClassList()
    },
    bgVideo: {
      src: "",
      classList: createClassList(),
      load() {
        calls.videoLoad += 1;
      },
      play() {
        calls.videoPlay += 1;
        return Promise.resolve();
      }
    }
  };

  const runtime = createBackgroundRuntime({
    getState: () => state,
    elements,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    normalizeText: (value, fallback = "") => {
      const text = String(value || "").trim();
      return text || fallback;
    },
    normalizeHexColor: (value, fallback) => value || fallback,
    defaultBackground: () => ({ localMediaBackgroundColor: "#0A0B0C" }),
    normalizeLocalMediaType: (value, fallback) => value || fallback,
    inferLocalMediaTypeFromDataUrl: (dataUrl) => (String(dataUrl || "").startsWith("data:image/") ? "image" : "video"),
    clearWallpaperTimer: () => {
      calls.clearWallpaperTimer += 1;
    },
    hideVideo: () => {
      calls.hideVideo += 1;
    },
    applyBackgroundMediaFitStyles: () => {
      calls.applyBackgroundMediaFitStyles += 1;
    },
    setWallpaperSourceSignature: (value) => {
      wallpaperSourceSignature = value;
    },
    incrementWallpaperLoadToken: () => {
      wallpaperLoadToken += 1;
      return wallpaperLoadToken;
    },
    incrementVideoLoadToken: () => {
      videoLoadToken += 1;
      return videoLoadToken;
    },
    clearBlurLayer: () => {
      calls.clearBlurLayer += 1;
    },
    loadVideoLoop: (options) => {
      calls.loadVideoLoop.push(options);
      return Promise.resolve();
    },
    wallpaperSignature: (cfg) => `sig-${cfg.mode}`,
    refreshWallpaper: (options) => {
      calls.refreshWallpaper.push(options);
      return Promise.resolve();
    },
    scheduleWallpaperRefresh: (signature) => {
      calls.scheduleWallpaperRefresh.push(signature);
    },
    ...overrides
  });

  return {
    state,
    elements,
    calls,
    runtime,
    getWallpaperSourceSignature: () => wallpaperSourceSignature,
    getWallpaperLoadToken: () => wallpaperLoadToken,
    getVideoLoadToken: () => videoLoadToken
  };
}

test("syncBackgroundRefreshButton toggles disabled state by mode", () => {
  const harness = createHarness();

  harness.state.ui.background.mode = "solid";
  harness.runtime.syncBackgroundRefreshButton();
  assert.equal(harness.elements.bgRefreshBtn.disabled, true);
  assert.equal(harness.elements.bgRefreshBtn.classList.has("is-disabled"), true);
  assert.equal(harness.elements.bgRefreshBtn.title, "Refresh wallpaper");

  harness.state.ui.background.mode = "video";
  harness.state.ui.background.videoSource = "reddit";
  harness.state.ui.background.localMediaDataUrl = "";
  harness.runtime.syncBackgroundRefreshButton();
  assert.equal(harness.elements.bgRefreshBtn.disabled, false);
  assert.equal(harness.elements.bgRefreshBtn.classList.has("is-disabled"), false);
  assert.equal(harness.elements.bgRefreshBtn.title, "Refresh local file");
});

test("refreshBackgroundNow refreshes wallpaper and video according to mode", async () => {
  const harness = createHarness();

  harness.state.ui.background.mode = "wallpaper";
  harness.runtime.refreshBackgroundNow();
  await Promise.resolve();

  assert.deepEqual(harness.calls.refreshWallpaper, [{ signature: "sig-wallpaper", force: true }]);
  assert.deepEqual(harness.calls.scheduleWallpaperRefresh, ["sig-wallpaper"]);

  harness.state.ui.background.mode = "video";
  harness.runtime.refreshBackgroundNow();
  assert.deepEqual(harness.calls.loadVideoLoop, [{ force: true }]);
});

test("applyBackground handles solid mode and resets wallpaper tokens", () => {
  const harness = createHarness();
  const startWallpaperToken = harness.getWallpaperLoadToken();
  const startVideoToken = harness.getVideoLoadToken();

  harness.state.ui.background = {
    ...harness.state.ui.background,
    mode: "solid",
    overlayOpacity: 0.3,
    solidColor: "#ABCDEF"
  };

  harness.runtime.applyBackground();

  assert.equal(harness.calls.clearWallpaperTimer, 1);
  assert.equal(harness.calls.hideVideo, 1);
  assert.equal(harness.calls.applyBackgroundMediaFitStyles, 1);
  assert.equal(harness.calls.clearBlurLayer, 1);
  assert.equal(harness.getWallpaperSourceSignature(), "");
  assert.equal(harness.getWallpaperLoadToken(), startWallpaperToken + 1);
  assert.equal(harness.getVideoLoadToken(), startVideoToken + 1);
  assert.equal(harness.elements.bgLayer.style.background, "#ABCDEF");
  assert.equal(harness.elements.bgImage.classList.has("visible"), false);
});

test("applyBackground renders local image for video mode", () => {
  const harness = createHarness();
  const startVideoToken = harness.getVideoLoadToken();

  harness.state.ui.background = {
    ...harness.state.ui.background,
    mode: "video",
    localMediaDataUrl: "data:image/png;base64,AAAA",
    localMediaType: "image"
  };

  harness.runtime.applyBackground();

  assert.equal(harness.getVideoLoadToken(), startVideoToken);
  assert.equal(harness.calls.clearBlurLayer, 1);
  assert.equal(harness.elements.bgImage.src, "data:image/png;base64,AAAA");
  assert.equal(harness.elements.bgImage.classList.has("visible"), true);
  assert.deepEqual(harness.calls.loadVideoLoop, []);
});
