import test from "node:test";
import assert from "node:assert/strict";

import { createShortcutIconEditorRuntime } from "../core/shortcut-icon-editor-runtime.js";

function createHarness(overrides = {}) {
  const shortcutIconEditorState = {
    open: false,
    shape: "roundSquared",
    scale: 100,
    text: "",
    textSize: 58,
    source: "preset",
    selectedPreset: "search",
    selectedCache: "",
    importedDataUrl: "",
    cacheEntries: [],
    previewDataUrl: "",
    onApply: null
  };

  const deps = {
    elements: {},
    shortcutIconEditorState,
    shortcutIconPresets: [
      { id: "search", label: "Search", viewBox: "0 0 24 24", markup: '<circle cx="12" cy="12" r="6" />' }
    ],
    shortcutIconCacheKey: "shortcut-cache-key",
    normalizeText: (value, fallback = "") => {
      const text = String(value || "").trim();
      return text || fallback;
    },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    defaultTheme: () => ({ surface: "#fff", line: "#222", text: "#111", accent: "#0af", fontFamily: "Segoe UI" }),
    normalizeDisplayColor: (value, fallback) => String(value || fallback),
    getTheme: () => ({ surface: "#fefefe", line: "#333", text: "#111", accent: "#09f", fontFamily: "Pretendard" }),
    blurFocusedElementInOverlay: () => {},
    storageLocalGet: async () => ({}),
    documentObj: {
      createElement: () => ({})
    },
    ...overrides
  };

  return {
    state: shortcutIconEditorState,
    runtime: createShortcutIconEditorRuntime(deps)
  };
}

test("shortcut icon runtime normalizes shape and escapes xml", () => {
  const harness = createHarness();

  assert.equal(harness.runtime.normalizeShortcutIconShape("invalid"), "roundSquared");
  assert.equal(harness.runtime.normalizeShortcutIconShape("round"), "round");
  assert.equal(harness.runtime.escapeXml('<a&"\'>'), "&lt;a&amp;&quot;&#39;&gt;");
});

test("shortcut icon runtime normalizes cache payload", () => {
  const harness = createHarness();

  const normalized = harness.runtime.normalizeShortcutIconCache({
    " github.com ": " data:image/png;base64,abc ",
    bad: "https://example.com/icon.png",
    "": "data:image/png;base64,def"
  });

  assert.deepEqual(normalized, {
    "github.com": "data:image/png;base64,abc"
  });
});

test("shortcut icon runtime builds preset and text data URLs", () => {
  const harness = createHarness();
  harness.state.source = "preset";
  harness.state.selectedPreset = "search";

  const presetDataUrl = harness.runtime.shortcutEditorBuildDataUrl();
  assert.ok(presetDataUrl.startsWith("data:image/svg+xml;charset=utf-8,"));

  harness.state.source = "text";
  harness.state.text = "AB";
  const textDataUrl = harness.runtime.shortcutEditorBuildDataUrl();
  assert.ok(textDataUrl.startsWith("data:image/svg+xml;charset=utf-8,"));
});

test("shortcut icon runtime apply returns false when editor is closed", () => {
  const harness = createHarness();

  assert.equal(harness.runtime.applyShortcutIconEditor(), false);
});

test("shortcut icon runtime apply closes open editor and returns true", () => {
  const calls = [];
  const harness = createHarness({
    elements: {
      shortcutIconEditorOverlay: {
        classList: {
          remove: () => {}
        },
        setAttribute: () => {}
      }
    }
  });

  harness.state.open = true;
  harness.state.onApply = (value) => {
    calls.push(value);
  };

  assert.equal(harness.runtime.applyShortcutIconEditor(), true);
  assert.equal(harness.state.open, false);
  assert.equal(calls.length, 1);
});

test("shortcut icon runtime close returns false when already closed", () => {
  const harness = createHarness();

  assert.equal(harness.runtime.closeShortcutIconEditor(), false);
});

test("shortcut icon runtime apply still closes when onApply throws", () => {
  const harness = createHarness({
    elements: {
      shortcutIconEditorOverlay: {
        classList: {
          remove: () => {}
        },
        setAttribute: () => {}
      }
    }
  });

  harness.state.open = true;
  harness.state.onApply = () => {
    throw new Error("apply-fail");
  };

  assert.throws(() => {
    harness.runtime.applyShortcutIconEditor();
  }, /apply-fail/);
  assert.equal(harness.state.open, false);
});
