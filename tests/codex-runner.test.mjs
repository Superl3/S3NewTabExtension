import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CodexError,
  buildPrompt,
  createCodexRunner,
  resolveTiers,
  validateChatPayload
} from "../connector/codex-runner.mjs";

const FAKE = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
const MESSAGES = [{ role: "user", content: "안녕" }];

function runnerFor(mode, extra = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-runner-"));
  const runner = createCodexRunner({
    command: process.execPath,
    baseArgs: [FAKE],
    shell: false,
    workDir,
    env: { ...process.env, FAKE_CODEX_MODE: mode },
    timeoutMs: 15000,
    ...extra
  });
  return { runner, workDir };
}

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (error) => error instanceof CodexError && error.code === code);
}

test("a successful turn passes a locked-down command line and the conversation on stdin", async () => {
  const { runner, workDir } = runnerFor("ok");
  const result = await runner.run({ messages: MESSAGES, system: "짧게 답해라", tier: "luna" });
  const seen = JSON.parse(result.text);
  assert.deepEqual({ tier: result.tier, model: result.model, effort: result.effort }, { tier: "luna", model: "gpt-6-luna", effort: "high" });
  for (const flag of ["exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check"]) {
    assert.ok(seen.args.includes(flag), `missing ${flag}`);
  }
  assert.equal(seen.args[seen.args.indexOf("-s") + 1], "read-only");
  assert.equal(seen.args[seen.args.indexOf("-m") + 1], "gpt-6-luna");
  assert.equal(seen.args[seen.args.indexOf("-c") + 1], "model_reasoning_effort=high");
  assert.equal(seen.args[seen.args.indexOf("-C") + 1], workDir);
  assert.equal(seen.args.at(-1), "-");
  assert.match(seen.input, /<system>\n짧게 답해라\n<\/system>/);
  assert.match(seen.input, /User: 안녕/);
  assert.equal(runner.isBusy(), false);
  assert.deepEqual(fs.readdirSync(workDir).filter((name) => name.startsWith("out-")), [], "temp output is removed");
});

test("each tier maps to its own model and effort, and env overrides are validated", async () => {
  const { runner } = runnerFor("ok");
  const terra = JSON.parse((await runner.run({ messages: MESSAGES, tier: "terra" })).text);
  assert.equal(terra.args[terra.args.indexOf("-m") + 1], "gpt-6.1-terra");
  assert.equal(terra.args[terra.args.indexOf("-c") + 1], "model_reasoning_effort=medium");
  const sol = JSON.parse((await runner.run({ messages: MESSAGES, tier: "sol" })).text);
  assert.equal(sol.args[sol.args.indexOf("-c") + 1], "model_reasoning_effort=low");

  const tiers = resolveTiers({ CODEX_MODEL_LUNA: "gpt-7-luna", CODEX_EFFORT_LUNA: "HIGH", CODEX_MODEL_SOL: "bad model; rm -rf", CODEX_EFFORT_TERRA: "turbo" });
  assert.deepEqual(tiers.luna, { model: "gpt-7-luna", effort: "high" });
  assert.deepEqual(tiers.sol, { model: "gpt-6.1-sol", effort: "low" }, "unsafe model name falls back to the default");
  assert.equal(tiers.terra.effort, "medium", "unknown effort falls back to the default");
});

test("failures are translated into actionable codes", async () => {
  await rejectsWith(runnerFor("unsupported").runner.run({ messages: MESSAGES, tier: "terra" }), "MODEL_UNSUPPORTED");
  await rejectsWith(runnerFor("login").runner.run({ messages: MESSAGES }), "NOT_LOGGED_IN");
  await rejectsWith(runnerFor("limit").runner.run({ messages: MESSAGES }), "RATE_LIMITED");
  await rejectsWith(runnerFor("empty").runner.run({ messages: MESSAGES }), "EMPTY_REPLY");
  const failed = await runnerFor("fail").runner.run({ messages: MESSAGES }).catch((error) => error);
  assert.equal(failed.code, "CODEX_FAILED");
  assert.match(failed.message, /exit 3/);
  assert.match(failed.message, /something exploded/);
  await rejectsWith(
    createCodexRunner({ command: "definitely-not-a-codex-binary", shell: false, workDir: fs.mkdtempSync(path.join(os.tmpdir(), "codex-runner-")) }).run({ messages: MESSAGES }),
    "CODEX_MISSING"
  );
});

test("a hung Codex is killed at the timeout and the runner is free again", async () => {
  const { runner } = runnerFor("hang", { timeoutMs: 400 });
  const started = Date.now();
  await rejectsWith(runner.run({ messages: MESSAGES }), "TIMEOUT");
  assert.ok(Date.now() - started < 10000);
  assert.equal(runner.isBusy(), false);
});

test("only one request runs at a time", async () => {
  const { runner } = runnerFor("hang", { timeoutMs: 600 });
  const first = runner.run({ messages: MESSAGES });
  await rejectsWith(runner.run({ messages: MESSAGES }), "BUSY");
  await rejectsWith(first, "TIMEOUT");
});

test("payload validation rejects malformed, oversized and unknown-tier requests before spawning", async () => {
  const bad = (payload, code) => {
    assert.throws(() => validateChatPayload(payload), (error) => error instanceof CodexError && error.code === code);
  };
  bad({}, "BAD_REQUEST");
  bad({ messages: [] }, "BAD_REQUEST");
  bad({ messages: [{ role: "system", content: "x" }] }, "BAD_REQUEST");
  bad({ messages: [{ role: "user", content: "  " }] }, "BAD_REQUEST");
  bad({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }, "BAD_REQUEST");
  bad({ messages: [{ role: "user", content: "x".repeat(24001) }] }, "TOO_LARGE");
  bad({ messages: MESSAGES, system: "x".repeat(4001) }, "TOO_LARGE");
  bad({ messages: MESSAGES, tier: "../../etc" }, "BAD_REQUEST");
  assert.equal(validateChatPayload({ messages: MESSAGES }).tier, "luna");
  const { runner } = runnerFor("ok");
  await rejectsWith(runner.run({ messages: [] }), "BAD_REQUEST");
  assert.equal(runner.isBusy(), false);
});

test("buildPrompt tells the model not to use tools and keeps order", () => {
  const prompt = buildPrompt({
    messages: [
      { role: "user", content: "하나" },
      { role: "assistant", content: "둘" },
      { role: "user", content: "셋" }
    ],
    system: ""
  });
  assert.ok(prompt.indexOf("User: 하나") < prompt.indexOf("Assistant: 둘") && prompt.indexOf("Assistant: 둘") < prompt.indexOf("User: 셋"));
  assert.ok(!prompt.includes("<system>"));
  assert.match(prompt, /do not run commands/);
});
