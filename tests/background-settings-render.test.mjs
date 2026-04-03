import test from "node:test";
import assert from "node:assert/strict";

import { resolveBackgroundSchemaSet } from "../core/background-settings-render.js";

test("resolveBackgroundSchemaSet returns mode schema and fields for mode", () => {
  const result = resolveBackgroundSchemaSet({ mode: "solid" });
  assert.equal(result.modeSchema.key, "mode");
  assert.equal(Array.isArray(result.fields), true);
  assert.equal(result.fields.some((field) => field.key === "solidColor"), true);
});
