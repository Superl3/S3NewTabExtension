import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGoogleAccountIndex } from "../widgets/shared/googleAccounts.js";

test("normalizeGoogleAccountIndex rounds, clamps, and falls back like Google account URLs expect", () => {
  assert.equal(normalizeGoogleAccountIndex("2.6"), 3);
  assert.equal(normalizeGoogleAccountIndex(-1), 0);
  assert.equal(normalizeGoogleAccountIndex(12), 9);
  assert.equal(normalizeGoogleAccountIndex("bad", 4), 4);
});
