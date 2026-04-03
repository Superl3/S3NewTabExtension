import test from "node:test";
import assert from "node:assert/strict";

import { buildBackgroundSettingFields } from "../core/background-settings-fields.js";

test("buildBackgroundSettingFields builds wallpaper fields with reddit extras", () => {
  const { modeSchema, fields } = buildBackgroundSettingFields({
    mode: "wallpaper",
    wallpaperProvider: "reddit"
  });

  assert.equal(modeSchema.key, "mode");
  const keys = fields.map((field) => field.key);
  assert.deepEqual(
    keys,
    [
      "mode",
      "wallpaperProvider",
      "wallpaperTheme",
      "redditSubreddit",
      "redditTime",
      "rotateMinutes",
      "blurAmount",
      "overlayOpacity"
    ]
  );
});

test("buildBackgroundSettingFields builds video mode without inline mode field", () => {
  const { fields } = buildBackgroundSettingFields({
    mode: "video"
  });

  const keys = fields.map((field) => field.key);
  assert.deepEqual(keys, ["localMediaBackgroundColor", "localMediaFit", "overlayOpacity"]);
});
