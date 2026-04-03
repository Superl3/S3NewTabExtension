import test from "node:test";
import assert from "node:assert/strict";

import { createBackgroundBlurRuntime } from "../core/background-blur-runtime.js";

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
  let blurToken = 0;
  let blurAmount = 12;
  const cssVars = new Map();

  const elements = {
    bgBlurImage: {
      src: "",
      style: {},
      classList: createClassList(),
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

  const documentObj = {
    documentElement: {
      style: {
        setProperty(name, value) {
          cssVars.set(name, value);
        }
      }
    },
    createElement(tag) {
      if (tag !== "canvas") {
        throw new Error(`unsupported:${tag}`);
      }
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            filter: "",
            drawImage() {}
          };
        },
        toDataURL() {
          return "data:image/jpeg;base64,AAAA";
        }
      };
    }
  };

  const runtime = createBackgroundBlurRuntime({
    elements,
    documentObj,
    createImage: () => {
      const image = {
        width: 1920,
        height: 1080,
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
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    getBlurAmount: () => blurAmount,
    incrementBlurComputeToken: () => {
      blurToken += 1;
      return blurToken;
    },
    getBlurComputeToken: () => blurToken,
    ...overrides
  });

  return {
    runtime,
    elements,
    cssVars,
    getBlurToken: () => blurToken,
    setBlurAmount: (value) => {
      blurAmount = value;
    }
  };
}

test("clearBlurLayer resets blur layer and css opacity variables", () => {
  const harness = createHarness();
  harness.elements.bgBlurImage.src = "data:image/jpeg;base64,OLD";
  harness.elements.bgBlurImage.classList.add("visible");

  harness.runtime.clearBlurLayer();

  assert.equal(harness.getBlurToken(), 1);
  assert.equal(harness.elements.bgBlurImage.classList.contains("visible"), false);
  assert.equal(harness.elements.bgBlurImage.src, "");
  assert.equal(harness.elements.bgBlurImage.style.filter, "none");
  assert.equal(harness.cssVars.get("--bg-sharp-opacity"), "1");
  assert.equal(harness.cssVars.get("--bg-blur-opacity"), "0");
});

test("updateBlurFromImage clears blur when amount is zero", async () => {
  const harness = createHarness();
  harness.setBlurAmount(0);
  harness.elements.bgBlurImage.classList.add("visible");

  await harness.runtime.updateBlurFromImage("https://example.com/image.jpg");

  assert.equal(harness.elements.bgBlurImage.classList.contains("visible"), false);
  assert.equal(harness.cssVars.get("--bg-sharp-opacity"), "1");
  assert.equal(harness.cssVars.get("--bg-blur-opacity"), "0");
});

test("updateBlurFromImage applies precomputed blur data URL", async () => {
  const harness = createHarness();

  await harness.runtime.updateBlurFromImage("https://example.com/image.jpg");

  assert.equal(harness.elements.bgBlurImage.src, "data:image/jpeg;base64,AAAA");
  assert.equal(harness.elements.bgBlurImage.style.filter, "none");
  assert.equal(harness.elements.bgBlurImage.classList.contains("visible"), true);
  assert.equal(harness.cssVars.get("--bg-sharp-opacity"), "0.38");
  assert.equal(harness.cssVars.get("--bg-blur-opacity"), "0.95");
});
