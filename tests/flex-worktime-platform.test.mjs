import test from "node:test";
import assert from "node:assert/strict";

import { fetchFlexHomeScrapeRows } from "../widgets/flexWorktime.js";

function createChromeHarness() {
  let updatedListener = null;
  let nextTabId = 40;
  const tabsById = new Map();
  const calls = {
    query: [],
    create: [],
    get: [],
    update: [],
    remove: [],
    executeScript: []
  };

  const chrome = {
    runtime: {},
    tabs: {
      query(queryInfo, callback) {
        calls.query.push(queryInfo);
        callback([]);
      },
      get(tabId, callback) {
        calls.get.push(tabId);
        callback(tabsById.get(tabId));
      },
      create(createProperties, callback) {
        calls.create.push(createProperties);
        const tab = {
          id: nextTabId += 1,
          status: "complete",
          ...createProperties
        };
        tabsById.set(tab.id, tab);
        callback(tab);
      },
      update(tabId, updateProperties, callback) {
        calls.update.push({ tabId, updateProperties });
        const nextTab = {
          ...(tabsById.get(tabId) || { id: tabId }),
          ...updateProperties
        };
        tabsById.set(tabId, nextTab);
        callback(nextTab);
      },
      remove(tabId, callback) {
        calls.remove.push(tabId);
        tabsById.delete(tabId);
        callback();
      },
      onUpdated: {
        addListener(listener) {
          updatedListener = listener;
        },
        removeListener(listener) {
          if (updatedListener === listener) {
            updatedListener = null;
          }
        }
      }
    },
    scripting: {
      executeScript(injection, callback) {
        calls.executeScript.push(injection);
        callback([
          {
            frameId: 0,
            result: {
              ok: true,
              status: "근무중",
              duration: "8시간 12분",
              line: "근무중 8시간 12분",
              title: "Flex Home",
              url: "https://flex.team/home",
              extractedAt: 1712012345678
            }
          }
        ]);
      }
    }
  };

  return {
    chrome,
    calls,
    hasUpdatedListener() {
      return typeof updatedListener === "function";
    }
  };
}

test("fetchFlexHomeScrapeRows uses platform wrappers for temporary Flex tab scraping", async () => {
  const harness = createChromeHarness();
  const originalChrome = globalThis.chrome;
  globalThis.chrome = harness.chrome;

  try {
    const scrapeFlowState = { reusableTabId: null };
    const rows = await fetchFlexHomeScrapeRows(
      {
        flexHomeUrl: "https://flex.team/home",
        openFlexTabIfMissing: true
      },
      "2026-04-02",
      scrapeFlowState
    );

    assert.equal(harness.calls.query.length, 3);
    assert.deepEqual(harness.calls.create, [{ url: "https://flex.team/home", active: false }]);
    assert.equal(harness.calls.executeScript.length, 1);
    assert.equal(harness.calls.remove.length, 1);
    assert.equal(harness.hasUpdatedListener(), false);
    assert.equal(scrapeFlowState.reusableTabId, null);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "근무중");
    assert.equal(rows[0].durationLabel, "8시간 12분");
    assert.equal(rows[0].rawEntry.sourceMode, "flexHomeScrape");
    assert.equal(rows[0].rawEntry.queryDate, "2026-04-02");
  } finally {
    globalThis.chrome = originalChrome;
  }
});
