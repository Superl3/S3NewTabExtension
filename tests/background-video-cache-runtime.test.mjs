import test from "node:test";
import assert from "node:assert/strict";

import { createBackgroundVideoCacheRuntime } from "../core/background-video-cache-runtime.js";

function createClassList() {
  const set = new Set();
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

function createCache(initialEntries = []) {
  const store = new Map(initialEntries);
  return {
    async match(key) {
      return store.get(key);
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      return store.delete(key);
    },
    async keys() {
      return Array.from(store.keys());
    },
    store
  };
}

function createHarness(overrides = {}) {
  const state = {
    ui: {
      background: {
        mode: "video",
        videoSource: "manual",
        videoUrl: "https://cdn.example/video.mp4",
        redditVideoSubreddit: "loopingvideos",
        redditVideoTime: "week",
        videoCacheSignature: "",
        videoCacheStoredAt: 0
      }
    }
  };

  const calls = {
    fetch: [],
    hideVideo: 0,
    releaseVideoObjectUrl: 0,
    queueSave: 0,
    onLoadError: [],
    revokeObjectURL: []
  };

  let videoLoadToken = 0;
  let currentVideoObjectUrl = "";
  const cache = createCache();

  const elements = {
    bgVideo: {
      src: "",
      style: {},
      classList: createClassList(),
      load() {},
      play() {
        return Promise.resolve();
      }
    }
  };

  const runtime = createBackgroundVideoCacheRuntime({
    getState: () => state,
    elements,
    normalizeText: (value, fallback = "") => {
      const text = String(value || "").trim();
      return text || fallback;
    },
    normalizeVideoSource: (value, fallback = "manual") => (value === "reddit" ? "reddit" : fallback),
    pickRandom: (list) => (Array.isArray(list) && list.length ? list[0] : null),
    fetch: async (url) => {
      calls.fetch.push(url);
      return {
        ok: true,
        status: 200,
        clone() {
          return this;
        },
        async json() {
          return {
            data: {
              children: [
                {
                  data: {
                    url: "https://v.redd.it/demo"
                  }
                }
              ]
            }
          };
        },
        async blob() {
          return { type: "video/mp4" };
        }
      };
    },
    videoCacheName: "s3newtab-video-cache-v1",
    videoCacheKeyPrefix: "s3newtab-video-cache:",
    videoCacheMaxEntries: 2,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    hasCaches: () => true,
    openCache: async () => cache,
    buildVideoCacheKey: (signature) => `s3newtab-video-cache:${signature}`,
    videoConfigSignature: (cfg) => `${cfg.videoSource}|${cfg.videoUrl}`,
    incrementVideoLoadToken: () => {
      videoLoadToken += 1;
      return videoLoadToken;
    },
    getVideoLoadToken: () => videoLoadToken,
    hideVideo: () => {
      calls.hideVideo += 1;
    },
    releaseVideoObjectUrl: () => {
      calls.releaseVideoObjectUrl += 1;
      currentVideoObjectUrl = "";
    },
    createObjectURL: () => "blob:new-video",
    revokeObjectURL: (url) => {
      calls.revokeObjectURL.push(url);
    },
    setCurrentVideoObjectUrl: (value) => {
      currentVideoObjectUrl = value;
    },
    queueSave: () => {
      calls.queueSave += 1;
    },
    now: () => 123456,
    onLoadError: (error) => {
      calls.onLoadError.push(error);
    },
    ...overrides
  });

  return {
    state,
    calls,
    cache,
    elements,
    runtime,
    getCurrentVideoObjectUrl: () => currentVideoObjectUrl
  };
}

test("parseRedditLoopVideoUrl extracts playable candidate", () => {
  const harness = createHarness();
  const url = harness.runtime.parseRedditLoopVideoUrl({
    secure_media: {
      reddit_video: {
        fallback_url: "https://v.redd.it/sample.mp4"
      }
    }
  });

  assert.equal(url, "https://v.redd.it/sample.mp4");
});

test("ensureCachedLoopVideoResponse returns cached clone when available", async () => {
  const harness = createHarness();
  const cachedResponse = {
    clone() {
      return { from: "cached-clone" };
    }
  };
  harness.cache.store.set("s3newtab-video-cache:sig", cachedResponse);

  const response = await harness.runtime.ensureCachedLoopVideoResponse(
    harness.state.ui.background,
    "sig",
    { force: false }
  );

  assert.deepEqual(response, { from: "cached-clone" });
  assert.deepEqual(harness.calls.fetch, []);
});

test("ensureCachedLoopVideoResponse fetches and prunes overflow cache", async () => {
  const harness = createHarness();
  harness.cache.store.set("s3newtab-video-cache:old-1", { clone() { return this; } });
  harness.cache.store.set("s3newtab-video-cache:old-2", { clone() { return this; } });
  harness.cache.store.set("s3newtab-video-cache:old-3", { clone() { return this; } });

  const response = await harness.runtime.ensureCachedLoopVideoResponse(
    harness.state.ui.background,
    "new",
    { force: false }
  );

  assert.equal(typeof response.blob, "function");
  assert.equal(harness.calls.fetch.length, 1);
  assert.equal(harness.cache.store.has("s3newtab-video-cache:new"), true);
  assert.equal(harness.cache.store.has("s3newtab-video-cache:old-1"), false);
});

test("pruneLoopVideoCache preserves keep-count fallback semantics", async () => {
  const harness = createHarness();
  const cache = createCache([
    ["s3newtab-video-cache:old-1", {}],
    ["s3newtab-video-cache:old-2", {}],
    ["s3newtab-video-cache:old-3", {}]
  ]);

  await harness.runtime.pruneLoopVideoCache(cache, 0);

  assert.equal(cache.store.size, 2);
  assert.equal(cache.store.has("s3newtab-video-cache:old-1"), false);
  assert.equal(cache.store.has("s3newtab-video-cache:old-2"), true);
  assert.equal(cache.store.has("s3newtab-video-cache:old-3"), true);
});

test("loadVideoLoop applies object URL and persists cache metadata", async () => {
  const harness = createHarness({
    hasCaches: () => false
  });

  await harness.runtime.loadVideoLoop({ force: true });

  assert.equal(harness.calls.hideVideo, 1);
  assert.equal(harness.calls.releaseVideoObjectUrl >= 2, true);
  assert.equal(harness.elements.bgVideo.src, "blob:new-video");
  assert.equal(harness.elements.bgVideo.classList.contains("visible"), true);
  assert.equal(harness.state.ui.background.videoCacheStoredAt, 123456);
  assert.equal(harness.calls.queueSave, 1);
  assert.equal(harness.getCurrentVideoObjectUrl(), "blob:new-video");
  assert.deepEqual(harness.calls.onLoadError, []);
});
