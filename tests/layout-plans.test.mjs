import test from "node:test";
import assert from "node:assert/strict";

import { LAYOUT_PLANS, planLayout } from "../core/layout-plans.js";

function inst(id, type, page, col, row, colSpan = 1, rowSpan = 1, extra = {}) {
  return { id, type, page, gridLayout: { col, row, colSpan, rowSpan }, dockOrder: null, containerId: "", enabled: true, config: { mine: id }, ...extra };
}

// The board as exported on this machine (types and positions only).
function currentBoard() {
  return [
    inst("clock-100", "clock", 0, 5, 0, 2, 2),
    inst("bookmarks-102", "bookmarks", 0, 3, 4, 6, 4),
    inst("todo-103", "todo", 0, 0, 4, 3, 4),
    inst("shortcut-105", "shortcut", 0, 3, 2),
    inst("shortcut-106", "shortcut", 0, 4, 2),
    inst("shortcut-107", "shortcut", 0, 5, 2),
    inst("shortcut-108", "shortcut", 0, 6, 2),
    inst("shortcut-109", "shortcut", 0, 7, 2),
    inst("shortcut-110", "shortcut", 0, 8, 2),
    inst("mondayAssigned-112", "mondayAssigned", 0, 0, 0, 3, 4),
    inst("clock-114", "clock", 1, 5, 0, 2, 2),
    inst("mondayMeetingNote-120", "mondayMeetingNote", 1, 0, 3, 3, 2),
    inst("gmail-132", "gmail", 1, 0, 0, 3, 3),
    inst("githubReviewInbox-156", "githubReviewInbox", 0, 9, 0, 3, 8),
    inst("weather-159", "weather", 0, 7, 3, 2, 1),
    inst("flexWorktime-160", "flexWorktime", 0, 3, 3, 2, 1),
    inst("dock-shortcut-170", "shortcut", 0, 0, 0, 1, 1, { dockOrder: 0 })
  ];
}

function factory() {
  let nextId = 300;
  return (type, config) => ({ id: `${type}-${nextId++}`, type, page: 9, gridLayout: { col: 0, row: 0, colSpan: 1, rowSpan: 1 }, dockOrder: null, containerId: "", enabled: true, config: { fresh: true, ...config } });
}

function overlaps(list) {
  const seen = new Map();
  for (const item of list) {
    const g = item.gridLayout;
    for (let y = g.row; y < g.row + g.rowSpan; y += 1) {
      for (let x = g.col; x < g.col + g.colSpan; x += 1) {
        const key = `${item.page}:${x}:${y}`;
        if (seen.has(key)) return `${seen.get(key)} and ${item.id} at ${key}`;
        seen.set(key, item.id);
      }
    }
  }
  return "";
}

for (const name of Object.keys(LAYOUT_PLANS)) {
  test(`${name}: plan cells fit the 12x8 grid and never overlap`, () => {
    const cells = LAYOUT_PLANS[name].slots.map((slot, index) => ({ id: `s${index}`, page: 0, gridLayout: slot }));
    for (const { gridLayout: g } of cells) {
      assert.ok(g.col >= 0 && g.row >= 0 && g.col + g.colSpan <= 12 && g.row + g.rowSpan <= 8, JSON.stringify(g));
    }
    assert.equal(overlaps(cells), "");
  });

  test(`${name}: reuses existing widgets with their settings, adds the missing ones, parks the rest without deleting`, () => {
    const before = currentBoard();
    const result = planLayout(before, name, { createInstance: factory() });
    assert.equal(result.instances.length, before.length + 4, "adds mustList, opAssigned, opMeetings, aiChat");
    assert.deepEqual([...result.added].sort(), ["aiChat", "mustList", "opAssigned", "opMeetings"]);
    for (const original of before) {
      const after = result.instances.find((x) => x.id === original.id);
      assert.ok(after, `${original.id} kept`);
      assert.deepEqual(after.config, original.config, `${original.id} settings untouched`);
    }
    const dock = result.instances.find((x) => x.id === "dock-shortcut-170");
    assert.deepEqual(dock.gridLayout, { col: 0, row: 0, colSpan: 1, rowSpan: 1 }, "dock widget not moved");
    const page0 = result.instances.filter((x) => x.page === 0 && x.dockOrder === null);
    assert.deepEqual(
      new Set(page0.map((x) => x.type)),
      new Set(["mustList", "opAssigned", "clock", "weather", "flexWorktime", "opMeetings", "shortcut", "aiChat", "githubReviewInbox"])
    );
    assert.equal(page0.filter((x) => x.type === "shortcut").length, 6);
    assert.equal(result.instances.find((x) => x.id === "clock-100").page, 0, "the first clock stays on the main page");
    for (const parkedId of ["todo-103", "bookmarks-102", "mondayAssigned-112", "gmail-132", "clock-114", "mondayMeetingNote-120"]) {
      assert.ok(result.instances.find((x) => x.id === parkedId).page >= 1, `${parkedId} parked on a later page`);
    }
    assert.equal(overlaps(result.instances.filter((x) => x.dockOrder === null)), "");
    const chat = result.instances.find((x) => x.type === "aiChat");
    assert.equal(chat.config.providerMode, "codex");
    assert.ok(result.pageCount >= 2);
  });
}

test("added counts match: four new widgets on the current board", () => {
  const result = planLayout(currentBoard(), "work", { createInstance: factory() });
  assert.deepEqual([...result.added].sort(), ["aiChat", "mustList", "opAssigned", "opMeetings"]);
});

test("an existing AI Chat keeps its own mode; a type that cannot be created leaves its cell empty", () => {
  const board = [inst("aiChat-50", "aiChat", 1, 0, 0, 3, 3, { config: { providerMode: "chatgpt" } })];
  const result = planLayout(board, "focus", { createInstance: (type) => (type === "mustList" ? null : factory()(type, {})) });
  assert.equal(result.instances.find((x) => x.id === "aiChat-50").config.providerMode, "chatgpt");
  assert.ok(!result.instances.some((x) => x.type === "mustList"));
  assert.throws(() => planLayout(board, "nope", {}), /unknown layout plan/);
});
