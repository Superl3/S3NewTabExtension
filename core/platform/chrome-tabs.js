import { resolveChromeApi } from "./chrome-api.js";
import { fromChromeCallback } from "./chrome-callback.js";
import { clampTruthyNumberOrFallback } from "../utils/number.js";

const DEFAULT_READY_TIMEOUT_MS = 20000;
const DEFAULT_READY_TIMEOUT_FLOOR_MS = 1000;

function resolveReadyTimeout(timeoutMs) {
  return clampTruthyNumberOrFallback(timeoutMs, DEFAULT_READY_TIMEOUT_MS, DEFAULT_READY_TIMEOUT_FLOOR_MS, Number.POSITIVE_INFINITY);
}

function runTabsCallback(run, fallbackMessage, chromeApi) {
  return fromChromeCallback(run, { chromeApi, fallbackMessage });
}

export function hasTabsApi(options = {}) {
  const chromeApi = resolveChromeApi(options.chromeApi);
  return (
    Boolean(chromeApi?.tabs) &&
    typeof chromeApi.tabs.query === "function" &&
    typeof chromeApi.tabs.get === "function" &&
    typeof chromeApi.tabs.create === "function" &&
    typeof chromeApi.tabs.update === "function" &&
    typeof chromeApi.tabs.remove === "function" &&
    typeof chromeApi.tabs.onUpdated?.addListener === "function" &&
    typeof chromeApi.tabs.onUpdated?.removeListener === "function"
  );
}

export function queryTabs(queryInfo, options = {}) {
  const chromeApi = resolveChromeApi(options.chromeApi);
  return runTabsCallback(
    (callback) => chromeApi.tabs.query(queryInfo, callback),
    "Unable to query browser tabs.",
    chromeApi
  );
}

export function getTab(tabId, options = {}) {
  const chromeApi = resolveChromeApi(options.chromeApi);
  return runTabsCallback(
    (callback) => chromeApi.tabs.get(tabId, callback),
    "Unable to read browser tab state.",
    chromeApi
  );
}

export async function getTabIfExists(tabId, options = {}) {
  try {
    return await getTab(tabId, options);
  } catch {
    return null;
  }
}

export function createTab(createProperties, options = {}) {
  const chromeApi = resolveChromeApi(options.chromeApi);
  return runTabsCallback(
    (callback) => chromeApi.tabs.create(createProperties, callback),
    "Unable to open browser tab.",
    chromeApi
  );
}

export function updateTab(tabId, updateProperties, options = {}) {
  const chromeApi = resolveChromeApi(options.chromeApi);
  return runTabsCallback(
    (callback) => chromeApi.tabs.update(tabId, updateProperties, callback),
    "Unable to update browser tab.",
    chromeApi
  );
}

export function removeTab(tabId, options = {}) {
  const chromeApi = resolveChromeApi(options.chromeApi);
  return runTabsCallback(
    (callback) => chromeApi.tabs.remove(tabId, callback),
    "Unable to close browser tab.",
    chromeApi
  );
}

export function waitForTabReady(tabId, options = {}) {
  const chromeApi = resolveChromeApi(options.chromeApi);
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  const timeoutMs = resolveReadyTimeout(options.timeoutMs);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    let updatedListener = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeoutFn(timeoutId);
        timeoutId = null;
      }
      if (updatedListener) {
        try {
          chromeApi.tabs.onUpdated.removeListener(updatedListener);
        } catch {
          // noop
        }
        updatedListener = null;
      }
    };

    const finish = (error = null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    updatedListener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (changeInfo?.status === "complete" || tab?.status === "complete") {
        finish();
      }
    };

    try {
      chromeApi.tabs.onUpdated.addListener(updatedListener);
    } catch {
      finish(new Error("Unable to subscribe to browser tab updates."));
      return;
    }

    timeoutId = setTimeoutFn(() => {
      finish(new Error("Timed out waiting for browser tab to finish loading."));
    }, timeoutMs);

    void getTab(tabId, { chromeApi })
      .then((tab) => {
        if (tab?.status === "complete") {
          finish();
        }
      })
      .catch((error) => {
        finish(error);
      });
  });
}
