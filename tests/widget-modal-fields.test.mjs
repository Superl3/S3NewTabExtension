import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWidgetCommonMasterFields,
  buildWidgetModalCommonFields
} from "../core/widget-modal-fields.js";

test("buildWidgetModalCommonFields includes layout fields only when enabled", () => {
  const withoutLayout = buildWidgetModalCommonFields({ pageCount: 3, allowManualLayout: false });
  const withLayout = buildWidgetModalCommonFields({ pageCount: 3, allowManualLayout: true });

  const withoutLayoutKeys = withoutLayout.map((field) => field.key);
  const withLayoutKeys = withLayout.map((field) => field.key);

  assert.equal(withoutLayoutKeys.includes("x"), false);
  assert.equal(withoutLayoutKeys.includes("y"), false);
  assert.equal(withLayoutKeys.includes("x"), true);
  assert.equal(withLayoutKeys.includes("h"), true);
});

test("buildWidgetModalCommonFields applies page max from pageCount", () => {
  const fields = buildWidgetModalCommonFields({ pageCount: 7, allowManualLayout: false });
  const pageField = fields.find((field) => field.key === "page");
  assert.equal(pageField?.max, 7);
});

test("buildWidgetCommonMasterFields contains expected theme override options", () => {
  const fields = buildWidgetCommonMasterFields();
  const themeModeField = fields.find((field) => field.key === "widgetThemeMode");
  assert.deepEqual(
    themeModeField?.options,
    [
      { value: "inherit", label: "Inherit global" },
      { value: "light", label: "Force light" },
      { value: "dark", label: "Force dark" }
    ]
  );
});
