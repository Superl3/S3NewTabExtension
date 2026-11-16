import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { createMustStore } from "../connector/must-store.mjs";
import { handleMustRoute, isMustPath } from "../connector/must-routes.mjs";

const EXT_ID = "a".repeat(32);
const OTHER_ID = "b".repeat(32);
const NOW = new Date("2026-11-16T03:00:00Z"); // 12:00 in Seoul

function makeNote(extra = "") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "must-"));
  const file = path.join(dir, "must.md");
  fs.writeFileSync(
    file,
    [
      "---",
      "type: note",
      "---",
      "",
      "## 항목",
      "",
      "- [ ] 회고 [id:: m-a] [kind:: work] [due:: 2026-11-17] [defer:: 0] [tier:: list]",
      "- [ ] 결정 [id:: m-d] [kind:: decision] [due:: 2026-11-16] [defer:: 0] [tier:: list]",
      "- [ ] 나중 [id:: m-z] [kind:: habit] [due:: 2026-12-30] [defer:: 0] [tier:: list]",
      extra,
      "## 기록",
      ""
    ].join("\r\n"),
    "utf8"
  );
  return { dir, file };
}

async function withServer(fn, { store, ids = new Set([EXT_ID]) } = {}) {
  let port = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (!isMustPath(url.pathname)) {
      res.writeHead(404).end();
      return;
    }
    void handleMustRoute({
      req,
      res,
      pathname: url.pathname,
      method: req.method,
      store,
      guardOptions: { allowedExtensionIds: ids, port }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function call(port, method, pathname, { origin = `chrome-extension://${EXT_ID}`, host, body, type = "application/json" } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host ?? `127.0.0.1:${port}` };
    if (origin) {
      headers.Origin = origin;
    }
    const payload = body === undefined ? null : JSON.stringify(body);
    if (payload !== null) {
      headers["Content-Type"] = type;
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, json });
      });
    });
    req.on("error", reject);
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

