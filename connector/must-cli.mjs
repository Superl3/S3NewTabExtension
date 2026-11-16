// CLI over the same store the extension bridge uses. Also the SessionStart hook body for Claude Code:
//   node connector/must-cli.mjs session-start --file <must.md> [--marker <date file>]
// session-start prints hook JSON only on the first session of the day while must items are open, and
// never fails: any error means "print nothing, exit 0" so a broken gate cannot break a session.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MustError, todayInSeoul } from "./must-core.mjs";
import { createMustStore } from "./must-store.mjs";

const VALUE_FLAGS = new Set(["file", "marker", "title", "kind", "due", "note", "until", "reason"]);

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  const parts = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (key === "part") {
        parts.push(argv[(index += 1)] ?? "");
      } else if (VALUE_FLAGS.has(key)) {
        flags[key] = argv[(index += 1)] ?? "";
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags, parts };
}

function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function buildSessionContext(state, { cliPath, filePath }) {
  const lines = state.must.map((item, index) => {
    const parts = [`${index + 1}. [${item.kind}] ${item.title}`, `기한 ${item.due.slice(5)} (D${item.daysLeft >= 0 ? "-" : "+"}${Math.abs(item.daysLeft)})`, `미룸 ${item.defer}/${state.deferLimit}`];
    if (item.doneWhen) {
      parts.push(`끝난 조건: ${item.doneWhen}`);
    }
    if (item.first) {
      parts.push(`첫 행동: ${item.first}`);
    }
    parts.push(`id: ${item.id}`);
    return parts.join(" · ");
  });
  const cli = `node "${cliPath}" --file "${filePath}"`;
  return [
    `[must-gate] 오늘 첫 Claude Code 세션이다. 열린 must ${state.must.length}/${state.cap}:`,
    ...lines,
    "",
    "규칙: 사용자의 첫 요청을 시작하기 전에 위 항목마다 '끝냄 · 미루기(새 날짜, 오늘보다 뒤 최대 7일, 남은 횟수 안) · 버리기(이유) · 쪼개기(2~5개)' 중 하나를 사용자에게 먼저 묻고 선언받는다. 선언 전에는 다른 작업을 시작하지 않는다. 사용자가 그 항목을 바로 하자고 하면 그것이 처리이며 끝나면 끝냄으로 기록한다.",
    "선언을 받으면 노트를 직접 편집하지 말고 아래 명령으로 반영한다(결정 항목의 done은 --note 필수, must를 버릴 때는 --reason 필수):",
    `${cli} done <id> --note "한 줄"`,
    `${cli} defer <id> --until YYYY-MM-DD`,
    `${cli} drop <id> --reason "한 줄"`,
    `${cli} split <id> --part "하나" --part "둘"`
  ].join("\n");
}

export function readMarker(markerPath) {
  try {
    return fs.readFileSync(markerPath, "utf8").trim();
  } catch {
    return "";
  }
}

export function writeMarker(markerPath, today) {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `${today}\n`, "utf8");
}

export function sessionStartOutput({ store, markerPath, cliPath, filePath, now = new Date() }) {
  const today = todayInSeoul(now);
  if (markerPath && readMarker(markerPath) === today) {
    return "";
  }
  const state = store.read();
  if (!state.gateOpen) {
    return "";
  }
  const context = buildSessionContext(state, { cliPath, filePath });
  if (markerPath) {
    writeMarker(markerPath, today);
  }
  return asciiJson({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } });
}

function summarize(state) {
  return `OK must ${state.must.length}/${state.cap}, waiting ${state.waiting.length}, list ${state.list.length}, gateOpen ${state.gateOpen}`;
}

export function runCli(argv, { env = process.env, stdout = (text) => process.stdout.write(`${text}\n`), cliPath = "" } = {}) {
  const { positional, flags, parts } = parseArgs(argv);
  const [command, id] = positional;
  const filePath = flags.file || env.MUST_FILE || "";

  if (command === "session-start") {
    try {
      const store = createMustStore({ filePath });
      const output = sessionStartOutput({ store, markerPath: flags.marker || "", cliPath, filePath });
      if (output) {
        stdout(output);
      }
    } catch {
      // silent by design
    }
    return 0;
  }

  try {
    const store = createMustStore({ filePath });
    if (command === "state") {
      stdout(JSON.stringify(store.read(), null, 2));
      return 0;
    }
    const payloadByCommand = {
      capture: { title: flags.title, kind: flags.kind, due: flags.due },
      promote: { id },
      done: { id, note: flags.note },
      defer: { id, until: flags.until },
      drop: { id, reason: flags.reason },
      split: { id, parts }
    };
    if (!(command in payloadByCommand)) {
      stdout("usage: must-cli [--file F] state | capture --title T | promote|done|defer|drop|split <id> [--note|--until|--reason|--part]");
      return 2;
    }
    stdout(summarize(store.mutate(command, payloadByCommand[command])));
    return 0;
  } catch (error) {
    stdout(error instanceof MustError ? `ERROR ${error.code}: ${error.message}` : `ERROR ${error?.message || error}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  process.exitCode = runCli(process.argv.slice(2), { cliPath: path.resolve(process.argv[1]) });
}
