// File-backed store for the vault must note. Rules live in must-core.mjs.
import fs from "node:fs";
import {
  MustError,
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
  todayInSeoul
} from "./must-core.mjs";

const OPERATIONS = {
  capture: (items, payload, today, random) => opCapture(items, payload ?? {}, today, random),
  promote: (items, payload, today) => opPromote(items, payload?.id, today),
  done: (items, payload, today) => opDone(items, payload?.id, payload ?? {}, today),
  defer: (items, payload, today) => opDefer(items, payload?.id, payload ?? {}, today),
  drop: (items, payload, today) => opDrop(items, payload?.id, payload ?? {}, today),
  split: (items, payload, today, random) => opSplit(items, payload?.id, payload ?? {}, today, random)
};

export function createMustStore({ filePath, now = () => new Date(), random = Math.random, gateDisabled = false } = {}) {
  if (!filePath) {
    throw new MustError("NOT_CONFIGURED", "MUST_FILE이 설정되지 않았다");
  }

  function readRaw() {
    try {
      return { text: fs.readFileSync(filePath, "utf8"), mtimeMs: fs.statSync(filePath).mtimeMs };
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new MustError("FILE_MISSING", "must 노트를 찾을 수 없다");
      }
      throw error;
    }
  }

  function read() {
    const { text } = readRaw();
    return computeState(parseMustText(text).items, todayInSeoul(now()), { gateDisabled });
  }

  function mutate(name, payload) {
    const operation = OPERATIONS[name];
    if (!operation) {
      throw new MustError("BAD_OPERATION", `알 수 없는 동작: ${name}`);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { text, mtimeMs } = readRaw();
      const eol = text.includes("\r\n") ? "\r\n" : "\n";
      const today = todayInSeoul(now());
      const parsed = parseMustText(text);
      const result = operation(parsed.items, payload, today, random);
      let lines = applyItemsToLines(parsed.lines, parsed.items, result.items);
      lines = appendLog(lines, result.log, today);
      const nextText = lines.join(eol);
      if (nextText !== text) {
        // The note is also edited in Obsidian: retry once if it changed while we were computing.
        if (fs.statSync(filePath).mtimeMs !== mtimeMs && attempt === 0) {
          continue;
        }
        fs.writeFileSync(filePath, nextText, "utf8");
      }
      return computeState(parseMustText(nextText).items, today, { gateDisabled });
    }
    throw new MustError("CONFLICT", "노트가 동시에 수정되고 있다. 다시 시도해 달라");
  }

  return { read, mutate };
}
