import test from "node:test";
import assert from "node:assert/strict";

import { readFieldValueBySchema } from "../core/settings-input-schema.js";

test("readFieldValueBySchema reads checkbox values", () => {
  assert.equal(readFieldValueBySchema({ checked: true }, { type: "checkbox" }), true);
  assert.equal(readFieldValueBySchema({ checked: false }, { type: "checkbox" }), false);
});

test("readFieldValueBySchema reads number values with fallback", () => {
  assert.equal(readFieldValueBySchema({ value: "12.5" }, { type: "number" }), 12.5);
  assert.equal(readFieldValueBySchema({ value: "not-a-number" }, { type: "number" }), 0);
});

test("readFieldValueBySchema returns raw value for text-like fields", () => {
  assert.equal(readFieldValueBySchema({ value: "abc" }, { type: "text" }), "abc");
});
