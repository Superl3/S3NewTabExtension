import test from "node:test";
import assert from "node:assert/strict";

import { createBackgroundLocalMediaRuntime } from "../core/background-local-media-runtime.js";

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
  const calls = {
    revokeObjectURL: [],
    patchBackground: [],
    pause: 0,
    load: 0,
    importError: []
  };

  const state = {
    currentVideoObjectUrl: "blob:active"
  };

  const elements = {
    bgImage: {
      style: {}
    },
    bgVideo: {
      style: {},
      src: "blob:active",
      classList: createClassList(["visible"]),
      pause() {
        calls.pause += 1;
      },
      load() {
        calls.load += 1;
      },
      getAttribute(name) {
        if (name === "src") {
          return this.src || "";
        }
        return "";
      },
      removeAttribute(name) {
        if (name === "src") {
          this.src = "";
        }
      }
    }
  };

  const runtime = createBackgroundLocalMediaRuntime({
    elements,
    normalizeText: (value, fallback = "") => {
      const text = String(value || "").trim();
      return text || fallback;
    },
    normalizeLocalMediaFit: (value, fallback) => value || fallback,
    normalizeLocalMediaType: (value, fallback) => value || fallback,
    inferLocalMediaTypeFromDataUrl: () => "",
    createFileReader: () => ({
      result: "",
      onload: null,
      onerror: null,
      readAsDataURL() {
        this.result = "data:image/png;base64,AAAA";
        this.onload?.();
      }
    }),
    patchBackground: (patch) => {
      calls.patchBackground.push(patch);
    },
    onImportError: (error) => {
      calls.importError.push(error);
    },
    getCurrentVideoObjectUrl: () => state.currentVideoObjectUrl,
    setCurrentVideoObjectUrl: (value) => {
      state.currentVideoObjectUrl = value;
    },
    revokeObjectURL: (value) => {
      calls.revokeObjectURL.push(value);
    },
    ...overrides
  });

  return {
    calls,
    state,
    elements,
    runtime
  };
}

test("hideVideo clears media source and releases object URL", () => {
  const harness = createHarness();

  harness.runtime.hideVideo();

  assert.equal(harness.elements.bgVideo.classList.contains("visible"), false);
  assert.equal(harness.calls.pause, 1);
  assert.equal(harness.calls.load, 1);
  assert.equal(harness.state.currentVideoObjectUrl, "");
  assert.deepEqual(harness.calls.revokeObjectURL, ["blob:active"]);
});

test("applyBackgroundMediaFitStyles applies local fit to both media layers", () => {
  const harness = createHarness({
    normalizeLocalMediaFit: () => "fit-width"
  });

  harness.runtime.applyBackgroundMediaFitStyles({
    mode: "video",
    localMediaDataUrl: "data:image/png;base64,AAAA",
    localMediaFit: "fit-width"
  });

  assert.equal(harness.elements.bgImage.style.transform, "translateY(-50%)");
  assert.equal(harness.elements.bgVideo.style.transform, "translateY(-50%)");
  assert.equal(harness.elements.bgImage.style.width, "100%");
  assert.equal(harness.elements.bgVideo.style.width, "100%");
});

test("importLocalBackgroundFile patches image payload", async () => {
  const harness = createHarness();

  await harness.runtime.importLocalBackgroundFile({
    type: "image/png",
    name: "wallpaper.png"
  });

  assert.equal(harness.calls.patchBackground.length, 1);
  assert.deepEqual(harness.calls.patchBackground[0], {
    localMediaDataUrl: "data:image/png;base64,AAAA",
    localMediaType: "image",
    localMediaName: "wallpaper.png"
  });
  assert.equal(harness.calls.importError.length, 0);
});
