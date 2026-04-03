import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHomeSettingFields,
  buildThemeSettingFields
} from "../core/global-settings-fields.js";

test("buildThemeSettingFields includes font selector with provided options", () => {
  const options = [
    { value: "inter", label: "Inter" },
    { value: "mono", label: "Monospace" }
  ];
  const fields = buildThemeSettingFields({ fontOptions: options });
  const fontField = fields.find((field) => field.key === "fontFamily");
  assert.deepEqual(fontField?.options, options);
});

test("buildHomeSettingFields applies max bounds to grid schemas", () => {
  const fields = buildHomeSettingFields({ maxColumns: 12, maxRows: 9 });
  const columns = fields.find((field) => field.key === "gridColumns");
  const rows = fields.find((field) => field.key === "gridRows");
  assert.equal(columns?.max, 12);
  assert.equal(rows?.max, 9);
});
