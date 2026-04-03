import test from "node:test";
import assert from "node:assert/strict";

import { createBackgroundWallpaperRuntime } from "../core/background-wallpaper-runtime.js";

function createClassList(initial = []) {
  const set = new Set(initial);
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
    contains(name) {
      return set.has(name);
    }
  };
}

function createHarness(overrides = {}) {
  const nowValue = 100_000;
  const state = {
    ui: {
      background: {
        mode: "wallpaper",
        wallpaperProvider: "picsum",
        wallpaperTheme: "nature",
        redditSubreddit: "EarthPorn",
        redditTime: "week",
        rotateMinutes: 1,
        wallpaperCachedUrl: "",
        wallpaperCachedAt: 0,
        wallpaperCachedSignature: ""
      }
    }
  };

  const elements = {
    bgImage: {
      src: "",
      classList: createClassList(),
      getAttribute(name) {
        if (name === "src") {
          return this.src || "";
        }
        return "";
      }
    }
  };

  const calls = {
    fetch: [],
    queueSave: 0,
    clearBlurLayer: 0,
    updateBlurFromImage: [],
    sampleLuminance: [],
    clearWallpaperTimer: 0,
    setTimeout: []
  };

  const runtimeState = {
    wallpaperCounter: 0,
    wallpaperLoadToken: 0,
    wallpaperSourceSignature: "",
    wallpaperTimer: null
  };

  const runtime = createBackgroundWallpaperRuntime({
    getState: () => state,
    elements,
    normalizeText: (value, fallback = "") => {
      const text = String(value || "").trim();
      return text || fallback;
    },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    now: () => nowValue,
    fetch: async (url) => {
      calls.fetch.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { children: [] } })
      };
    },
    pickRandom: (list) => (Array.isArray(list) && list.length ? list[0] : null),
    createImage: () => {
      const image = {
        onload: null,
        onerror: null
      };
      Object.defineProperty(image, "src", {
        set() {
          queueMicrotask(() => {
            image.onload?.();
          });
        }
      });
      return image;
    },
    incrementWallpaperCounter: () => {
      runtimeState.wallpaperCounter += 1;
      return runtimeState.wallpaperCounter;
    },
    incrementWallpaperLoadToken: () => {
      runtimeState.wallpaperLoadToken += 1;
      return runtimeState.wallpaperLoadToken;
    },
    getWallpaperLoadToken: () => runtimeState.wallpaperLoadToken,
    setWallpaperSourceSignature: (value) => {
      runtimeState.wallpaperSourceSignature = value;
    },
    queueSave: () => {
      calls.queueSave += 1;
    },
    clearBlurLayer: () => {
      calls.clearBlurLayer += 1;
    },
    updateBlurFromImage: (url) => {
      calls.updateBlurFromImage.push(url);
    },
    requestWallpaperLuminanceSample: (url) => {
      calls.sampleLuminance.push(url);
    },
    clearWallpaperTimer: () => {
      calls.clearWallpaperTimer += 1;
    },
    setWallpaperTimer: (timer) => {
      runtimeState.wallpaperTimer = timer;
    },
    setTimeout: (fn, delay) => {
      calls.setTimeout.push({ fn, delay });
      return 99;
    },
    ...overrides
  });

  return {
    state,
    elements,
    calls,
    runtimeState,
    runtime
  };
}

test("refreshWallpaper keeps fresh cached source without forcing", async () => {
  const harness = createHarness();
  const signature = "picsum|nature|EarthPorn|week";
  harness.state.ui.background.wallpaperCachedUrl = "https://cached.example/wallpaper.jpg";
  harness.state.ui.background.wallpaperCachedSignature = signature;
  harness.state.ui.background.wallpaperCachedAt = 99_000;
  harness.elements.bgImage.src = harness.state.ui.background.wallpaperCachedUrl;
  harness.elements.bgImage.classList.add("visible");

  await harness.runtime.refreshWallpaper({ signature, force: false });

  assert.equal(harness.runtimeState.wallpaperSourceSignature, signature);
  assert.equal(harness.calls.queueSave, 0);
  assert.deepEqual(harness.calls.fetch, []);
  assert.deepEqual(harness.calls.updateBlurFromImage, [harness.state.ui.background.wallpaperCachedUrl]);
  assert.deepEqual(harness.calls.sampleLuminance, [harness.state.ui.background.wallpaperCachedUrl]);
});

test("refreshWallpaper resolves new wallpaper and updates cache", async () => {
  const harness = createHarness();

  await harness.runtime.refreshWallpaper({ signature: "sig-test", force: true });

  assert.equal(harness.runtimeState.wallpaperSourceSignature, "sig-test");
  assert.equal(harness.calls.queueSave, 1);
  assert.ok(harness.state.ui.background.wallpaperCachedUrl.startsWith("https://picsum.photos/seed/"));
  assert.equal(harness.state.ui.background.wallpaperCachedAt, 100_000);
  assert.equal(harness.state.ui.background.wallpaperCachedSignature, "sig-test");
  assert.equal(harness.elements.bgImage.classList.contains("visible"), true);
  assert.equal(harness.calls.updateBlurFromImage.length, 1);
  assert.equal(harness.calls.sampleLuminance.length, 1);
});

test("scheduleWallpaperRefresh computes wait from cached age", () => {
  const harness = createHarness();
  harness.state.ui.background.wallpaperCachedUrl = "https://cached.example/w.jpg";
  harness.state.ui.background.wallpaperCachedSignature = "sig-1";
  harness.state.ui.background.wallpaperCachedAt = 95_000;

  harness.runtime.scheduleWallpaperRefresh("sig-1");

  assert.equal(harness.calls.clearWallpaperTimer, 1);
  assert.equal(harness.calls.setTimeout.length, 1);
  assert.equal(harness.calls.setTimeout[0].delay, 55_000);
  assert.equal(harness.runtimeState.wallpaperTimer, 99);
});
