import test from "node:test";
import assert from "node:assert/strict";

import {
  applyLauncherHomeMetadata,
  normalizeActivePage,
  normalizeLauncherPageIndexList,
  normalizePageCount,
  normalizeWidgetPage,
  remapLauncherPageIndexList,
  remapPageForDeletion,
  resolvePageTowardHomeDirection,
  shiftLauncherPageIndexListOnDelete,
  shiftLauncherPageIndexListOnInsert
} from "../core/launcher-pages.js";

test("normalizes page counts and active page bounds", () => {
  assert.equal(normalizePageCount(0), 1);
  assert.equal(normalizePageCount(40), 12);
  assert.equal(normalizeActivePage(10, 3, 0), 2);
  assert.equal(normalizeWidgetPage(-5, 4, 0), 0);
});

test("normalizes and remaps manual page index lists", () => {
  const normalized = normalizeLauncherPageIndexList([2, 1, 2, 99], 4);
  assert.deepEqual(normalized, [1, 2, 3]);

  const remap = new Map([
    [0, 0],
    [2, 1],
    [3, 2]
  ]);
  assert.deepEqual(remapLauncherPageIndexList([0, 2, 3], remap, 3), [0, 1, 2]);
});

test("shifts manual pages on insert and delete", () => {
  const insertedLeft = shiftLauncherPageIndexListOnInsert([0, 2], {
    addLeft: true,
    pageCount: 4,
    insertedPage: 0
  });
  assert.deepEqual(insertedLeft, [0, 1, 3]);

  const deleted = shiftLauncherPageIndexListOnDelete([0, 2, 3], 2, 3);
  assert.deepEqual(deleted, [0, 2]);
});

test("resolves page movement toward home and deletion remap", () => {
  assert.equal(resolvePageTowardHomeDirection([0, 2, 4], 3, 1), 2);
  assert.equal(resolvePageTowardHomeDirection([1, 2, 4], 0, 3), 1);
  assert.equal(remapPageForDeletion(4, 2, 4), 3);
});

test("applies launcher home metadata safely", () => {
  const home = {
    pageCount: 6,
    homePage: 99,
    manualPages: [0, 2, 2, 8]
  };

  applyLauncherHomeMetadata(home);
  assert.equal(home.homePage, 5);
  assert.deepEqual(home.manualPages, [0, 2, 5]);
});
