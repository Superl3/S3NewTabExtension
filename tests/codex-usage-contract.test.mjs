import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

import {
  buildCodexSlotMapForContractTest,
  normalizeCodexSnapshotForContractTest
} from "../widgets/codexUsage.js";

const scraperPath = new URL("../content-scripts/codexUsageScraper.js", import.meta.url);

async function loadScraperInternals() {
  const source = await fs.readFile(scraperPath, "utf8");
  const context = {
    chrome: {
      runtime: {
        onMessage: {
          addListener() {}
        }
      },
      storage: {
        local: {
          async set() {}
        }
      }
    },
    document: {},
    window: {
      location: {
        href: "https://chatgpt.com/",
        pathname: "/"
      },
      addEventListener() {}
    },
    MutationObserver: class {
      observe() {}
    },
    setTimeout,
    clearTimeout
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "codexUsageScraper.js" });
  return context;
}

function plain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

test("normalizes codex snapshot and filters non-codex metrics", () => {
  const normalized = normalizeCodexSnapshotForContractTest({
    capturedAt: Date.now(),
    sourceUrl: "https://chatgpt.com/codex/settings/usage",
    title: "Codex Usage",
    metrics: [
      {
        model: "GPT-5.5-Codex",
        period: "fiveHours",
        label: "GPT-5.5-Codex 5시간 사용 한도",
        value: "42% · 남음 · 3시간 뒤 초기화"
      },
      {
        model: "Codex-Spark",
        period: "weekly",
        label: "Codex-Spark weekly usage limit",
        value: "74% · remaining · resets tomorrow"
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
  assert.equal(normalized?.metrics?.length, 2);
  assert.equal(normalized?.metrics?.[0]?.model, "Codex");
  assert.equal(normalized?.metrics?.[1]?.model, "Codex-Spark");
});

test("builds canonical slot map and keeps richer codex metrics", () => {
  const slotMap = buildCodexSlotMapForContractTest([
    {
      model: "GPT-5.5-Codex",
      period: "fiveHours",
      label: "GPT-5.5-Codex 5시간 사용 한도",
      value: "35%"
    },
    {
      model: "Codex",
      period: "fiveHours",
      label: "Codex 5시간 사용 한도",
      value: "35% · 남음 · resets in 3h"
    },
    {
      model: "GPT-5.5-Codex-Spark",
      period: "weekly",
      label: "GPT-5.5-Codex-Spark 주간 사용 한도",
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

test("scraper accepts versioned and unversioned codex model headers", async () => {
  const { parseQuotaHeader } = await loadScraperInternals();

  assert.deepEqual(plain(parseQuotaHeader("GPT-5.5-Codex 5시간 사용 한도")), {
    model: "Codex",
    period: "fiveHours",
    label: "Codex 5시간 사용 한도",
    matchedText: "GPT-5.5-Codex 5시간 사용 한도",
    trailingText: ""
  });

  assert.deepEqual(plain(parseQuotaHeader("Codex-Spark weekly usage limit")), {
    model: "Codex-Spark",
    period: "weekly",
    label: "Codex-Spark 주간 사용 한도",
    matchedText: "Codex-Spark weekly usage limit",
    trailingText: ""
  });

  assert.equal(parseQuotaHeader("GPT-4.1 weekly usage limit"), null);
});
