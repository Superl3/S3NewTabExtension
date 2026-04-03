import test from "node:test";
import assert from "node:assert/strict";

import {
  getStartupStateFromLocation,
  loadStartupStateFromJsonValue,
  resolveComposableStartupState,
  resolveStartupStateDefault
} from "../core/startupState.js";
import { isStateObject, mergeStateObjects } from "../core/state/merge.js";

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
