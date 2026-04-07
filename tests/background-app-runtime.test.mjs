import test from "node:test";
import assert from "node:assert/strict";

import { createAppBackgroundSubsystem } from "../core/background/app-runtime.js";

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
    contains(name) {
      return set.has(name);
    },
    has(name) {
      return set.has(name);
    }
  };
}

function createMediaElement() {
  let src = "";
  const classList = createClassList();
  return {
    style: {},
    classList,
    get src() {
      return src;
    },
    set src(value) {
      src = value;
    },
    get currentSrc() {
      return src;
    },
    getAttribute(name) {
      return name === "src" ? src : null;
    },
    removeAttribute(name) {
      if (name === "src") {
        src = "";
      }
    }
  };
}

function createVideoElement(calls) {
  return {
    ...createMediaElement(),
    load() {
      calls.videoLoad += 1;
    },
    play() {
      calls.videoPlay += 1;
      return Promise.resolve();
    },
    pause() {
      calls.videoPause += 1;
    }
  };
}

function createHarness({ mode = "video", localMediaDataUrl = "", localMediaType = "", videoUrl = "" } = {}) {
  const calls = {
    fetch: [],
    queueSave: 0,
    videoLoad: 0,
    videoPlay: 0,
    videoPause: 0,
    patchBackground: []
  };

  const state = {
    ui: {
      theme: {
        background: "#101820",
        surface: "#202830",
        secondary: "#304050",
        accent: "#405060"
      },
      background: {
        mode,
        overlayOpacity: 0.24,
        solidColor: "#223344",
        videoSource: "manual",
        videoUrl,
        localMediaDataUrl,
        localMediaType,
        localMediaFit: "stretch",
        localMediaBackgroundColor: "#111111",
        wallpaperProvider: "picsum",
        wallpaperTheme: "nature",
        redditSubreddit: "EarthPorn",
        redditTime: "week",
        blurAmount: 0,
        videoCacheSignature: "",
        videoCacheStoredAt: 0
      }
    }
  };

  const elements = {
    bgRefreshBtn: {
      disabled: false,
      title: "",
      classList: createClassList()
    },
    bgOverlay: { style: {} },
    bgLayer: { style: {} },
    bgImage: createMediaElement(),
    bgVideo: createVideoElement(calls),
    bgBlurImage: createMediaElement()
  };

  let currentVideoObjectUrl = "";
  let wallpaperSourceSignature = "";
  let wallpaperTimer = null;
  let blurComputeToken = 0;
  let videoLoadToken = 0;
  let wallpaperLoadToken = 0;
  let wallpaperCounter = 0;
  let wallpaperSampleToken = 0;
  let sampledWallpaperSource = "";
  let sampledWallpaperBaseLuminance = null;

  const subsystem = createAppBackgroundSubsystem({
    getState: () => state,
    elements,
    documentObj: {
      documentElement: {
        style: {
          setProperty() {}
        }
      },
      createElement() {
        return {
          getContext() {
            return null;
          }
        };
      }
    },
    createImage: () => ({}),
    createFileReader: () => ({
      result: "",
      onload: null,
      onerror: null,
      readAsDataURL(file) {
        this.result = `data:${file.type};base64,AAAA`;
        this.onload?.();
      }
    }),
    fetch: async (url) => {
      calls.fetch.push(url);
      return {
        ok: true,
        async blob() {
          return { type: "video/mp4" };
        }
      };
    },
    setTimeout: globalThis.setTimeout,
    setWallpaperTimer: (value) => {
      wallpaperTimer = value;
    },
    clearWallpaperTimer: () => {
      wallpaperTimer = null;
    },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    srgbToLinear: (value) => value / 255,
    normalizeText: (value, fallback = "") => {
      const text = String(value || "").trim();
      return text || fallback;
    },
    normalizeHexColor: (value, fallback) => value || fallback,
    defaultBackground: () => ({ localMediaBackgroundColor: "#0A0B0C" }),
    normalizeVideoSource: (value, fallback = "manual") => {
      const text = String(value || "").trim() || fallback;
      return text === "reddit" ? "reddit" : "manual";
    },
    normalizeLocalMediaType: (value, fallback = "") => {
      const text = String(value || "").trim() || fallback;
      return text === "image" || text === "video" ? text : fallback;
    },
    inferLocalMediaTypeFromDataUrl: (value) => (String(value || "").startsWith("data:image/") ? "image" : "video"),
    normalizeLocalMediaFit: (value, fallback = "stretch") => {
      const text = String(value || "").trim() || fallback;
      return ["stretch", "fit-height", "fit-width", "original-resolution"].includes(text) ? text : fallback;
    },
    pickRandom: (list) => list[0] || null,
    buildVideoCacheKey: (signature) => `video-cache:${signature}`,
    videoConfigSignature: (cfg) => `${cfg.videoSource}|${cfg.videoUrl}`,
    videoCacheName: "video-cache",
    videoCacheKeyPrefix: "video-cache:",
    videoCacheMaxEntries: 4,
    hasCaches: () => false,
    openCache: async () => null,
    now: () => 1000,
    patchBackground: (patch) => {
      calls.patchBackground.push(patch);
    },
    queueSave: () => {
      calls.queueSave += 1;
    },
    refreshAllWidgetCardsVisual() {},
    refreshWidgetsByType() {},
    sampleImageBaseLuminanceFromUrl: async () => 0.5,
    getBlurAmount: () => state.ui.background.blurAmount,
    incrementBlurComputeToken: () => {
      blurComputeToken += 1;
      return blurComputeToken;
    },
    getBlurComputeToken: () => blurComputeToken,
    getCurrentVideoObjectUrl: () => currentVideoObjectUrl,
    setCurrentVideoObjectUrl: (value) => {
      currentVideoObjectUrl = value;
    },
    createObjectURL: () => "blob:video-1",
    revokeObjectURL() {},
    onLocalMediaImportError(error) {
      throw error;
    },
    onVideoLoadError(error) {
      throw error;
    },
    incrementWallpaperCounter: () => {
      wallpaperCounter += 1;
      return wallpaperCounter;
    },
    incrementWallpaperLoadToken: () => {
      wallpaperLoadToken += 1;
      return wallpaperLoadToken;
    },
    getWallpaperLoadToken: () => wallpaperLoadToken,
    setWallpaperSourceSignature: (value) => {
      wallpaperSourceSignature = value;
    },
    incrementVideoLoadToken: () => {
      videoLoadToken += 1;
      return videoLoadToken;
    },
    getVideoLoadToken: () => videoLoadToken,
    getSampledWallpaperSource: () => sampledWallpaperSource,
    incrementWallpaperSampleToken: () => {
      wallpaperSampleToken += 1;
      return wallpaperSampleToken;
    },
    getWallpaperSampleToken: () => wallpaperSampleToken,
    setSampledWallpaperBaseLuminance: (value) => {
      sampledWallpaperBaseLuminance = value;
    },
    setSampledWallpaperSource: (value) => {
      sampledWallpaperSource = value;
    }
  });

  return {
    state,
    calls,
    elements,
    subsystem,
    getWallpaperSourceSignature: () => wallpaperSourceSignature,
    getWallpaperTimer: () => wallpaperTimer,
    getSampledWallpaperBaseLuminance: () => sampledWallpaperBaseLuminance
  };
}

