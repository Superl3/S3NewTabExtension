import test from "node:test";
import assert from "node:assert/strict";

import { createMustBridge } from "../core/must-gate/must-bridge.js";

function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { impl, calls };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("load returns the state, uses the loopback origin and POSTs (extension GETs carry no Origin header)", async () => {
  const { impl, calls } = fakeFetch(() => jsonResponse(200, { gateOpen: false, must: [] }));
  const result = await createMustBridge({ fetchImpl: impl }).load();
  assert.deepEqual(result, { ok: true, state: { gateOpen: false, must: [] } });
  assert.equal(calls[0].url, "http://127.0.0.1:8787/api/must/state");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.body, "{}");
});

test("actions post JSON to the item path with the id encoded", async () => {
  const { impl, calls } = fakeFetch(() => jsonResponse(200, { gateOpen: true }));
  const bridge = createMustBridge({ fetchImpl: impl });
  await bridge.done("m-1/../x", { note: "확인" });
  await bridge.capture({ title: "새 일" });
  assert.equal(calls[0].url, "http://127.0.0.1:8787/api/must/m-1%2F..%2Fx/done");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.body, JSON.stringify({ note: "확인" }));
  assert.equal(calls[1].url, "http://127.0.0.1:8787/api/must/capture");
});

test("network failure, 503 and 403 count as offline so the gate never blocks", async () => {
  const down = createMustBridge({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  assert.deepEqual((await down.load()).offline, true);
  for (const status of [503, 403]) {
    const bridge = createMustBridge({ fetchImpl: async () => jsonResponse(status, { error: { code: "NOT_CONFIGURED", message: "x" } }) });
    const result = await bridge.load();
    assert.equal(result.ok, false);
    assert.equal(result.offline, true);
  }
});

test("rule errors are not offline and keep the server code and cap list", async () => {
  const bridge = createMustBridge({
    fetchImpl: async () => jsonResponse(409, { error: { code: "CAP_FULL", message: "상한", must: [{ id: "a", title: "A" }] } })
  });
  const result = await bridge.promote("z");
  assert.equal(result.ok, false);
  assert.equal(result.offline, false);
  assert.equal(result.error.code, "CAP_FULL");
  assert.deepEqual(result.error.must, [{ id: "a", title: "A" }]);
});

test("a hanging request is aborted by the timeout instead of hanging the tab", async () => {
  const bridge = createMustBridge({
    timeoutMs: 20,
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      })
  });
  const result = await bridge.load();
  assert.equal(result.offline, true);
});
