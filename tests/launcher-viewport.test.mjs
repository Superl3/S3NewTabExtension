import test from "node:test";
import assert from "node:assert/strict";

import {
  clampLauncherVirtualPage,
  isPlaceholderLauncherPage,
  resolveLauncherViewportPage,
  shouldRenderLauncherPlaceholderPage
} from "../core/launcher-viewport.js";

test("detects placeholder pages by sentinel index", () => {
  assert.equal(isPlaceholderLauncherPage(-1, 3), true);
  assert.equal(isPlaceholderLauncherPage(3, 3), true);
  assert.equal(isPlaceholderLauncherPage(1, 3), false);
});

test("enables placeholder rendering for edit and drag policy", () => {
  assert.equal(shouldRenderLauncherPlaceholderPage({ mode: "edit" }), true);
  assert.equal(shouldRenderLauncherPlaceholderPage({ mode: "use", dragPlaceholderPolicyActive: true }), true);
  assert.equal(shouldRenderLauncherPlaceholderPage({ mode: "use", hasPendingPlaceholderDrop: true }), true);
  assert.equal(shouldRenderLauncherPlaceholderPage({ mode: "use" }), false);
});

test("resolves viewport page with and without virtual page", () => {
  assert.equal(
    resolveLauncherViewportPage({
      activePage: 1,
      pageCount: 4,
      virtualPage: null,
      allowPlaceholderPages: true
    }),
    1
  );

  assert.equal(
    resolveLauncherViewportPage({
      activePage: 1,
      pageCount: 4,
      virtualPage: 4,
      allowPlaceholderPages: true
    }),
    4
  );

  assert.equal(
    resolveLauncherViewportPage({
      activePage: 2,
      pageCount: 4,
      virtualPage: 4,
      allowPlaceholderPages: false
    }),
    2
  );
});

test("resolves viewport page fallbacks for invalid and blank page inputs", () => {
  assert.equal(
    resolveLauncherViewportPage({
      activePage: "bad",
      pageCount: 0,
      virtualPage: "",
      allowPlaceholderPages: true
    }),
    0
  );

  assert.equal(
    resolveLauncherViewportPage({
      activePage: 2.9,
      pageCount: 3,
      virtualPage: "bad",
      allowPlaceholderPages: true
    }),
    2
  );
});

test("clamps virtual page range", () => {
  assert.equal(clampLauncherVirtualPage(-5, 4), -1);
  assert.equal(clampLauncherVirtualPage(99, 4), 4);
  assert.equal(clampLauncherVirtualPage("bad", 4), null);
  assert.equal(clampLauncherVirtualPage("", 0), 0);
});
