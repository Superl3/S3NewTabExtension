import test from "node:test";
import assert from "node:assert/strict";

import { createMustGateRuntime } from "../core/must-gate/must-gate-runtime.js";
import { describeDue, safeFirstActionHref } from "../core/must-gate/must-gate-view.js";
import { FakeDocument, FakeEl, buttonByText, findAll, textOf } from "./helpers/fake-dom.mjs";

function mustItem(overrides = {}) {
  return {
    id: "m-a",
    title: "회고 준비",
    kind: "work",
    due: "2026-11-17",
    daysLeft: 1,
    reason: "due-soon",
    defer: 0,
    deferLeft: 2,
    doneWhen: "타임라인 정리",
    first: "",
    ...overrides
  };
}

function gateState(must, extra = {}) {
  return { today: "2026-11-16", cap: 3, deferLimit: 2, gateOpen: must.length > 0, must, waiting: [], list: [], recent: [], ...extra };
}

function fakeBridge(initial) {
  const calls = [];
  let next = initial;
  const bridge = {
    calls,
    setNext(value) {
      next = value;
    },
    load: async () => (typeof next === "function" ? next("load") : next),
    done: async (id, payload) => {
      calls.push(["done", id, payload]);
      return typeof next === "function" ? next("done") : next;
    },
    defer: async (id, payload) => {
      calls.push(["defer", id, payload]);
      return typeof next === "function" ? next("defer") : next;
    },
    drop: async (id, payload) => {
      calls.push(["drop", id, payload]);
      return typeof next === "function" ? next("drop") : next;
    },
    split: async (id, payload) => {
      calls.push(["split", id, payload]);
      return typeof next === "function" ? next("split") : next;
    }
  };
  return bridge;
}

