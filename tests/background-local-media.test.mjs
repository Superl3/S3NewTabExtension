import test from "node:test";
import assert from "node:assert/strict";

import {
  createLocalMediaClearPatch,
  hasLocalMediaData,
  resolveSelectedLocalMediaName
} from "../core/background-local-media.js";
import { normalizeText } from "../core/utils/text.js";

test("hasLocalMediaData detects non-empty local media data URL", () => {
  assert.equal(hasLocalMediaData({ localMediaDataUrl: "data:image/png;base64,abc" }, normalizeText), true);
  assert.equal(hasLocalMediaData({ localMediaDataUrl: "   " }, normalizeText), false);
  assert.equal(hasLocalMediaData({ localMediaDataUrl: "data:image/png;base64,abc" }), true);
});

test("resolveSelectedLocalMediaName resolves name with fallback", () => {
  assert.equal(
    resolveSelectedLocalMediaName({ localMediaName: " clip.mp4 " }, normalizeText),
    "clip.mp4"
  );
  assert.equal(
    resolveSelectedLocalMediaName({ localMediaDataUrl: "data:image/png;base64,abc" }, normalizeText),
    "Local file selected"
  );
  assert.equal(
    resolveSelectedLocalMediaName({}, normalizeText),
    "No file selected"
  );
});

test("createLocalMediaClearPatch returns clear payload", () => {
  assert.deepEqual(createLocalMediaClearPatch(), {
    localMediaDataUrl: "",
    localMediaType: "",
    localMediaName: ""
  });
});
