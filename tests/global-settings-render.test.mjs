import test from "node:test";
import assert from "node:assert/strict";

import { shouldSkipHomeField } from "../core/global-settings-render.js";

test("shouldSkipHomeField skips grid dimension fields only in free mode", () => {
  assert.equal(shouldSkipHomeField({ key: "gridColumns" }, "free"), true);
  assert.equal(shouldSkipHomeField({ key: "gridRows" }, "free"), true);
  assert.equal(shouldSkipHomeField({ key: "itemGap" }, "free"), false);
  assert.equal(shouldSkipHomeField({ key: "gridColumns" }, "grid"), false);
});
