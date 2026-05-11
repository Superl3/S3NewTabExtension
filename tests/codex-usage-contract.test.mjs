import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

import {
  buildCodexSlotMapForContractTest,
  codexUsageWidget,
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

function createTestElement(tagName = "div") {
  const listeners = new Map();
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    dataset: {},
    parentElement: null,
    style: {
      setProperty(name, value) {
        this[name] = value;
      }
    },
    className: "",
    textContent: "",
    type: "",
    title: "",
    disabled: false,
    classList: {
      add(...tokens) {
        const current = new Set(String(element.className || "").split(/\s+/).filter(Boolean));
        for (const token of tokens) {
          current.add(token);
        }
        element.className = Array.from(current).join(" ");
      },
      toggle(token, force) {
        const current = new Set(String(element.className || "").split(/\s+/).filter(Boolean));
        const shouldAdd = force ?? !current.has(token);
        if (shouldAdd) {
          current.add(token);
        } else {
          current.delete(token);
        }
        element.className = Array.from(current).join(" ");
        return shouldAdd;
      }
    },
    append(...children) {
      for (const child of children) {
        child.parentElement = element;
        element.children.push(child);
      }
    },
    replaceChildren(...children) {
      element.children = [];
      element.append(...children);
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
    },
    set innerHTML(value) {
      this._innerHTML = value;
    },
    get innerHTML() {
      return this._innerHTML || "";
    }
  };
  return element;
}

function withGlobal(name, value, callback) {
  const hadValue = Object.prototype.hasOwnProperty.call(globalThis, name);
  const previous = globalThis[name];
  globalThis[name] = value;
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (hadValue) {
        globalThis[name] = previous;
      } else {
        delete globalThis[name];
      }
    });
}

function collectTextContent(node) {
  if (!node) {
    return "";
  }
  return [node.textContent, ...(node.children || []).map((child) => collectTextContent(child))]
    .filter(Boolean)
    .join(" ");
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

  assert.deepEqual(plain(parseQuotaHeader("GPT-5.3-Codex Spark 5시간 사용 한도")), {
    model: "Codex-Spark",
    period: "fiveHours",
    label: "Codex-Spark 5시간 사용 한도",
    matchedText: "GPT-5.3-Codex Spark 5시간 사용 한도",
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

test("scraper extracts all codex usage slots from collapsed page text", async () => {
  const context = await loadScraperInternals();
  const collapsedText = [
    "ChatGPT settings navigation account billing usage page text that should not block parsing",
    "5시간 사용 한도 18% 남음 오후 6:30 초기화",
    "주간 사용 한도 44% 남음 2026. 4. 3. 오전 10:55 초기화",
    "GPT-5.3-Codex-Spark 5시간 사용 한도 7% 남음 오후 7:00 초기화",
    "GPT-5.3-Codex Spark 주간 사용 한도 91% 남음 다음 주 초기화"
  ].join(" ");

  context.document.querySelector = () => null;
  context.document.body = { innerText: collapsedText };

  const lines = context.readMainLines();
  assert.equal(lines.length, 4);

  const items = context.extractQuotaItems(lines);
  assert.equal(items.length, 4);

  const slotMap = buildCodexSlotMapForContractTest(items);
  assert.equal(slotMap.get("codex-5h")?.percent, "18%");
  assert.equal(slotMap.get("codex-weekly")?.resetAt, "2026. 4. 3. 오전 10:55 초기화");
  assert.equal(slotMap.get("spark-5h")?.percent, "7%");
  assert.equal(slotMap.get("spark-weekly")?.percent, "91%");
});

test("codex usage manual refresh triggers a live sync", async () => {
  let sendMessageCalls = 0;
  let resolveStoredSnapshot;
  const staleSnapshot = {
    capturedAt: Date.now() - 60_000,
    sourceUrl: "https://chatgpt.com/codex/settings/usage",
    title: "Codex Usage",
    metrics: [
      {
        model: "Codex",
        period: "fiveHours",
        label: "Codex 5시간 사용 한도",
        percent: "18%",
        status: "남음",
        resetAt: "오후 6:30 초기화",
        value: "18% · 남음 · 오후 6:30 초기화"
      }
    ],
    lines: []
  };
  const snapshot = {
    capturedAt: Date.now(),
    sourceUrl: "https://chatgpt.com/codex/settings/usage",
    title: "Codex Usage",
    metrics: [
      {
        model: "Codex",
        period: "fiveHours",
        label: "Codex 5시간 사용 한도",
        percent: "55%",
        status: "남음",
        resetAt: "오후 7:30 초기화",
        value: "55% · 남음 · 오후 7:30 초기화"
      }
    ],
    lines: []
  };
  const chromeApi = {
    runtime: {
      get lastError() {
        return null;
      }
    },
    storage: {
      local: {
        get() {
          return new Promise((resolve) => {
            resolveStoredSnapshot = () => resolve({ "s3newtab-codex-usage-snapshot-v1": staleSnapshot });
          });
        }
      },
      onChanged: {
        addListener() {},
        removeListener() {}
      }
    },
    tabs: {
      query(_queryInfo, callback) {
        callback([{ id: 7, url: "https://chatgpt.com/codex/settings/usage" }]);
      },
      sendMessage(tabId, message, callback) {
        sendMessageCalls += 1;
        callback({ ok: true, tabId, message, snapshot });
      }
    }
  };
  const documentObj = {
    createElement: createTestElement
  };

  await withGlobal("chrome", chromeApi, () =>
    withGlobal("document", documentObj, async () => {
      const container = createTestElement("div");
      const controller = codexUsageWidget.create({ container, getConfig: () => ({}) });

      await controller.manualRefresh();

      assert.equal(sendMessageCalls, 1);
      assert.match(collectTextContent(container), /55%/);

      resolveStoredSnapshot();
      await Promise.resolve();

      assert.match(collectTextContent(container), /55%/);
      assert.doesNotMatch(collectTextContent(container), /18%/);
    })
  );
});
