// Runs one chat turn through the local Codex CLI (`codex exec`) so the AI Chat widget can use the
// user's ChatGPT/Codex login without any key in the extension. One request at a time.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_TIERS = Object.freeze({
  luna: { model: "gpt-6-luna", effort: "high" },
  terra: { model: "gpt-6.1-terra", effort: "medium" },
  sol: { model: "gpt-6.1-sol", effort: "low" }
});
export const TIER_NAMES = Object.freeze(Object.keys(DEFAULT_TIERS));
export const MAX_MESSAGES = 50;
export const MAX_TOTAL_CHARS = 24000;
export const MAX_SYSTEM_CHARS = 4000;

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const SAFE_ARG_RE = /^[A-Za-z0-9_.:=\\/-]+$/;
const OUTPUT_CAP = 20000;

export class CodexError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "CodexError";
    this.code = code;
    this.status = status;
  }
}

export function resolveTiers(env = {}) {
  const tiers = {};
  for (const name of TIER_NAMES) {
    const upper = name.toUpperCase();
    const model = String(env[`CODEX_MODEL_${upper}`] ?? "").trim();
    const effort = String(env[`CODEX_EFFORT_${upper}`] ?? "").trim().toLowerCase();
    tiers[name] = {
      model: MODEL_RE.test(model) ? model : DEFAULT_TIERS[name].model,
      effort: EFFORTS.has(effort) ? effort : DEFAULT_TIERS[name].effort
    };
  }
  return tiers;
}

export function validateChatPayload(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new CodexError("BAD_REQUEST", `messages는 1~${MAX_MESSAGES}개여야 한다`, 400);
  }
  let total = 0;
  const cleaned = messages.map((message) => {
    const role = message?.role;
    const content = typeof message?.content === "string" ? message.content : "";
    if ((role !== "user" && role !== "assistant") || !content.trim()) {
      throw new CodexError("BAD_REQUEST", "각 메시지는 role(user|assistant)과 비어 있지 않은 content가 필요하다", 400);
    }
    total += content.length;
    return { role, content };
  });
  if (cleaned[cleaned.length - 1].role !== "user") {
    throw new CodexError("BAD_REQUEST", "마지막 메시지는 user여야 한다", 400);
  }
  if (total > MAX_TOTAL_CHARS) {
    throw new CodexError("TOO_LARGE", `대화가 ${MAX_TOTAL_CHARS}자를 넘는다`, 413);
  }
  const system = typeof body?.system === "string" ? body.system.trim() : "";
  if (system.length > MAX_SYSTEM_CHARS) {
    throw new CodexError("TOO_LARGE", `system이 ${MAX_SYSTEM_CHARS}자를 넘는다`, 413);
  }
  const tier = body?.tier === undefined || body?.tier === "" ? "luna" : body.tier;
  if (!TIER_NAMES.includes(tier)) {
    throw new CodexError("BAD_REQUEST", `tier는 ${TIER_NAMES.join("|")} 중 하나여야 한다`, 400);
  }
  return { messages: cleaned, system, tier };
}

export function buildPrompt({ messages, system }) {
  const lines = [];
  if (system) {
    lines.push("<system>", system, "</system>", "");
  }
  lines.push("Conversation so far:");
  for (const message of messages) {
    lines.push(`${message.role === "user" ? "User" : "Assistant"}: ${message.content}`);
  }
  lines.push(
    "",
    "Reply to the last User message only, in the user's language. You are answering inside a browser new-tab chat widget: do not run commands, read files or edit anything; answer from the conversation and your own knowledge."
  );
  return lines.join("\n");
}

