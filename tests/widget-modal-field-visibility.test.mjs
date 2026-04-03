import test from "node:test";
import assert from "node:assert/strict";

import {
  isShortcutIconEditorField,
  shouldRenderWidgetModalField
} from "../core/widget-modal-field-visibility.js";

test("shouldRenderWidgetModalField hides aiChat-only restricted fields", () => {
  assert.equal(
    shouldRenderWidgetModalField(
      { key: "contentFillParent" },
      { currentType: "aiChat", useCustomColors: true }
    ),
    false
  );
  assert.equal(
    shouldRenderWidgetModalField(
      { key: "title" },
      { currentType: "aiChat", useCustomColors: true }
    ),
    true
  );
});

test("shouldRenderWidgetModalField hides custom color fields when disabled", () => {
  assert.equal(
    shouldRenderWidgetModalField(
      { key: "customAccentColor" },
      { currentType: "weather", useCustomColors: false }
    ),
    false
  );
  assert.equal(
    shouldRenderWidgetModalField(
      { key: "customAccentColor" },
      { currentType: "weather", useCustomColors: true }
    ),
    true
  );
});

test("isShortcutIconEditorField checks schema type", () => {
  assert.equal(isShortcutIconEditorField({ type: "shortcut-icon-editor" }), true);
  assert.equal(isShortcutIconEditorField({ type: "text" }), false);
});
