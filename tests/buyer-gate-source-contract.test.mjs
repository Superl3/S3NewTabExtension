import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  FALLBACK_DEFAULT_GRID,
  FALLBACK_DEFAULT_WIDGET_TYPES,
  assignFallbackDefaultGridLayouts
} from "../core/default-widget-order.js";
import { widgetDefaultGridSize } from "../core/layout-primitives.js";
import { widgetRegistry } from "../widgets/index.js";

test("fallback default widgets exclude setup-heavy and placeholder-only widgets", async () => {
  assert.deepEqual(FALLBACK_DEFAULT_WIDGET_TYPES, [
    "clock",
    "search",
    "weather",
    "bookmarks",
    "shortcut",
    "todo",
    "notes"
  ]);
  assert.equal(FALLBACK_DEFAULT_WIDGET_TYPES.includes("aiChat"), false);
  assert.equal(FALLBACK_DEFAULT_WIDGET_TYPES.includes("label"), false);
});

test("fallback default widgets fit first launch and leave room for Add Widget", async () => {
  const layouts = assignFallbackDefaultGridLayouts(FALLBACK_DEFAULT_WIDGET_TYPES, {
    widgetRegistry,
    widgetDefaultGridSize
  });
  const occupied = new Set();

  for (const item of layouts) {
    const { page, gridLayout } = item;
    assert.equal(page, 0, `${item.type} should fit on the first fallback page`);
    assert.ok(gridLayout.col + gridLayout.colSpan <= FALLBACK_DEFAULT_GRID.columns);
    assert.ok(gridLayout.row + gridLayout.rowSpan <= FALLBACK_DEFAULT_GRID.rows);

    for (let y = gridLayout.row; y < gridLayout.row + gridLayout.rowSpan; y += 1) {
      for (let x = gridLayout.col; x < gridLayout.col + gridLayout.colSpan; x += 1) {
        const key = `${page}:${x}:${y}`;
        assert.equal(occupied.has(key), false, `${item.type} overlaps fallback cell ${key}`);
        occupied.add(key);
      }
    }
  }

  const addProbeLayouts = assignFallbackDefaultGridLayouts([...FALLBACK_DEFAULT_WIDGET_TYPES, "clock"], {
    widgetRegistry,
    widgetDefaultGridSize
  });
  assert.equal(addProbeLayouts.at(-1)?.page, 0);
});

test("fallback default grid layout normalizes invalid grid dimensions and spans", () => {
  const layouts = assignFallbackDefaultGridLayouts(["wide"], {
    columns: 0,
    rows: "bad",
    widgetRegistry: { wide: {} },
    widgetDefaultGridSize: () => ({ colSpan: 99, rowSpan: "bad" })
  });

  assert.deepEqual(layouts, [
    {
      type: "wide",
      page: 0,
      gridLayout: {
        col: 0,
        row: 0,
        colSpan: FALLBACK_DEFAULT_GRID.columns,
        rowSpan: 1
      }
    }
  ]);
});

test("AI Chat degraded setup copy is actionable and chrome access is guarded", async () => {
  const source = await fs.readFile(new URL("../widgets/aiChat.js", import.meta.url), "utf8");

  assert.match(source, /connector URL or access token in settings to enable AI Chat/);
  assert.match(source, /connector URL or access token in settings before connecting/);
  assert.match(source, /Check the connector URL or add an access token in settings/);
  assert.match(source, /Check the endpoint, model, and access token in settings/);
  assert.match(source, /getStorageArea: getChromeStorageLocal/);
  assert.match(source, /const identityApi = getChromeIdentity\(\)/);
  assert.doesNotMatch(source, /getStorageArea:\s*\(\)\s*=>\s*chrome\?\.storage\?\.local/);
  assert.doesNotMatch(source, /chrome\.identity/);
  assert.doesNotMatch(source, /Request failed: \$\{error\.message\}/);
});

test("account-backed setup states do not leak raw browser API or terse setup copy", async () => {
  const files = {
    githubPrList: await fs.readFile(new URL("../widgets/githubPrList.js", import.meta.url), "utf8"),
    githubReviewInbox: await fs.readFile(new URL("../widgets/githubReviewInbox.js", import.meta.url), "utf8"),
    mondayAssigned: await fs.readFile(new URL("../widgets/mondayAssigned.js", import.meta.url), "utf8"),
    mondayMeetingNote: await fs.readFile(new URL("../widgets/mondayMeetingNote.js", import.meta.url), "utf8"),
    rss: await fs.readFile(new URL("../widgets/rss.js", import.meta.url), "utf8")
  };

  assert.match(files.githubPrList, /Add a repository in widget settings to load pull requests/);
  assert.match(files.githubReviewInbox, /Add your GitHub login in widget settings to match review requests/);
  assert.match(files.mondayAssigned, /Add a connector URL or Monday access token in settings before connecting/);
  assert.match(files.mondayMeetingNote, /Check Monday settings and try again/);
  assert.match(files.rss, /Add a feed URL in widget settings before refreshing/);
  assert.match(files.rss, /Feed is not reachable\. Check the feed URL or browser network access/);

  for (const source of Object.values(files)) {
    assert.doesNotMatch(source, /Set .* first/);
    assert.doesNotMatch(source, /Unknown error/);
  }

  for (const source of [files.mondayAssigned, files.mondayMeetingNote]) {
    assert.match(source, /getStorageArea: getChromeStorageLocal/);
    assert.match(source, /const identityApi = getChromeIdentity\(\)/);
    assert.match(source, /getChromeStorageChanges\(\)/);
    assert.doesNotMatch(source, /getStorageArea:\s*\(\)\s*=>\s*chrome\?\.storage/);
    assert.doesNotMatch(source, /chrome\.storage/);
    assert.doesNotMatch(source, /chrome\.identity/);
  }
});

test("auth widgets use a shared chrome API seam", async () => {
  const source = await fs.readFile(new URL("../widgets/shared/chromeApi.js", import.meta.url), "utf8");

  assert.match(source, /export function getChromeStorageLocal/);
  assert.match(source, /export function getChromeStorageChanges/);
  assert.match(source, /export function getChromeIdentity/);
});
