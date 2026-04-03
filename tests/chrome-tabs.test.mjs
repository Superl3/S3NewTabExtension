import test from "node:test";
import assert from "node:assert/strict";

import { fromChromeCallback } from "../core/platform/chrome-callback.js";
import {
  createTab,
  getTab,
  getTabIfExists,
  queryTabs,
  removeTab,
  updateTab,
  waitForTabReady
} from "../core/platform/chrome-tabs.js";

function createChromeApi() {
  let lastErrorMessage = "";
  let listener = null;

  const chromeApi = {
    runtime: {
      get lastError() {
        return lastErrorMessage ? { message: lastErrorMessage } : null;
      }
    },
    tabs: {
      query(queryInfo, callback) {
        callback([{ id: 1, queryInfo }]);
      },
      get(tabId, callback) {
        callback({ id: tabId, status: "loading" });
      },
      create(createProperties, callback) {
        callback({ id: 3, ...createProperties });
      },
      update(tabId, updateProperties, callback) {
        callback({ id: tabId, ...updateProperties });
      },
      remove(tabId, callback) {
        callback(tabId);
      },
      onUpdated: {
        addListener(nextListener) {
          listener = nextListener;
        },
        removeListener(nextListener) {
          if (listener === nextListener) {
            listener = null;
          }
        }
      }
    }
  };

  return {
    chromeApi,
    emitUpdated(tabId, changeInfo = {}, tab = {}) {
      listener?.(tabId, changeInfo, tab);
    },
    setLastError(message) {
      lastErrorMessage = message;
    },
    hasListener() {
      return typeof listener === "function";
    }
  };
}

test("fromChromeCallback resolves callback results", async () => {
  const { chromeApi } = createChromeApi();

  const result = await fromChromeCallback((callback) => callback("done"), { chromeApi });

  assert.equal(result, "done");
});

test("fromChromeCallback rejects runtime lastError messages", async () => {
  const harness = createChromeApi();
  harness.setLastError("tabs failed");

  await assert.rejects(
    fromChromeCallback((callback) => callback(undefined), { chromeApi: harness.chromeApi }),
    /tabs failed/
  );
});

test("fromChromeCallback falls back for non-Error throws", async () => {
  await assert.rejects(
    fromChromeCallback(
      () => {
        throw "boom";
      },
      { fallbackMessage: "Fallback failure" }
    ),
    /Fallback failure/
  );
});

test("tab helpers proxy query, get, create, update, and remove", async () => {
  const { chromeApi } = createChromeApi();

  assert.deepEqual(await queryTabs({ active: true }, { chromeApi }), [{ id: 1, queryInfo: { active: true } }]);
  assert.deepEqual(await getTab(9, { chromeApi }), { id: 9, status: "loading" });
  assert.deepEqual(await createTab({ url: "https://example.com" }, { chromeApi }), {
    id: 3,
    url: "https://example.com"
  });
  assert.deepEqual(await updateTab(4, { active: true }, { chromeApi }), { id: 4, active: true });
  assert.equal(await removeTab(7, { chromeApi }), 7);
});

test("getTabIfExists returns null when tab lookup fails", async () => {
  const harness = createChromeApi();
  harness.chromeApi.tabs.get = (tabId, callback) => {
    harness.setLastError(`No tab ${tabId}`);
    callback(undefined);
  };

  const result = await getTabIfExists(99, { chromeApi: harness.chromeApi });

  assert.equal(result, null);
});

test("waitForTabReady resolves immediately for complete tabs", async () => {
  const harness = createChromeApi();
  let clearCount = 0;
  harness.chromeApi.tabs.get = (tabId, callback) => {
    callback({ id: tabId, status: "complete" });
  };

  await waitForTabReady(5, {
    chromeApi: harness.chromeApi,
    setTimeoutFn(handler) {
      return { handler };
    },
    clearTimeoutFn() {
      clearCount += 1;
    }
  });

  assert.equal(harness.hasListener(), false);
  assert.equal(clearCount, 1);
});

test("waitForTabReady resolves when onUpdated reports completion", async () => {
  const harness = createChromeApi();
  let timeoutHandler = null;

  const readyPromise = waitForTabReady(8, {
    chromeApi: harness.chromeApi,
    setTimeoutFn(handler) {
      timeoutHandler = handler;
      return 1;
    },
    clearTimeoutFn() {}
  });

  assert.equal(typeof timeoutHandler, "function");
  assert.equal(harness.hasListener(), true);

  harness.emitUpdated(8, { status: "complete" }, { id: 8, status: "complete" });

  await readyPromise;
  assert.equal(harness.hasListener(), false);
});

test("waitForTabReady rejects on timeout", async () => {
  const harness = createChromeApi();
  let timeoutHandler = null;

  const readyPromise = waitForTabReady(10, {
    chromeApi: harness.chromeApi,
    timeoutMs: 5,
    setTimeoutFn(handler) {
      timeoutHandler = handler;
      return 1;
    },
    clearTimeoutFn() {}
  });

  timeoutHandler();

  await assert.rejects(readyPromise, /Timed out waiting for browser tab to finish loading/);
  assert.equal(harness.hasListener(), false);
});
