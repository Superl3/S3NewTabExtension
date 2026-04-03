import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveLauncherPageLayerStyle,
  resolveLauncherPlaceholderPages
} from "../core/launcher-page-affordances.js";

test("resolveLauncherPageLayerStyle computes deterministic layer style", () => {
  const style = resolveLauncherPageLayerStyle(3, 280, 190);
  assert.deepEqual(style, {
    left: "840px",
    top: "0px",
    width: "280px",
    height: "190px"
  });
});

test("resolveLauncherPlaceholderPages returns head and tail placeholders", () => {
  assert.deepEqual(resolveLauncherPlaceholderPages(4), [-1, 4]);
  assert.deepEqual(resolveLauncherPlaceholderPages(0), [-1, 1]);
});