test("createAppBackgroundSubsystem imports local media through facade patching", async () => {
  const harness = createHarness();

  await harness.subsystem.importLocalBackgroundFile({
    type: "image/png",
    name: "photo.png"
  });

  assert.deepEqual(harness.calls.patchBackground, [
    {
      localMediaDataUrl: "data:image/png;base64,AAAA",
      localMediaType: "image",
      localMediaName: "photo.png"
    }
  ]);
});

test("createAppBackgroundSubsystem routes refresh and apply through composed runtimes", async () => {
  const harness = createHarness({
    mode: "video",
    videoUrl: "https://video.example/test.mp4"
  });

  harness.subsystem.refreshBackgroundNow();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(harness.calls.fetch, ["https://video.example/test.mp4"]);
  assert.equal(harness.elements.bgVideo.src, "blob:video-1");
  assert.equal(harness.elements.bgVideo.classList.contains("visible"), true);

  harness.state.ui.background = {
    ...harness.state.ui.background,
    mode: "video",
    localMediaDataUrl: "data:image/png;base64,BBBB",
    localMediaType: "image",
    localMediaFit: "stretch"
  };

  harness.subsystem.applyBackground();

  assert.equal(harness.elements.bgImage.src, "data:image/png;base64,BBBB");
  assert.equal(harness.elements.bgImage.classList.contains("visible"), true);
  assert.equal(harness.elements.bgImage.style.objectFit, "fill");
  assert.equal(harness.getWallpaperSourceSignature(), "");
});