function setup(bridge) {
  const documentObj = new FakeDocument();
  const app = new FakeEl("div", documentObj);
  documentObj.body.append(app);
  const runtime = createMustGateRuntime({ documentObj, bridge, appElement: app });
  return { documentObj, app, runtime };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("bridge offline: no gate is drawn and the app stays interactive (fail open)", async () => {
  const { documentObj, app, runtime } = setup(fakeBridge({ ok: false, offline: true, error: { code: "OFFLINE" } }));
  await runtime.start();
  assert.equal(runtime.isOpen(), false);
  assert.equal(findAll(documentObj.body, (n) => n.className === "must-gate").length, 0);
  assert.equal(app.attributes.inert, undefined);
});

test("no open must (or gate disabled): nothing is drawn", async () => {
  const closed = setup(fakeBridge({ ok: true, state: gateState([]) }));
  await closed.runtime.start();
  assert.equal(closed.runtime.isOpen(), false);
  const disabled = setup(fakeBridge({ ok: true, state: gateState([mustItem()], { gateOpen: false, gateDisabled: true }) }));
  await disabled.runtime.start();
  assert.equal(disabled.runtime.isOpen(), false);
});

test("open must: gate covers the tab, app becomes inert, items and rules are shown", async () => {
  const state = gateState([mustItem(), mustItem({ id: "m-b", title: "결정", kind: "decision", daysLeft: -2, due: "2026-11-14", defer: 2, deferLeft: 0 })], {
    waiting: [mustItem({ id: "m-w", title: "대기 항목" })]
  });
  const { documentObj, app, runtime } = setup(fakeBridge({ ok: true, state }));
  await runtime.start();
  assert.equal(runtime.isOpen(), true);
  assert.equal(app.attributes.inert, "");
  assert.equal(app.attributes["aria-hidden"], "true");
  const text = textOf(documentObj.body);
  assert.match(text, /오늘 끝내야 할 것/);
  assert.match(text, /2\/3/);
  assert.match(text, /회고 준비/);
  assert.match(text, /기한 11-14 \(2일 지남\)/);
  assert.match(text, /미룸 2\/2/);
  assert.match(text, /끝난 조건: 타임라인 정리/);
  assert.match(text, /대기 중: 대기 항목/);
  assert.equal(findAll(documentObj.body, (n) => n.tagName === "BUTTON" && n.textContent === "끝냄").length, 2);
});

test("done flow: form opens, submit sends the note, gate closes and app is released when no must remains", async () => {
  const bridge = fakeBridge({ ok: true, state: gateState([mustItem({ kind: "decision" })]) });
  const { documentObj, app, runtime } = setup(bridge);
  await runtime.start();
  buttonByText(documentObj.body, "끝냄").click();
  const input = findAll(documentObj.body, (n) => n.tagName === "INPUT")[0];
  assert.match(input.placeholder, /필수/);
  input.value = "fork로 간다";
  bridge.setNext({ ok: true, state: gateState([]) });
  buttonByText(documentObj.body, "끝냈다고 확정").click();
  await flush();
  assert.deepEqual(bridge.calls, [["done", "m-a", { note: "fork로 간다" }]]);
  assert.equal(runtime.isOpen(), false);
  assert.equal(app.attributes.inert, undefined);
  assert.equal(findAll(documentObj.body, (n) => n.className === "must-gate").length, 0);
});

test("defer: quick buttons send a date, and with no deferrals left the form only explains why", async () => {
  const bridge = fakeBridge({ ok: true, state: gateState([mustItem()]) });
  const { documentObj, runtime } = setup(bridge);
  await runtime.start();
  buttonByText(documentObj.body, "미루기").click();
  bridge.setNext({ ok: true, state: gateState([mustItem({ defer: 1, deferLeft: 1 })]) });
  buttonByText(documentObj.body, "+3일").click();
  await flush();
  assert.deepEqual(bridge.calls[0], ["defer", "m-a", { until: "2026-11-19" }]);

  const spent = setup(fakeBridge({ ok: true, state: gateState([mustItem({ defer: 2, deferLeft: 0 })]) }));
  await spent.runtime.start();
  buttonByText(spent.documentObj.body, "미루기").click();
  assert.match(textOf(spent.documentObj.body), /횟수를 다 썼다/);
  assert.equal(buttonByText(spent.documentObj.body, "+3일"), undefined);
});

test("drop and split send their payloads; split trims blank lines", async () => {
  const bridge = fakeBridge({ ok: true, state: gateState([mustItem()]) });
  const { documentObj, runtime } = setup(bridge);
  await runtime.start();
  buttonByText(documentObj.body, "쪼개기").click();
  findAll(documentObj.body, (n) => n.tagName === "TEXTAREA")[0].value = " 하나 \n\n둘 \n";
  buttonByText(documentObj.body, "쪼개기 확정").click();
  await flush();
  assert.deepEqual(bridge.calls[0], ["split", "m-a", { parts: ["하나", "둘"] }]);
  buttonByText(documentObj.body, "버리기").click();
  findAll(documentObj.body, (n) => n.tagName === "INPUT")[0].value = "필요 없어짐";
  buttonByText(documentObj.body, "버리기 확정").click();
  await flush();
  assert.deepEqual(bridge.calls[1], ["drop", "m-a", { reason: "필요 없어짐" }]);
});

test("a rule error keeps the gate closed-off and shows a readable message", async () => {
  const bridge = fakeBridge({ ok: true, state: gateState([mustItem({ kind: "decision" })]) });
  const { documentObj, app, runtime } = setup(bridge);
  await runtime.start();
  buttonByText(documentObj.body, "끝냄").click();
  bridge.setNext({ ok: false, offline: false, error: { code: "NOTE_REQUIRED", message: "x" } });
  buttonByText(documentObj.body, "끝냈다고 확정").click();
  await flush();
  assert.equal(runtime.isOpen(), true);
  assert.equal(app.attributes.inert, "");
  assert.match(textOf(documentObj.body), /결정 내용 한 줄이 필요하다/);
});

test("a stale item error reloads the current list", async () => {
  let loads = 0;
  const bridge = fakeBridge((kind) => {
    if (kind === "load") {
      loads += 1;
      return { ok: true, state: gateState([mustItem()]) };
    }
    return { ok: false, offline: false, error: { code: "NOT_OPEN", message: "닫힘" } };
  });
  const { documentObj, runtime } = setup(bridge);
  await runtime.start();
  buttonByText(documentObj.body, "끝냄").click();
  buttonByText(documentObj.body, "끝냈다고 확정").click();
  await flush();
  await flush();
  assert.ok(loads >= 2);
});

test("bridge going offline mid-session releases the tab", async () => {
  const bridge = fakeBridge({ ok: true, state: gateState([mustItem()]) });
  const { documentObj, app, runtime } = setup(bridge);
  await runtime.start();
  buttonByText(documentObj.body, "끝냄").click();
  bridge.setNext({ ok: false, offline: true, error: { code: "OFFLINE" } });
  buttonByText(documentObj.body, "끝냈다고 확정").click();
  await flush();
  assert.equal(runtime.isOpen(), false);
  assert.equal(app.attributes.inert, undefined);
});

test("if drawing the gate throws, the tab is released instead of trapped", async () => {
  const bridge = fakeBridge({ ok: true, state: gateState([mustItem()]) });
  const documentObj = new FakeDocument();
  const app = new FakeEl("div", documentObj);
  documentObj.body.append(app);
  documentObj.createElement = () => {
    throw new Error("boom");
  };
  const runtime = createMustGateRuntime({ documentObj, bridge, appElement: app });
  await runtime.start();
  assert.equal(runtime.isOpen(), false);
  assert.equal(app.attributes.inert, undefined);
});

test("becoming visible again re-reads the note; stop() removes the listener and the gate", async () => {
  let must = [];
  const bridge = fakeBridge(() => ({ ok: true, state: gateState(must) }));
  const { documentObj, runtime } = setup(bridge);
  await runtime.start();
  assert.equal(runtime.isOpen(), false);
  must = [mustItem()];
  documentObj.fire("visibilitychange");
  await flush();
  assert.equal(runtime.isOpen(), true);
  runtime.stop();
  assert.equal(runtime.isOpen(), false);
  assert.equal((documentObj.listeners.visibilitychange || []).length, 0);
});

test("first-action link is limited to http(s) and obsidian URLs", () => {
  assert.equal(safeFirstActionHref("https://work.example/work_packages/901"), "https://work.example/work_packages/901");
  assert.equal(safeFirstActionHref("obsidian://open?vault=notes"), "obsidian://open?vault=notes");
  assert.equal(safeFirstActionHref("javascript:alert(1)"), "");
  assert.equal(safeFirstActionHref("file:///C:/Windows"), "");
  assert.equal(safeFirstActionHref("컨트롤러 접속"), "");
  assert.equal(describeDue({ due: "2026-11-16", daysLeft: 0 }), "기한 오늘 (11-16)");
});
