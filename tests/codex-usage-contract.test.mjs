import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexSlotMapForContractTest,
  normalizeCodexSnapshotForContractTest
} from "../widgets/codexUsage.js";

test("normalizes codex snapshot and filters non-codex metrics", () => {
  const normalized = normalizeCodexSnapshotForContractTest({
    capturedAt: Date.now(),
    sourceUrl: "https://chatgpt.com/codex/settings/usage",
    title: "Codex Usage",
    metrics: [
      {
        model: "GPT-5.3-Codex",
        period: "fiveHours",
        label: "GPT-5.3-Codex 5시간 사용 한도",
        value: "42% · 남음 · 3시간 뒤 초기화"
      },
      {
        model: "GPT-4.1",
        period: "weekly",
        label: "GPT-4.1 Weekly",
        value: "10%"
      }
    ],
    lines: ["sample line"]
  });

  assert.equal(Boolean(normalized), true);
  assert.equal(normalized?.metrics?.length, 1);
  assert.equal(normalized?.metrics?.[0]?.model, "GPT-5.3-Codex");
});

test("builds canonical slot map and keeps richer codex metrics", () => {
  const slotMap = buildCodexSlotMapForContractTest([
    {
      model: "GPT-5.3-Codex",
      period: "fiveHours",
      label: "GPT-5.3-Codex 5시간 사용 한도",
      value: "35%"
    },
    {
      model: "GPT-5.3-Codex",
      period: "fiveHours",
      label: "GPT-5.3-Codex 5시간 사용 한도",
      value: "35% · 남음 · resets in 3h"
    },
    {
      model: "GPT-5.3-Codex-Spark",
      period: "weekly",
      label: "GPT-5.3-Codex-Spark 주간 사용 한도",
      value: "88% · 남음 · 내일 초기화"
    }
  ]);

  const codexFiveHours = slotMap.get("codex-5h");
  const sparkWeekly = slotMap.get("spark-weekly");

  assert.equal(codexFiveHours?.percent, "35%");
  assert.equal(codexFiveHours?.resetAt.includes("reset"), true);
  assert.equal(sparkWeekly?.percent, "88%");
  assert.equal(sparkWeekly?.status, "남음");
});