export function classifyFailure({ exitCode, output, timedOut, spawnError }) {
  const text = String(output ?? "").replace(/\x1b\[[0-9;]*m/g, "");
  if (timedOut) {
    return new CodexError("TIMEOUT", "Codex가 제한 시간 안에 답하지 못했다", 504);
  }
  if (spawnError?.code === "ENOENT" || /is not recognized as an internal or external command|command not found/i.test(text)) {
    return new CodexError("CODEX_MISSING", "codex 명령을 찾을 수 없다. Codex CLI를 설치하거나 CODEX_BIN을 설정해야 한다", 503);
  }
  if (/not supported when using Codex|model_not_found/i.test(text)) {
    return new CodexError(
      "MODEL_UNSUPPORTED",
      "이 모델은 설치된 Codex CLI 버전 또는 계정에서 지원되지 않는다. Codex CLI를 업그레이드하거나 CODEX_MODEL_<TIER>를 바꿔야 한다",
      422
    );
  }
  if (/not logged in|log in|login required|unauthorized|\b401\b|refresh token/i.test(text)) {
    return new CodexError("NOT_LOGGED_IN", "Codex 로그인이 필요하다. 터미널에서 codex login 을 실행해야 한다", 401);
  }
  if (/usage limit|rate limit|too many requests|\b429\b/i.test(text)) {
    return new CodexError("RATE_LIMITED", "Codex 사용량 한도에 걸렸다", 429);
  }
  const excerpt = text.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(" ").slice(0, 300);
  return new CodexError("CODEX_FAILED", `Codex 호출 실패 (exit ${exitCode})${excerpt ? `: ${excerpt}` : ""}`, 502);
}

function quoteArg(arg) {
  if (SAFE_ARG_RE.test(arg)) {
    return arg;
  }
  if (/["%^&|<>!\r\n]/.test(arg)) {
    throw new Error("unsafe command argument");
  }
  return `"${arg}"`;
}

function killTree(child) {
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    // already gone
  }
}

export function createCodexRunner({
  command = "codex",
  baseArgs = [],
  shell = process.platform === "win32",
  tiers = resolveTiers({}),
  timeoutMs = 120000,
  workDir = path.join(os.tmpdir(), "s3newtab-codex"),
  spawnImpl = spawn,
  env = process.env
} = {}) {
  let busy = false;

  function buildArgs({ model, effort, outFile }) {
    return [
      ...baseArgs,
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--skip-git-repo-check",
      "-s",
      "read-only",
      "--color",
      "never",
      "-m",
      model,
      "-c",
      `model_reasoning_effort=${effort}`,
      "-C",
      workDir,
      "-o",
      outFile,
      "-"
    ];
  }

  async function run(payload) {
    const { messages, system, tier } = validateChatPayload(payload);
    if (busy) {
      throw new CodexError("BUSY", "이전 요청을 처리 중이다. 끝난 뒤 다시 보내 달라", 429);
    }
    busy = true;
    const outFile = path.join(workDir, `out-${crypto.randomBytes(6).toString("hex")}.txt`);
    const { model, effort } = tiers[tier];
    try {
      fs.mkdirSync(workDir, { recursive: true });
      const args = buildArgs({ model, effort, outFile });
      const started = Date.now();
      const result = await new Promise((resolve) => {
        let output = "";
        let timedOut = false;
        let settled = false;
        const finish = (value) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(value);
          }
        };
        let child;
        try {
          child = shell
            ? spawnImpl([quoteArg(command), ...args.map(quoteArg)].join(" "), { shell: true, cwd: workDir, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
            : spawnImpl(command, args, { cwd: workDir, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        } catch (error) {
          resolve({ spawnError: error, exitCode: -1, output: "", timedOut: false });
          return;
        }
        const timer = setTimeout(() => {
          timedOut = true;
          killTree(child);
        }, timeoutMs);
        const collect = (chunk) => {
          if (output.length < OUTPUT_CAP) {
            output += chunk.toString("utf8");
          }
        };
        child.stdout?.on("data", collect);
        child.stderr?.on("data", collect);
        child.on("error", (error) => finish({ spawnError: error, exitCode: -1, output, timedOut }));
        child.on("close", (exitCode) => finish({ exitCode, output, timedOut }));
        child.stdin?.on("error", () => {});
        child.stdin?.end(buildPrompt({ messages, system }));
      });

      let text = "";
      try {
        text = fs.readFileSync(outFile, "utf8").trim();
      } catch {
        text = "";
      }
      if (result.timedOut || result.spawnError || result.exitCode !== 0 || !text) {
        if (!result.timedOut && !result.spawnError && result.exitCode === 0 && !text) {
          throw new CodexError("EMPTY_REPLY", "Codex가 빈 답을 돌려줬다", 502);
        }
        throw classifyFailure(result);
      }
      return { text, tier, model, effort, ms: Date.now() - started };
    } finally {
      busy = false;
      try {
        fs.rmSync(outFile, { force: true });
      } catch {
        // best effort: the file lives in the runner's own temp folder
      }
    }
  }

  return { run, isBusy: () => busy, tiers };
}
