import assert from "node:assert/strict";
import test from "node:test";
import { withPersistenceLock } from "../core/platform/persistence-lock.js";

test("native storage lock holds exclusive access through the asynchronous write", async () => {
  const calls = [];
  const locks = {
    async request(name, options, action) {
      calls.push([name, options]);
      return action();
    }
  };
  assert.equal(await withPersistenceLock("dashboard", async () => 42, locks), 42);
  assert.deepEqual(calls, [["s3newtab:persist:dashboard", { mode: "exclusive" }]]);
});

test("fallback queues serialize runtimes and release the queue after a failure", async () => {
  const events = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = withPersistenceLock("test-queue", async () => {
    events.push("first");
    await gate;
    throw new Error("write failed");
  }, null);
  const rejected = assert.rejects(first, /write failed/);
  const second = withPersistenceLock("test-queue", () => { events.push("second"); }, null);
  await Promise.resolve();
  assert.deepEqual(events, ["first"]);
  release();
  await Promise.all([rejected, second]);
  assert.deepEqual(events, ["first", "second"]);
});

test("native lock failures never fall back to an unprotected write", async () => {
  let writes = 0;
  await assert.rejects(withPersistenceLock("dashboard", () => { writes += 1; }, {
    request: () => Promise.reject(new Error("lock denied"))
  }), /lock denied/);
  assert.equal(writes, 0);
});
