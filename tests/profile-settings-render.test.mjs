import test from "node:test";
import assert from "node:assert/strict";

import { resolvePresetsArray } from "../core/profile-settings-render.js";

test("resolvePresetsArray returns array presets or empty fallback", () => {
  assert.deepEqual(resolvePresetsArray({ presets: [{ id: "p1" }] }), [{ id: "p1" }]);
  assert.deepEqual(resolvePresetsArray({ presets: null }), []);
  assert.deepEqual(resolvePresetsArray(null), []);
});
