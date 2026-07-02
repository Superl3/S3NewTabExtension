import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultHomeLayout,
  gapPresetToPx,
  marginPresetToPx,
  normalizeDockVisibility,
  normalizeHomeLayout
} from "../core/home-layout.js";

test("provides default home layout baseline", () => {
  const home = defaultHomeLayout();
  assert.equal(home.mode, "grid");
  assert.equal(home.pageCount, 1);
  assert.equal(home.homePage, 0);
  assert.equal(home.dockVisibility, "fixed");
});

test("normalizes dock visibility aliases", () => {
  assert.equal(normalizeDockVisibility("always"), "fixed");
  assert.equal(normalizeDockVisibility("hover"), "collapsible");
  assert.equal(normalizeDockVisibility("collapsible"), "collapsible");
  assert.equal(normalizeDockVisibility("fixed"), "fixed");
});

test("normalizes home layout values and clamps ranges", () => {
  const normalized = normalizeHomeLayout({
    mode: "free",
    pageCount: 22,
    activePage: 19,
    homePage: 15,
    manualPages: [0, 4, 400],
    gridColumns: 99,
    gridRows: -8,
    dockVisibility: "hover",
    dockHeight: 500
  });

  assert.equal(normalized.pageCount, 12);
  assert.equal(normalized.activePage, 11);
  assert.equal(normalized.homePage, 11);
  assert.deepEqual(normalized.manualPages, [0, 4, 11]);
  assert.equal(normalized.gridColumns, 16);
  assert.equal(normalized.gridRows, 1);
  assert.equal(normalized.dockVisibility, "collapsible");
  assert.equal(normalized.dockHeight, 72);
});

test("normalizes home grid dimensions with truthy fallback before finite clamp", () => {
  const fallbackNormalized = normalizeHomeLayout({
    gridColumns: 0,
    gridRows: "bad"
  });

  assert.equal(fallbackNormalized.gridColumns, 4);
  assert.equal(fallbackNormalized.gridRows, 3);

  const nonFiniteNormalized = normalizeHomeLayout({
    gridColumns: Number.POSITIVE_INFINITY,
    gridRows: Number.POSITIVE_INFINITY
  });

  assert.equal(nonFiniteNormalized.gridColumns, 1);
  assert.equal(nonFiniteNormalized.gridRows, 1);
});

test("converts margin and gap presets to pixels", () => {
  assert.equal(marginPresetToPx("wide"), 40);
  assert.equal(marginPresetToPx("none"), 0);
  assert.equal(gapPresetToPx("wide"), 16);
  assert.equal(gapPresetToPx("none"), 0);
});
