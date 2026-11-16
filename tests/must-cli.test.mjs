import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildSessionContext, parseArgs, runCli, sessionStartOutput } from "../connector/must-cli.mjs";
import { createMustStore } from "../connector/must-store.mjs";

const NOW = new Date("2026-11-16T03:00:00Z");

function setup(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "must-cli-"));
  const file = path.join(dir, "must.md");
  fs.writeFileSync(file, ["# must", "", "## 항목", "", ...lines, "", "## 기록", ""].join("\n"), "utf8");
  return { dir, file, marker: path.join(dir, "state", "marker.txt") };
}

const MUST_LINE = "- [ ] 회고 준비 [id:: m-a] [kind:: work] [due:: 2026-11-17] [defer:: 0] [tier:: must] [done_when:: 발표 준비] [first:: https://example.test/x]";
const LIST_LINE = "- [ ] 나중 [id:: m-z] [kind:: habit] [due:: 2026-12-30] [defer:: 0] [tier:: list]";

test("parseArgs separates flags, repeated --part and positionals", () => {
  const parsed = parseArgs(["--file", "a.md", "split", "m-a", "--part", "하나", "--part", "둘", "--note", "메모"]);
  assert.deepEqual(parsed.positional, ["split", "m-a"]);
  assert.deepEqual(parsed.parts, ["하나", "둘"]);
  assert.equal(parsed.flags.file, "a.md");
  assert.equal(parsed.flags.note, "메모");
});

test("session-start prints ASCII-only hook JSON once per day, then stays silent", () => {
  const { file, marker } = setup([MUST_LINE, LIST_LINE]);
  const store = createMustStore({ filePath: file, now: () => NOW });
  const first = sessionStartOutput({ store, markerPath: marker, cliPath: "C:/x/must-cli.mjs", filePath: file, now: NOW });
  assert.ok(first);
  assert.ok(/^[\x00-\x7f]*$/.test(first), "output must be ASCII so a PS/CP949 host cannot garble it");
  const parsed = JSON.parse(first);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  const context = parsed.hookSpecificOutput.additionalContext;
  assert.match(context, /열린 must 1\/3/);
  assert.match(context, /회고 준비/);
  assert.match(context, /id: m-a/);
  assert.match(context, /다른 작업을 시작하지 않는다/);
  assert.match(context, /--note/);
  assert.equal(fs.readFileSync(marker, "utf8").trim(), "2026-11-16");
  assert.equal(sessionStartOutput({ store, markerPath: marker, cliPath: "x", filePath: file, now: NOW }), "");
  // next day it shows again
  const tomorrow = new Date("2026-11-17T03:00:00Z");
  assert.ok(sessionStartOutput({ store: createMustStore({ filePath: file, now: () => tomorrow }), markerPath: marker, cliPath: "x", filePath: file, now: tomorrow }));
});

test("session-start is silent with no open must, and does not burn the daily marker", () => {
  const { file, marker } = setup([LIST_LINE]);
  const store = createMustStore({ filePath: file, now: () => NOW });
  assert.equal(sessionStartOutput({ store, markerPath: marker, cliPath: "x", filePath: file, now: NOW }), "");
  assert.equal(fs.existsSync(marker), false);
});

test("runCli session-start never fails: missing note, bad path and unset file all exit 0 silently", () => {
  for (const argv of [["session-start", "--file", path.join(os.tmpdir(), "nope", "must.md")], ["session-start"]]) {
    const out = [];
    assert.equal(runCli(argv, { env: {}, stdout: (t) => out.push(t) }), 0);
    assert.deepEqual(out, []);
  }
});

test("runCli applies actions through the same rules and reports rule errors with exit 1", () => {
  const { file } = setup([MUST_LINE, "- [ ] 결정 [id:: m-d] [kind:: decision] [due:: 2026-11-16] [defer:: 0] [tier:: list]"]);
  const run = (argv) => {
    const out = [];
    const code = runCli(["--file", file, ...argv], { env: {}, stdout: (t) => out.push(t) });
    return { code, text: out.join("\n") };
  };
  const noNote = run(["done", "m-d"]);
  assert.equal(noNote.code, 1);
  assert.match(noNote.text, /NOTE_REQUIRED/);
  const done = run(["done", "m-d", "--note", "fork로 간다"]);
  assert.equal(done.code, 0);
  assert.match(done.text, /^OK must 1\/3/);
  assert.match(fs.readFileSync(file, "utf8"), /\[x\] 결정 \[id:: m-d\].*\[how:: fork로 간다\]/);
  const bad = run(["defer", "m-a", "--until", "2027-01-01"]);
  assert.equal(bad.code, 1);
  assert.match(bad.text, /BAD_DATE/);
  assert.equal(run(["explode"]).code, 2);
});

test("buildSessionContext lists overdue items with D+ and the command templates", () => {
  const context = buildSessionContext(
    {
      cap: 3,
      deferLimit: 2,
      must: [{ id: "m-1", kind: "work", title: "지난 일", due: "2026-11-09", daysLeft: -7, defer: 2, doneWhen: "", first: "" }]
    },
    { cliPath: "C:/c/must-cli.mjs", filePath: "C:/v/must.md" }
  );
  assert.match(context, /D\+7/);
  assert.match(context, /미룸 2\/2/);
  assert.match(context, /node "C:\/c\/must-cli.mjs" --file "C:\/v\/must.md" defer <id> --until YYYY-MM-DD/);
});
