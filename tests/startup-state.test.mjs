import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  getStartupStateFromLocation,
  loadStartupStateFromJsonValue,
  resolveComposableStartupState,
  resolveStartupStateDefault
} from "../core/startupState.js";
import { isStateObject, mergeStateObjects } from "../core/state/merge.js";

function gridCells(instance) {
  const grid = instance.gridLayout || {};
  const col = Number(grid.col) || 0;
  const row = Number(grid.row) || 0;
  const colSpan = Math.max(1, Number(grid.colSpan) || 1);
  const rowSpan = Math.max(1, Number(grid.rowSpan) || 1);
  const cells = [];
  for (let y = row; y < row + rowSpan; y += 1) {
    for (let x = col; x < col + colSpan; x += 1) {
      cells.push(`${x}:${y}`);
    }
  }
  return cells;
}

test("composes startup state v2 defaults, presets, and overrides", () => {
  const raw = {
    version: 2,
    defaults: {
      ui: {
        home: {
          gridColumns: 8,
          pageCount: 1
        }
      }
    },
    presets: {
      compact: {
        ui: {
          home: {
            gridColumns: 12
          }
        }
      },
      docked: {
        ui: {
          home: {
            dockEnabled: true
          }
        }
      }
    },
    applyPresets: ["compact", "docked"],
    overrides: {
      ui: {
        home: {
          pageCount: 2
        }
      }
    }
  };

  const composed = resolveComposableStartupState(raw, { isStateObject, mergeStateObjects });
  assert.equal(composed?.ui?.home?.gridColumns, 12);
  assert.equal(composed?.ui?.home?.dockEnabled, true);
  assert.equal(composed?.ui?.home?.pageCount, 2);
});

test("loads startup-state from URL query and respects empty-widgets flag", async () => {
  const payload = encodeURIComponent(
    JSON.stringify({
      version: 2,
      defaults: {
        ui: {
          home: {
            gridRows: 9
          }
        }
      }
    })
  );

  const startupState = await getStartupStateFromLocation({
    search: `?startup-state=${payload}&startup-state-empty-widgets=1`,
    isStateObject,
    mergeStateObjects,
    fetchFn: async () => {
      throw new Error("fetch should not run for inline JSON");
    },
    baseOrigin: "https://example.com",
    logger: { warn() {} }
  });

  assert.equal(startupState?.ui?.home?.gridRows, 9);
  assert.deepEqual(startupState?.instances, []);
});

test("rejects disallowed startup-state URL schemes", async () => {
  const startupState = await loadStartupStateFromJsonValue("file:///tmp/state.json", {
    isStateObject,
    mergeStateObjects,
    baseOrigin: "https://example.com",
    fetchFn: async () => {
      throw new Error("fetch should not run when URL scheme is blocked");
    }
  });
  assert.equal(startupState, null);
});

test("resolves default state using config loader composition", async () => {
  const resolved = await resolveStartupStateDefault({
    defaultState: () => ({
      mode: "use",
      ui: {
        home: {
          gridColumns: 4,
          pageCount: 1
        }
      }
    }),
    isStateObject,
    mergeStateObjects,
    startupStateJsonPath: "config/startup-state.json",
    runtimeGetUrl: () => "https://example.com/startup-state.json",
    baseOrigin: "https://example.com",
    fetchFn: async () => ({
      ok: true,
      async text() {
        return JSON.stringify({
          version: 2,
          defaults: {
            ui: {
              home: {
                gridColumns: 10
              }
            }
          },
          presets: {
            twoPages: {
              ui: {
                home: {
                  pageCount: 2
                }
              }
            }
          },
          applyPresets: ["twoPages"]
        });
      }
    })
  });

  assert.equal(resolved?.ui?.home?.gridColumns, 10);
  assert.equal(resolved?.ui?.home?.pageCount, 2);
  assert.equal(resolved?.mode, "use");
});

test("repository startup screen uses a non-overlapping grid layout", async () => {
  const raw = JSON.parse(await fs.readFile(new URL("../config/startup-state.json", import.meta.url), "utf8"));
  const composed = resolveComposableStartupState(raw, { isStateObject, mergeStateObjects });
  const home = composed?.ui?.home;
  const instances = composed?.instances || [];
  const occupied = new Map();

  assert.equal(home?.gridColumns, 12);
  assert.equal(home?.gridRows, 8);
  assert.equal(home?.pageCount, 1);
  assert.equal(home?.dockEnabled, false);
  assert.deepEqual(
    instances.map((instance) => instance.type),
    [
      "clock",
      "search",
      "weather",
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut",
      "bookmarks",
      "todo",
      "notes"
    ]
  );
  for (const shortcut of instances.filter((instance) => instance.type === "shortcut")) {
    assert.match(shortcut.config?.icon || "", /^https:\/\/www\.google\.com\/s2\/favicons\?sz=128&domain_url=/);
    assert.equal(shortcut.config?.faviconMode, "none");
  }
  assert.deepEqual(instances.find((instance) => instance.id === "clock-1")?.gridLayout, {
    col: 3,
    row: 0,
    colSpan: 3,
    rowSpan: 1
  });
  assert.deepEqual(instances.find((instance) => instance.id === "weather-3")?.gridLayout, {
    col: 6,
    row: 0,
    colSpan: 3,
    rowSpan: 1
  });
  assert.deepEqual(instances.find((instance) => instance.id === "search-2")?.gridLayout, {
    col: 3,
    row: 1,
    colSpan: 6,
    rowSpan: 1
  });
  assert.deepEqual(instances.find((instance) => instance.id === "todo-12")?.gridLayout, {
    col: 0,
    row: 3,
    colSpan: 3,
    rowSpan: 5
  });
  assert.deepEqual(instances.find((instance) => instance.id === "notes-13")?.gridLayout, {
    col: 9,
    row: 3,
    colSpan: 3,
    rowSpan: 5
  });
  assert.deepEqual(instances.find((instance) => instance.id === "bookmarks-10")?.gridLayout, {
    col: 3,
    row: 5,
    colSpan: 6,
    rowSpan: 3
  });

  for (const instance of instances.filter((item) => item.dockOrder === undefined || item.dockOrder === null)) {
    const grid = instance.gridLayout || {};
    assert.ok(Number(grid.col) + Number(grid.colSpan) <= home.gridColumns, `${instance.id} exceeds grid columns`);
    assert.ok(Number(grid.row) + Number(grid.rowSpan) <= home.gridRows, `${instance.id} exceeds grid rows`);
    for (const cell of gridCells(instance)) {
      assert.equal(occupied.get(cell), undefined, `${instance.id} overlaps ${occupied.get(cell)} at ${cell}`);
      occupied.set(cell, instance.id);
    }
  }
});
