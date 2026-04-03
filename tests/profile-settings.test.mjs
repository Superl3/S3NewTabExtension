import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDefaultProfileInfoText,
  formatPresetOptionLabel,
  buildProfileLoadScopeOptions,
  hasDefaultProfileSnapshot
} from "../core/profile-settings.js";

test("hasDefaultProfileSnapshot checks snapshot instance list", () => {
  assert.equal(hasDefaultProfileSnapshot(null), false);
  assert.equal(hasDefaultProfileSnapshot({ instances: [] }), false);
  assert.equal(hasDefaultProfileSnapshot({ instances: [{}] }), true);
});

test("buildDefaultProfileInfoText formats fallback and timestamp states", () => {
  assert.equal(buildDefaultProfileInfoText(null, 0), "No default profile yet.");
  const text = buildDefaultProfileInfoText({ instances: [{}] }, 1000, () => "DATE");
  assert.equal(text, "Current state is saved as default profile (DATE).");
});

test("buildProfileLoadScopeOptions returns all profile load scopes", () => {
  const options = buildProfileLoadScopeOptions();
  assert.deepEqual(options.map((option) => option.value), ["all", "global", "background", "widgets"]);
});

test("formatPresetOptionLabel composes label from preset metadata", () => {
  assert.equal(
    formatPresetOptionLabel({ name: "Morning", updatedAt: 1000 }, () => "DATE"),
    "Morning (DATE)"
  );
  assert.equal(
    formatPresetOptionLabel({}, () => "DATE"),
    "Preset (Unknown)"
  );
});
