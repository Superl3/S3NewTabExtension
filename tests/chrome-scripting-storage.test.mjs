import test from "node:test";
import assert from "node:assert/strict";

import { executeScript } from "../core/platform/chrome-scripting.js";

function createChromeApi(overrides = {}) {
  return {
    runtime: {},
    scripting: {
      executeScript(_injection, callback) {
        callback([]);
      }
    },
    ...overrides
  };
}

test("executeScript passes function injections through and preserves results", async () => {
  let receivedInjection = null;
  const chromeApi = createChromeApi({
    scripting: {
      executeScript(injection, callback) {
        receivedInjection = injection;
        callback([{ frameId: 0, result: { ok: true } }]);
      }
    }
  });

  const result = await executeScript(
    {
      target: { tabId: 7 },
      func: (value) => value,
      args: ["demo"]
    },
    { chromeApi }
  );

  assert.equal(receivedInjection.target.tabId, 7);
  assert.equal(typeof receivedInjection.func, "function");
  assert.deepEqual(receivedInjection.args, ["demo"]);
  assert.deepEqual(result, [{ frameId: 0, result: { ok: true } }]);
});

test("executeScript supports file injections", async () => {
  let receivedInjection = null;
  const chromeApi = createChromeApi({
    scripting: {
      executeScript(injection, callback) {
        receivedInjection = injection;
        callback([{ frameId: 0 }]);
      }
    }
  });

  await executeScript(
    {
      target: { tabId: 11 },
      files: ["content-scripts/codexUsageScraper.js"]
    },
    { chromeApi }
  );

  assert.deepEqual(receivedInjection, {
    target: { tabId: 11 },
    files: ["content-scripts/codexUsageScraper.js"]
  });
});

test("executeScript rejects when Chrome reports a runtime error", async () => {
  const chromeApi = createChromeApi({
    runtime: {
      lastError: { message: "Missing host permission" }
    },
    scripting: {
      executeScript(_injection, callback) {
        callback(undefined);
      }
    }
  });

  await assert.rejects(
    executeScript(
      {
        target: { tabId: 3 },
        files: ["content-scripts/codexUsageScraper.js"]
      },
      { chromeApi }
    ),
    /Missing host permission/
  );
});

test("executeScript rejects invalid injection combinations before calling Chrome", async () => {
  const chromeApi = createChromeApi();

  await assert.rejects(
    executeScript(
      {
        target: { tabId: 5 },
        files: ["content-scripts/codexUsageScraper.js"],
        func: () => true
      },
      { chromeApi }
    ),
    /exactly one of files or func/
  );

  await assert.rejects(
    executeScript(
      {
        target: { tabId: 5, allFrames: true, frameIds: [0] },
        files: ["content-scripts/codexUsageScraper.js"]
      },
      { chromeApi }
    ),
    /cannot use target\.allFrames and target\.frameIds together/
  );
});
