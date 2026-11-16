import test from "node:test";
import assert from "node:assert/strict";

import { widgetMetadata } from "../widgets/metadata.js";
import { widgetTypeCategoryLabel } from "../core/widget-type-categories.js";
import { FakeDocument, FakeEl, buttonByText, findAll, textOf } from "./helpers/fake-dom.mjs";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function item(overrides = {}) {
  return { id: "m-1", title: "항목", kind: "work", due: "2026-11-17", daysLeft: 1, reason: "", defer: 0, deferLeft: 2, doneWhen: "", first: "", ...overrides };
}

function state(extra = {}) {
  return { today: "2026-11-16", cap: 3, deferLimit: 2, gateOpen: false, must: [], waiting: [], list: [], recent: [], ...extra };
}

async function mount(bridge, config = {}) {
  const previous = globalThis.document;
  const documentObj = new FakeDocument();
  globalThis.document = documentObj;
  try {
    const { mustListWidget } = await import("../widgets/mustList.js");
    const container = new FakeEl("div", documentObj);
    const controller = mustListWidget.create({ container, getConfig: () => config, bridge });
    await flush();
    return { container, controller, documentObj };
  } finally {
    globalThis.document = previous;
  }
}

test("mustList is registered in metadata and the Work category", () => {
  const meta = widgetMetadata.find((entry) => entry.type === "mustList");
  assert.ok(meta);
  assert.deepEqual(meta.defaultConfig, { showRecent: false });
  assert.equal(widgetTypeCategoryLabel("mustList"), "Work");
});

test("renders must / waiting / list sections and the count in the title", async () => {
  const bridge = {
    load: async () => ({
      ok: true,
      state: state({
        must: [item({ id: "m-a", title: "회고", reason: "due-soon" })],
        waiting: [item({ id: "m-w", title: "대기", reason: "due-soon" })],
        list: [item({ id: "m-l", title: "나중", due: "2026-12-30", daysLeft: 44 })]
      })
    })
  };
  const { container, controller } = await mount(bridge);
  const text = textOf(container);
  assert.match(text, /지금 할 것 1\/3 · 대기 1 · 목록 1/);
  assert.match(text, /회고/);
  // rows start folded: no action buttons until a row is opened
  assert.equal(findAll(container, (n) => n.tagName === "BUTTON" && n.textContent === "다 했음").length, 0);
  const previous = globalThis.document;
  globalThis.document = new FakeDocument();
  try {
    findAll(container, (n) => n.dataset?.id === "m-l")[0].children[0].click();
  } finally {
    globalThis.document = previous;
  }
  // only the opened row shows actions, and only list items can be promoted to must
  assert.equal(findAll(container, (n) => n.tagName === "BUTTON" && n.textContent === "다 했음").length, 1);
  assert.equal(findAll(container, (n) => n.tagName === "BUTTON" && n.textContent === "must로").length, 1);
  controller.destroy();
});

test("offline bridge shows how to start the connector and never throws", async () => {
  const { container, controller } = await mount({ load: async () => ({ ok: false, offline: true, error: { code: "OFFLINE" } }) });
  assert.match(textOf(container), /커넥터에 연결되지 않았다/);
  controller.destroy();
});

test("capture sends the title, clears the input and re-renders from the returned state", async () => {
  const calls = [];
  const bridge = {
    load: async () => ({ ok: true, state: state() }),
    capture: async (payload) => {
      calls.push(payload);
      return { ok: true, state: state({ list: [item({ id: "m-n", title: payload.title, due: "2026-11-23", daysLeft: 7 })] }) };
    },
    promote: async () => ({ ok: true, state: state() })
  };
  const { container, controller } = await mount(bridge);
  const form = findAll(container, (n) => n.tagName === "FORM")[0];
  const input = findAll(form, (n) => n.tagName === "INPUT")[0];
  input.value = "  새 할 일  ";
  const previous = globalThis.document;
  globalThis.document = new FakeDocument();
  try {
    form.submit();
    await flush();
  } finally {
    globalThis.document = previous;
  }
  assert.deepEqual(calls, [{ title: "새 할 일" }]);
  assert.equal(input.value, "");
  assert.match(textOf(container), /새 할 일/);
  controller.destroy();
});

test("destroy stops the refresh timer so the tab does not keep polling", async () => {
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const cleared = [];
  globalThis.setInterval = (fn, ms) => ({ fn, ms });
  globalThis.clearInterval = (handle) => cleared.push(handle);
  try {
    const { controller } = await mount({ load: async () => ({ ok: true, state: state() }) });
    controller.destroy();
    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].ms, 60_000);
  } finally {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  }
});
