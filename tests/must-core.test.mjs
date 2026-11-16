import test from "node:test";
import assert from "node:assert/strict";

import {
  MustError,
  addDays,
  appendLog,
  applyItemsToLines,
  computeState,
  opCapture,
  opDefer,
  opDone,
  opDrop,
  opPromote,
  opSplit,
  parseMustText,
  serializeItem
} from "../connector/must-core.mjs";

const TODAY = "2026-11-16";

function item(overrides = {}) {
  return {
    id: "m-1",
    title: "작업",
    state: "open",
    kind: "work",
    due: "2026-12-30",
    defer: 0,
    tier: "list",
    doneWhen: "",
    first: "",
    created: "2026-11-01",
    closed: "",
    how: "",
    indent: "",
    ...overrides
  };
}

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof MustError && error.code === code);
}

test("parse and serialize keep fields and ignore lines without an id", () => {
  const text = [
    "---",
    "type: note",
    "---",
    "",
    "## 항목",
    "",
    "- [ ] 회고 준비 [id:: m-a] [kind:: work] [due:: 2026-11-17] [defer:: 1] [tier:: must] [done_when:: 타임라인 정리]",
    "- [ ] 손으로 쓴 줄 (id 없음)",
    "- [x] 끝난 일 [id:: m-b] [closed:: 2026-11-10] [how:: 확인]",
    "- [-] 버린 일 [id:: m-c]",
    ""
  ].join("\n");
  const parsed = parseMustText(text);
  assert.equal(parsed.items.length, 3);
  const [a, b, c] = parsed.items;
  assert.deepEqual(
    { id: a.id, title: a.title, kind: a.kind, due: a.due, defer: a.defer, tier: a.tier, doneWhen: a.doneWhen, state: a.state },
    { id: "m-a", title: "회고 준비", kind: "work", due: "2026-11-17", defer: 1, tier: "must", doneWhen: "타임라인 정리", state: "open" }
  );
  assert.equal(b.state, "done");
  assert.equal(b.how, "확인");
  assert.equal(c.state, "dropped");
  assert.equal(serializeItem(a), "- [ ] 회고 준비 [id:: m-a] [kind:: work] [due:: 2026-11-17] [defer:: 1] [tier:: must] [done_when:: 타임라인 정리]");
});

test("serializeItem strips characters that would break the inline fields", () => {
  const line = serializeItem(item({ title: "제목 [id:: x]\n둘째줄", doneWhen: "끝] 조건\n두줄" }));
  const reparsed = parseMustText(line).items;
  assert.equal(reparsed.length, 1);
  assert.equal(reparsed[0].id, "m-1");
  assert.ok(!reparsed[0].title.includes("[id::"));
  assert.equal(reparsed[0].doneWhen, "끝) 조건 두줄");
});

test("computeState: cap 3 by nearest due, waiting overflow, explicit must beats later due", () => {
  const items = [
    item({ id: "a", due: "2026-11-15" }),
    item({ id: "b", due: "2026-11-17" }),
    item({ id: "c", due: "2026-11-19" }),
    item({ id: "d", due: "2026-11-18" }),
    item({ id: "e", due: "2026-12-30", tier: "must" }),
    item({ id: "f", due: "2026-12-31" })
  ];
  const state = computeState(items, TODAY);
  assert.deepEqual(state.must.map((x) => x.id), ["a", "b", "d"]);
  assert.deepEqual(state.waiting.map((x) => x.id), ["c", "e"]);
  assert.deepEqual(state.list.map((x) => x.id), ["f"]);
  assert.equal(state.gateOpen, true);
  assert.equal(state.must[0].reason, "overdue");
  assert.equal(state.must[1].reason, "due-soon");
});

test("computeState: item exactly 3 days away is a must, 4 days is not; gate can be disabled", () => {
  const items = [item({ id: "x", due: addDays(TODAY, 3) }), item({ id: "y", due: addDays(TODAY, 4) })];
  const state = computeState(items, TODAY);
  assert.deepEqual(state.must.map((x) => x.id), ["x"]);
  assert.deepEqual(state.list.map((x) => x.id), ["y"]);
  assert.equal(computeState(items, TODAY, { gateDisabled: true }).gateOpen, false);
  assert.equal(computeState([item({ due: "2027-01-01" })], TODAY).gateOpen, false);
});

test("computeState: item without due gets the default 7-day due and stays out of must", () => {
  const state = computeState([item({ id: "n", due: "" })], TODAY);
  assert.equal(state.list[0].due, "2026-11-23");
  assert.equal(state.must.length, 0);
});

test("capture sets a default due and starts as a list item", () => {
  const out = opCapture([], { title: "새 일" }, TODAY, () => 0.5);
  assert.equal(out.created[0].due, "2026-11-23");
  assert.equal(out.created[0].tier, "list");
  assert.match(out.created[0].id, /^m-261116-[0-9a-z]{4}$/);
  throwsCode(() => opCapture([], { title: "  " }, TODAY), "TITLE_REQUIRED");
  throwsCode(() => opCapture([], { title: "x", due: "2026-13-40" }, TODAY), "BAD_DATE");
});

test("promote respects the cap of 3 and is a no-op for something already a must", () => {
  const full = [
    item({ id: "a", due: "2026-11-16" }),
    item({ id: "b", due: "2026-11-17" }),
    item({ id: "c", due: "2026-11-18" }),
    item({ id: "z", due: "2026-12-30" })
  ];
  assert.throws(
    () => opPromote(full, "z", TODAY),
    (error) => error.code === "CAP_FULL" && error.extra.must.length === 3
  );
  assert.equal(opPromote(full, "a", TODAY).log, "");
  const promoted = opPromote([item({ id: "z", due: "2026-12-30" })], "z", TODAY);
  assert.equal(promoted.items[0].tier, "must");
});