test("guard rejects foreign origins, missing origin, wrong host and unconfigured ids", async () => {
  const { file } = makeNote();
  const store = createMustStore({ filePath: file, now: () => NOW });
  await withServer(async (port) => {
    assert.equal((await call(port, "GET", "/api/must", { origin: "https://evil.example" })).status, 403);
    assert.equal((await call(port, "GET", "/api/must", { origin: `chrome-extension://${OTHER_ID}` })).status, 403);
    assert.equal((await call(port, "GET", "/api/must", { origin: "" })).status, 403);
    assert.equal((await call(port, "GET", "/api/must", { host: "attacker.example" })).json.error.code, "BAD_HOST");
    const denied = await call(port, "POST", "/api/must/capture", { origin: "https://evil.example", body: { title: "x" } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers["access-control-allow-origin"], undefined);
  }, { store });
  assert.ok(!fs.readFileSync(file, "utf8").includes("evil"));
  await withServer(async (port) => {
    assert.equal((await call(port, "GET", "/api/must")).status, 503);
  }, { store, ids: new Set() });
});

test("GET returns the computed gate state and CORS is limited to the extension origin", async () => {
  const { file } = makeNote();
  await withServer(async (port) => {
    const res = await call(port, "GET", "/api/must");
    assert.equal(res.status, 200);
    assert.equal(res.headers["access-control-allow-origin"], `chrome-extension://${EXT_ID}`);
    assert.equal(res.json.today, "2026-11-16");
    assert.deepEqual(res.json.must.map((x) => x.id), ["m-d", "m-a"]);
    assert.equal(res.json.gateOpen, true);
    const pre = await call(port, "OPTIONS", "/api/must/capture");
    assert.equal(pre.status, 204);
  }, { store: createMustStore({ filePath: file, now: () => NOW }) });
});

test("actions rewrite the note (CRLF kept), log the change and return the new state", async () => {
  const { file } = makeNote();
  await withServer(async (port) => {
    const decisionNoNote = await call(port, "POST", "/api/must/m-d/done", { body: {} });
    assert.equal(decisionNoNote.status, 400);
    assert.equal(decisionNoNote.json.error.code, "NOTE_REQUIRED");

    const done = await call(port, "POST", "/api/must/m-d/done", { body: { note: "개인 fork로 정함" } });
    assert.equal(done.status, 200);
    assert.deepEqual(done.json.must.map((x) => x.id), ["m-a"]);

    const deferred = await call(port, "POST", "/api/must/m-a/defer", { body: { until: "2026-11-19" } });
    assert.equal(deferred.status, 200);
    assert.equal(deferred.json.gateOpen, true); // 3 days away is still due-soon
    const again = await call(port, "POST", "/api/must/m-a/defer", { body: { until: "2026-11-20" } });
    assert.equal(again.status, 200);
    const third = await call(port, "POST", "/api/must/m-a/defer", { body: { until: "2026-11-21" } });
    assert.equal(third.status, 409);
    assert.equal(third.json.error.code, "DEFER_LIMIT");

    const captured = await call(port, "POST", "/api/must/capture", { body: { title: "새 항목", kind: "cleanup" } });
    assert.equal(captured.json.list.some((x) => x.title === "새 항목"), true);

    assert.equal((await call(port, "POST", "/api/must/nope/done", { body: {} })).status, 404);
    assert.equal((await call(port, "POST", "/api/must/m-a/explode", { body: {} })).status, 404);
  }, { store: createMustStore({ filePath: file, now: () => NOW, random: () => 0.25 }) });

  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.includes("\r\n") && !/[^\r]\n/.test(text), "line endings stay CRLF");
  assert.match(text, /- \[x\] 결정 \[id:: m-d\].*\[closed:: 2026-11-16\] \[how:: 개인 fork로 정함\]/);
  assert.match(text, /## 기록\r\n- 2026-11-16 done m-d 결정 — 개인 fork로 정함/);
  assert.match(text, /defer m-a 회고 → 2026-11-20 \(2\/2\)/);
});

test("rejects non-JSON content type and bad JSON without touching the note", async () => {
  const { file } = makeNote();
  const before = fs.readFileSync(file, "utf8");
  await withServer(async (port) => {
    const plain = await call(port, "POST", "/api/must/capture", { body: { title: "x" }, type: "text/plain" });
    assert.equal(plain.json.error.code, "BAD_CONTENT_TYPE");
    assert.equal(fs.readFileSync(file, "utf8"), before);
    const noop = await call(port, "POST", "/api/must/m-a/promote", { body: {} });
    assert.equal(noop.status, 200); // already a must (due in 1 day): nothing to change
    assert.equal(fs.readFileSync(file, "utf8"), before);
    const promoted = await call(port, "POST", "/api/must/m-z/promote", { body: {} });
    assert.equal(promoted.status, 200);
    assert.deepEqual(promoted.json.must.map((x) => x.id), ["m-d", "m-a", "m-z"]);
  }, { store: createMustStore({ filePath: file, now: () => NOW }) });
  assert.notEqual(fs.readFileSync(file, "utf8"), before);
});

test("a body that is not valid UTF-8 is rejected and nothing is written", async () => {
  const { file } = makeNote();
  const before = fs.readFileSync(file, "utf8");
  await withServer(async (port) => {
    const status = await new Promise((resolve, reject) => {
      const bytes = Buffer.concat([Buffer.from('{"title":"'), Buffer.from([0xbd, 0xba, 0xb8]), Buffer.from('"}')]);
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/api/must/capture",
          headers: {
            Host: `127.0.0.1:${port}`,
            Origin: `chrome-extension://${EXT_ID}`,
            "Content-Type": "application/json",
            "Content-Length": bytes.length
          }
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        }
      );
      req.on("error", reject);
      req.end(bytes);
    });
    assert.equal(status, 400);
  }, { store: createMustStore({ filePath: file, now: () => NOW }) });
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("missing note and unset store report 503 instead of creating files", async () => {
  const missing = path.join(os.tmpdir(), "must-missing-dir", "must.md");
  await withServer(async (port) => {
    const res = await call(port, "GET", "/api/must");
    assert.equal(res.status, 503);
    assert.equal(res.json.error.code, "FILE_MISSING");
  }, { store: createMustStore({ filePath: missing, now: () => NOW }) });
  assert.equal(fs.existsSync(missing), false);
  await withServer(async (port) => {
    assert.equal((await call(port, "GET", "/api/must")).json.error.code, "NOT_CONFIGURED");
  }, { store: null });
});
