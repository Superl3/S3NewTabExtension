import test from "node:test";
import assert from "node:assert/strict";

import {
  CODEX_DEFAULT_ORIGIN,
  buildCodexMessages,
  callCodexBridge,
  codexBridgeOrigin,
  normalizeCodexTier
} from "../widgets/shared/codexBridge.js";
import { widgetMetadata } from "../widgets/metadata.js";
import { FakeDocument, FakeEl, findAll, textOf } from "./helpers/fake-dom.mjs";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("chats go only to a loopback http origin, whatever the connector URL says", () => {
  assert.equal(codexBridgeOrigin("http://localhost:8787/api/auth/start"), "http://localhost:8787");
  assert.equal(codexBridgeOrigin("http://127.0.0.1:9000/x"), "http://127.0.0.1:9000");
  for (const remote of ["https://evil.example/api", "http://evil.example:8787", "https://localhost:8787", "not a url", "", undefined]) {
    assert.equal(codexBridgeOrigin(remote), CODEX_DEFAULT_ORIGIN, String(remote));
  }
  assert.equal(normalizeCodexTier("sol"), "sol");
  assert.equal(normalizeCodexTier("../x"), "luna");
});

test("buildCodexMessages keeps the newest messages that fit and always ends with the new user text", () => {
  const history = [
    { role: "assistant", content: "a".repeat(15000) },
    { role: "user", content: "u".repeat(9000) },
    { role: "assistant", content: "응답" },
    { role: "user", content: "" },
    { role: "tool", content: "ignored" }
  ];
  const messages = buildCodexMessages(history, "새 질문");
  assert.equal(messages.at(-1).content, "새 질문");
  assert.equal(messages[0].role, "user", "never starts on an assistant turn after trimming");
  assert.ok(messages.reduce((sum, m) => sum + m.content.length, 0) <= 20000);
  assert.ok(!messages.some((m) => m.content === "ignored"));
  const huge = buildCodexMessages([], "x".repeat(30000));
  assert.equal(huge.length, 1, "a single oversized message is still sent (the server rejects it with a clear error)");
});

test("callCodexBridge posts the conversation and returns the reply", async () => {
  const calls = [];
  const result = await callCodexBridge({
    connectorUrl: "http://localhost:8787/api/auth/start",
    history: [{ role: "user", content: "앞" }, { role: "assistant", content: "뒤" }],
    text: "지금",
    systemPrompt: "짧게",
    tier: "terra",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, { text: "  답  ", model: "gpt-6.1-terra", effort: "medium" });
    }
  });
  assert.deepEqual(result, { ok: true, text: "답", model: "gpt-6.1-terra", effort: "medium" });
  assert.equal(calls[0].url, "http://localhost:8787/api/codex/chat");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    messages: [{ role: "user", content: "앞" }, { role: "assistant", content: "뒤" }, { role: "user", content: "지금" }],
    system: "짧게",
    tier: "terra"
  });
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
});

test("callCodexBridge turns server, network and timeout failures into readable messages", async () => {
  const server = await callCodexBridge({
    history: [],
    text: "q",
    fetchImpl: async () => jsonResponse(422, { error: { code: "MODEL_UNSUPPORTED", message: "CLI 업그레이드 필요" } })
  });
  assert.deepEqual([server.ok, server.code, server.message], [false, "MODEL_UNSUPPORTED", "CLI 업그레이드 필요"]);
  const offline = await callCodexBridge({ history: [], text: "q", fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  assert.equal(offline.code, "OFFLINE");
  assert.match(offline.message, /connector\/server\.mjs/);
  const timeout = await callCodexBridge({
    history: [],
    text: "q",
    timeoutMs: 20,
    fetchImpl: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("a"), { name: "AbortError" }))))
  });
  assert.equal(timeout.code, "TIMEOUT");
  const empty = await callCodexBridge({ history: [], text: "q", fetchImpl: async () => jsonResponse(200, { text: "  " }) });
  assert.equal(empty.code, "EMPTY_REPLY");
});

test("aiChat metadata offers Codex mode with the three tiers", () => {
  const meta = widgetMetadata.find((entry) => entry.type === "aiChat");
  assert.equal(meta.defaultConfig.codexTier, "luna");
  assert.ok(meta.settingsSchema.find((f) => f.key === "providerMode").options.some((o) => o.value === "codex"));
  assert.deepEqual(meta.settingsSchema.find((f) => f.key === "codexTier").options.map((o) => o.value), ["luna", "terra", "sol"]);
});

test("aiChat in Codex mode sends through the bridge without any Connect or token and records the reply", async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const documentObj = new FakeDocument();
  globalThis.document = documentObj;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return jsonResponse(200, { text: "코덱스 답", model: "gpt-6-luna", effort: "high" });
  };
  try {
    const { aiChatWidget } = await import("../widgets/aiChat.js");
    let config = { ...aiChatWidget.defaultConfig, providerMode: "codex", codexTier: "luna", history: [] };
    const container = new FakeEl("div", documentObj);
    aiChatWidget.create({
      container,
      getConfig: () => config,
      patchConfig: (patch) => {
        config = { ...config, ...patch };
      }
    });
    await flush();
    const form = findAll(container, (n) => n.tagName === "FORM")[0];
    const input = findAll(form, (n) => n.tagName === "INPUT")[0];
    assert.match(textOf(container), /Codex \(local\) · luna \(high\)/);
    input.value = "안녕";
    form.submit();
    await flush();
    await flush();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://localhost:8787/api/codex/chat");
    assert.deepEqual(requests[0].body.messages, [{ role: "user", content: "안녕" }]);
    assert.deepEqual(config.history.map((m) => [m.role, m.content]), [["user", "안녕"], ["assistant", "코덱스 답"]]);
    const buttons = findAll(container, (n) => n.tagName === "BUTTON");
    assert.ok(buttons.filter((b) => b.textContent === "Connect" || b.textContent === "Disconnect").every((b) => b.hidden === true));
  } finally {
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test("aiChat in Codex mode shows the failure reason as the assistant message and ignores a double send while busy", async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const documentObj = new FakeDocument();
  globalThis.document = documentObj;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await gate;
    return jsonResponse(401, { error: { code: "NOT_LOGGED_IN", message: "Codex 로그인이 필요하다" } });
  };
  try {
    const { aiChatWidget } = await import("../widgets/aiChat.js");
    let config = { ...aiChatWidget.defaultConfig, providerMode: "codex", history: [] };
    const container = new FakeEl("div", documentObj);
    aiChatWidget.create({ container, getConfig: () => config, patchConfig: (patch) => (config = { ...config, ...patch }) });
    await flush();
    const form = findAll(container, (n) => n.tagName === "FORM")[0];
    const input = findAll(form, (n) => n.tagName === "INPUT")[0];
    input.value = "첫째";
    form.submit();
    await flush();
    assert.match(textOf(container), /Codex is thinking/);
    input.value = "둘째";
    form.submit();
    await flush();
    release();
    await flush();
    await flush();
    assert.equal(calls, 1, "second send is ignored while the first is running");
    assert.equal(config.history.at(-1).content, "Codex: Codex 로그인이 필요하다");
    assert.doesNotMatch(textOf(container), /Codex is thinking/);
  } finally {
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});