test("defer: counts, demotes to list, limits to 2 and to 7 days ahead", () => {
  const start = [item({ id: "a", tier: "must", due: "2026-11-16" })];
  const first = opDefer(start, "a", { until: "2026-11-18" }, TODAY);
  assert.deepEqual([first.items[0].defer, first.items[0].tier, first.items[0].due], [1, "list", "2026-11-18"]);
  const second = opDefer(first.items, "a", { until: "2026-11-20" }, TODAY);
  assert.equal(second.items[0].defer, 2);
  throwsCode(() => opDefer(second.items, "a", { until: "2026-11-21" }, TODAY), "DEFER_LIMIT");
  throwsCode(() => opDefer(start, "a", { until: TODAY }, TODAY), "BAD_DATE");
  throwsCode(() => opDefer(start, "a", { until: "2026-11-24" }, TODAY), "BAD_DATE");
  throwsCode(() => opDefer(start, "a", { until: "내일" }, TODAY), "BAD_DATE");
});

test("done requires a note for decisions; drop requires a reason for a must", () => {
  const decision = [item({ id: "d", kind: "decision", due: "2026-11-16" })];
  throwsCode(() => opDone(decision, "d", { note: "" }, TODAY), "NOTE_REQUIRED");
  const done = opDone(decision, "d", { note: "fork로 간다" }, TODAY);
  assert.deepEqual([done.items[0].state, done.items[0].closed, done.items[0].how], ["done", TODAY, "fork로 간다"]);

  const must = [item({ id: "m", due: "2026-11-16" })];
  throwsCode(() => opDrop(must, "m", { reason: " " }, TODAY), "REASON_REQUIRED");
  assert.equal(opDrop(must, "m", { reason: "필요 없어짐" }, TODAY).items[0].state, "dropped");
  const listItem = [item({ id: "l", due: "2027-01-01" })];
  assert.equal(opDrop(listItem, "l", {}, TODAY).items[0].state, "dropped");
});

test("split replaces the item with 2-5 children that keep the deadline", () => {
  const start = [item({ id: "p", due: "2026-11-18", kind: "cleanup" })];
  let seq = 0;
  const out = opSplit(start, "p", { parts: ["하나", "둘", " "] }, TODAY, () => (seq += 0.1));
  assert.equal(out.created.length, 2);
  assert.ok(out.created.every((child) => child.due === "2026-11-18" && child.kind === "cleanup"));
  assert.equal(out.items.find((x) => x.id === "p").state, "dropped");
  assert.match(out.items.find((x) => x.id === "p").how, /^split: m-/);
  throwsCode(() => opSplit(start, "p", { parts: ["하나"] }, TODAY), "BAD_PARTS");
  throwsCode(() => opSplit(start, "p", { parts: ["1", "2", "3", "4", "5", "6"] }, TODAY), "BAD_PARTS");
  const overdue = opSplit([item({ id: "o", due: "2026-11-01" })], "o", { parts: ["a", "b"] }, TODAY);
  assert.ok(overdue.created.every((child) => child.due === TODAY));
});

test("operations on missing or closed items fail", () => {
  throwsCode(() => opDone([], "nope", {}, TODAY), "NOT_FOUND");
  throwsCode(() => opDone([item({ state: "done" })], "m-1", {}, TODAY), "NOT_OPEN");
});

test("applyItemsToLines rewrites only item lines and inserts new items under the heading", () => {
  const text = ["# must", "", "메모 한 줄", "", "## 항목", "", "- [ ] 기존 [id:: m-a] [due:: 2026-11-17]", "", "## 기록", ""].join("\n");
  const parsed = parseMustText(text);
  const created = opCapture(parsed.items, { title: "신규" }, TODAY, () => 0.1);
  const lines = applyItemsToLines(parsed.lines, parsed.items, created.items);
  assert.equal(lines[2], "메모 한 줄");
  assert.equal(lines[6].startsWith("- [ ] 기존 [id:: m-a]"), true);
  assert.equal(lines[7].startsWith("- [ ] 신규 [id:: m-"), true);
  const empty = applyItemsToLines(["# must"], [], created.items);
  assert.deepEqual(empty.slice(0, 3), ["# must", "", "## 항목"]);
});

test("appendLog creates the log section once and appends below it", () => {
  const once = appendLog(["# must", ""], "done m-a x", TODAY);
  const twice = appendLog(once, "drop m-b y", TODAY);
  assert.equal(twice.filter((line) => line === "## 기록").length, 1);
  assert.deepEqual(twice.filter((line) => line.startsWith("- 2026")), ["- 2026-11-16 done m-a x", "- 2026-11-16 drop m-b y"]);
  assert.equal(appendLog(["x"], "", TODAY).length, 1);
});

test("regression: a deferred item stays out of the gate until the chosen date, then returns", () => {
  const start = [item({ id: "r", tier: "must", due: "2026-11-17" })];
  const deferred = opDefer(start, "r", { until: "2026-11-17" }, TODAY).items;
  assert.equal(deferred[0].snoozed, "2026-11-17");
  assert.equal(computeState(deferred, TODAY).gateOpen, false, "deferring to tomorrow must release today");
  assert.deepEqual(computeState(deferred, "2026-11-17").must.map((x) => x.id), ["r"], "it is back on the chosen day");
  const reparsed = parseMustText(serializeItem(deferred[0])).items[0];
  assert.equal(reparsed.snoozed, "2026-11-17", "snooze survives the note round trip");
  const promoted = opPromote(deferred, "r", TODAY).items;
  assert.equal(promoted[0].snoozed, "", "promoting by hand clears the snooze");
  assert.deepEqual(computeState(promoted, TODAY).must.map((x) => x.id), ["r"]);
});
