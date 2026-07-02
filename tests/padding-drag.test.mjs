import test from "node:test";
import assert from "node:assert/strict";

import {
  hasContentPaddingChanged,
  projectContentPaddingFromDrag
} from "../core/padding-drag.js";
import { normalizePaddingValue as normalizePadding } from "../core/utils/padding.js";

test("projectContentPaddingFromDrag updates top-right corner paddings", () => {
  const result = projectContentPaddingFromDrag(
    {
      corner: "topRight",
      proportional: false,
      dx: 25,
      dy: 10,
      startPadding: { top: 20, right: 30, bottom: 40, left: 50 },
      fallbackPadding: 10
    },
    { normalizePadding }
  );

  assert.deepEqual(result, {
    top: 24,
    right: 20,
    bottom: 40,
    left: 50,
    topRight: 22,
    bottomLeft: 45,
    all: 33.5
  });
});

test("projectContentPaddingFromDrag updates bottom-left proportionally", () => {
  const result = projectContentPaddingFromDrag(
    {
      corner: "bottomLeft",
      proportional: true,
      dx: 15,
      dy: 5,
      startPadding: { top: 10, right: 10, bottom: 10, left: 10 },
      fallbackPadding: 10
    },
    { normalizePadding }
  );

  assert.deepEqual(result, {
    top: 10,
    right: 10,
    bottom: 14,
    left: 14,
    topRight: 10,
    bottomLeft: 14,
    all: 12
  });
});

test("projectContentPaddingFromDrag uses shared fallback padding normalization", () => {
  const result = projectContentPaddingFromDrag({
    corner: "bottomLeft",
    proportional: false,
    dx: 400,
    dy: 400,
    startPadding: { top: 10, right: 10, bottom: 10, left: 10 },
    fallbackPadding: 10
  });

  assert.deepEqual(result, {
    top: 10,
    right: 10,
    bottom: 0,
    left: 100,
    topRight: 10,
    bottomLeft: 50,
    all: 30
  });
});

test("normalizePadding preserves unclamped fallback for non-numeric values", () => {
  assert.equal(normalizePadding("bad", 150), 150);
  assert.equal(normalizePadding(Infinity, -5), -5);
  assert.equal(normalizePadding(120, 10), 100);
  assert.equal(normalizePadding(-10, 10), 0);
});

test("hasContentPaddingChanged compares directional paddings", () => {
  assert.equal(
    hasContentPaddingChanged(
      { top: 1, right: 2, bottom: 3, left: 4 },
      { top: 1, right: 2, bottom: 3, left: 4 }
    ),
    false
  );
  assert.equal(
    hasContentPaddingChanged(
      { top: 1, right: 2, bottom: 3, left: 4 },
      { top: 1, right: 9, bottom: 3, left: 4 }
    ),
    true
  );
});
