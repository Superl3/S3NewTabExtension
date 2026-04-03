import test from "node:test";
import assert from "node:assert/strict";

import {
  isThemeFieldKey,
  normalizeDisplayColor,
  settingsEventName
} from "../core/settings-controls.js";

test("normalizeDisplayColor normalizes hex color forms", () => {
  assert.equal(normalizeDisplayColor("#a1b2c3"), "#A1B2C3");
  assert.equal(normalizeDisplayColor("#abc"), "#AABBCC");
  assert.equal(normalizeDisplayColor("invalid", "#112233"), "#112233");
});

test("isThemeFieldKey recognizes theme-related keys", () => {
  assert.equal(isThemeFieldKey("primary"), true);
  assert.equal(isThemeFieldKey("customSurfaceColor"), true);
  assert.equal(isThemeFieldKey("notThemeField"), false);
});

test("settingsEventName resolves event type by schema", () => {
  assert.equal(settingsEventName({ type: "checkbox" }), "change");
  assert.equal(settingsEventName({ type: "select" }), "change");
  assert.equal(settingsEventName({ type: "color" }), "input");
  assert.equal(settingsEventName({ type: "text" }), "change");
});
