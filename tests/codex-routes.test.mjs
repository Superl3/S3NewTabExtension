import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { CodexError } from "../connector/codex-runner.mjs";
import { handleCodexRoute, isCodexPath } from "../connector/codex-routes.mjs";

const EXT_ID = "a".repeat(32);

async function withServer(runner, fn) {
  let port = 0;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://x").pathname;
    if (!isCodexPath(pathname)) {
      res.writeHead(404).end();
      return;
    }
    void handleCodexRoute({ req, res, method: req.method, runner, guardOptions: { allowedExtensionIds: new Set([EXT_ID]), port } });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function call(port, method, { origin = `chrome-extension://${EXT_ID}`, host, body, type = "application/json" } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host ?? `127.0.0.1:${port}` };
    if (origin) {
      headers.Origin = origin;
    }
    const payload = body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body);
    if (payload !== null) {
      headers["Content-Type"] = type;
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request({ host: "127.0.0.1", port, method, path: "/api/codex/chat", headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, json: text ? JSON.parse(text) : null });
      });
    });
    req.on("error", reject);
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

const OK_BODY = { messages: [{ role: "user", content: "hi" }], tier: "luna" };

test("only the allow-listed extension origin can run Codex; others never reach the runner", async () => {
  let runs = 0;
  const runner = { run: async () => { runs += 1; return { text: "x" }; } };
  await withServer(runner, async (port) => {
    assert.equal((await call(port, "POST", { origin: "https://evil.example", body: OK_BODY })).status, 403);
    assert.equal((await call(port, "POST", { origin: "", body: OK_BODY })).status, 403);
    assert.equal((await call(port, "POST", { host: "attacker.example", body: OK_BODY })).status, 403);
    assert.equal((await call(port, "POST", { origin: `chrome-extension://${"b".repeat(32)}`, body: OK_BODY })).status, 403);
    const denied = await call(port, "POST", { origin: "https://evil.example", body: OK_BODY });
    assert.equal(denied.headers["access-control-allow-origin"], undefined);
  });
  assert.equal(runs, 0);
});

test("a good request returns the runner result with CORS for the extension only", async () => {
  const seen = [];
  const runner = { run: async (body) => { seen.push(body); return { text: "답", tier: "luna", model: "gpt-6-luna", effort: "high", ms: 5 }; } };
  await withServer(runner, async (port) => {
    const res = await call(port, "POST", { body: OK_BODY });
    assert.equal(res.status, 200);
    assert.equal(res.json.text, "답");
    assert.equal(res.headers["access-control-allow-origin"], `chrome-extension://${EXT_ID}`);
    assert.equal((await call(port, "OPTIONS")).status, 204);
    assert.equal((await call(port, "GET")).status, 405);
  });
  assert.deepEqual(seen, [OK_BODY]);
});

test("runner errors map to their status and code; non-JSON and bad JSON are 400", async () => {
  const runner = {
    run: async (body) => {
      if (body.messages[0].content === "limit") {
        throw new CodexError("RATE_LIMITED", "한도", 429);
      }
      if (body.messages[0].content === "boom") {
        throw new Error("secret internal detail");
      }
      return { text: "ok" };
    }
  };
  await withServer(runner, async (port) => {
    const limited = await call(port, "POST", { body: { messages: [{ role: "user", content: "limit" }] } });
    assert.deepEqual([limited.status, limited.json.error.code], [429, "RATE_LIMITED"]);
    const boom = await call(port, "POST", { body: { messages: [{ role: "user", content: "boom" }] } });
    assert.equal(boom.status, 500);
    assert.ok(!JSON.stringify(boom.json).includes("secret internal detail"));
    assert.equal((await call(port, "POST", { body: OK_BODY, type: "text/plain" })).json.error.code, "BAD_CONTENT_TYPE");
    assert.equal((await call(port, "POST", { body: "{not json" })).json.error.code, "BAD_JSON");
  });
});

test("with the runner disabled the route answers 503 instead of failing open", async () => {
  await withServer(null, async (port) => {
    const res = await call(port, "POST", { body: OK_BODY });
    assert.deepEqual([res.status, res.json.error.code], [503, "CODEX_DISABLED"]);
  });
});
