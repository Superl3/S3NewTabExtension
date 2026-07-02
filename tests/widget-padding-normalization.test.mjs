import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveAveragePaddingValue,
  resolveDirectionalPaddingFromDraft
} from "../core/widget-padding-normalization.js";
import { normalizePaddingValue as normalizePadding } from "../core/utils/padding.js";

test("resolveDirectionalPaddingFromDraft resolves directional and derived values", () => {
  const resolved = resolveDirectionalPaddingFromDraft(
    {
      contentPadding: 12,
      contentPaddingTop: 14,
      contentPaddingRight: 18,
      contentPaddingBottom: 22,
      contentPaddingLeft: 26
    },
    10,
    normalizePadding
  );

  assert.deepEqual(resolved, {
    uniform: 12,
    top: 14,
    right: 18,
    bottom: 22,
    left: 26,
    topRight: 16,
    bottomLeft: 24,
    all: 20
  });
});

test("resolveAveragePaddingValue computes mean with fallback", () => {
  const avg = resolveAveragePaddingValue(
    {
      contentPadding: 8,
      contentPaddingTop: 10,
      contentPaddingRight: 14,
      contentPaddingBottom: 18,
      contentPaddingLeft: 22
    },
    10,
    normalizePadding
  );
  assert.equal(avg, 16);
});

test("resolveAveragePaddingValue uses shared fallback padding normalization", () => {
  assert.equal(
    resolveAveragePaddingValue(
      {
        contentPadding: 12,
        contentPaddingTop: -10,
        contentPaddingRight: 120,
        contentPaddingBottom: 18,
        contentPaddingLeft: "bad"
      },
      10
    ),
    32.5
  );
});
