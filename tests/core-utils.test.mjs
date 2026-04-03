import test from "node:test";
import assert from "node:assert/strict";

import { normalizeErrorMessage } from "../core/utils/error.js";
import { clamp } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";
import { clamp as layoutClamp } from "../core/layout-primitives.js";

test("normalizeText trims text and falls back for blank-like values", () => {
  assert.equal(normalizeText("  hello  "), "hello");
  assert.equal(normalizeText("   ", "fallback"), "fallback");
  assert.equal(normalizeText(0, "fallback"), "fallback");
});

test("clamp bounds values inside min and max", () => {
  assert.equal(clamp(9, 1, 5), 5);
  assert.equal(clamp(-2, 1, 5), 1);
  assert.equal(clamp(3, 1, 5), 3);
});

test("normalizeErrorMessage returns safe fallback text", () => {
  assert.equal(normalizeErrorMessage(), "Unknown error");
  assert.equal(normalizeErrorMessage("  bad request  "), "bad request");
  assert.equal(normalizeErrorMessage({ message: "  failed  " }), "failed");
});

test("layout-primitives clamp delegates to core utils number module", () => {
  assert.equal(layoutClamp(12, 2, 8), 8);
  assert.equal(layoutClamp(6, 2, 8), 6);
});
