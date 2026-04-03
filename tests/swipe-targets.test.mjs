import test from "node:test";
import assert from "node:assert/strict";

import {
  canStartBoardSwipeFromTarget,
  isInteractiveSwipeTarget,
  isTextEditableTarget
} from "../core/swipe-targets.js";

function createTarget(matches = []) {
  return {
    closest(query) {
      const selectors = String(query)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return selectors.some((selector) => matches.includes(selector)) ? {} : null;
    }
  };
}

test("isInteractiveSwipeTarget detects lock and interactive selectors", () => {
  assert.equal(isInteractiveSwipeTarget(createTarget(["[data-no-page-swipe]"])), true);
  assert.equal(isInteractiveSwipeTarget(createTarget(["button"])), true);
  assert.equal(isInteractiveSwipeTarget(createTarget([".non-match"])), false);
});

test("canStartBoardSwipeFromTarget blocks blocked/widget zones and interactive targets", () => {
  assert.equal(canStartBoardSwipeFromTarget(createTarget(["#settingsPanel"])), false);
  assert.equal(canStartBoardSwipeFromTarget(createTarget([".widget-card"])), false);
  assert.equal(canStartBoardSwipeFromTarget(createTarget(["button"])), false);
  assert.equal(canStartBoardSwipeFromTarget(createTarget([".free-surface"])), true);
});

test("isTextEditableTarget detects editable selectors", () => {
  assert.equal(isTextEditableTarget(createTarget(["input"])), true);
  assert.equal(isTextEditableTarget(createTarget(["[contenteditable='true']"])), true);
  assert.equal(isTextEditableTarget(createTarget(["div"])), false);
});
