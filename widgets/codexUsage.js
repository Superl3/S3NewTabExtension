import { executeScript } from "../core/platform/chrome-scripting.js";
import { waitForTabReady } from "../core/platform/chrome-tabs.js";
import { normalizeErrorMessage } from "../core/utils/error.js";
import { toFiniteNumber } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";

const CODEX_USAGE_URL = "https://chatgpt.com/codex/settings/usage";
const CHATGPT_TAB_MATCH = "https://chatgpt.com/*";
const CODEX_USAGE_STORAGE_KEY = "s3newtab-codex-usage-snapshot-v1";
const CODEX_USAGE_CAPTURE_MESSAGE_TYPE = "S3_CODEX_USAGE_CAPTURE";
const CODEX_USAGE_PATH = "/codex/settings/usage";
const CODEX_MODEL_NAME = "Codex";
const CODEX_SPARK_MODEL_NAME = "Codex-Spark";
const SLOT_DEFINITIONS = [
  { key: "codex-5h", period: "fiveHours", title: "Codex · 5시간" },
  { key: "codex-weekly", period: "weekly", title: "Codex · 주간" },
  { key: "spark-5h", period: "fiveHours", title: "Codex-Spark · 5시간" },
  { key: "spark-weekly", period: "weekly", title: "Codex-Spark · 주간" }
];

function normalizeCodexModelName(value, fallback = "") {
  const text = normalizeText(value);
  if (!text) {
    return fallback;
  }
  if (/codex/i.test(text) && /spark/i.test(text)) {
    return CODEX_SPARK_MODEL_NAME;
  }
  if (/codex/i.test(text)) {
    return CODEX_MODEL_NAME;
  }
  return fallback;
}

function normalizeMetric(entry) {
  const label = normalizeText(entry?.label);
  const value = normalizeText(entry?.value);
  if (!label && !value) {
    return null;
  }
  const model = normalizeCodexModelName(entry?.model, inferModelFromLabel(label));
  const period = normalizePeriod(entry?.period, inferPeriodFromLabel(label));
  const percent = normalizeText(entry?.percent, extractPercent(value));
  const status = normalizeText(entry?.status, extractStatus(value));
  const resetAt = normalizeText(entry?.resetAt, extractReset(value));
  const summary = buildUsageSummary({ percent, status, resetAt });

  return {
    model,
    period,
    label: label || `${model} ${period === "weekly" ? "주간" : "5시간"} 사용 한도`,
    value: value || summary,
    percent,
    status,
    resetAt
  };
}

function buildUsageSummary({ percent = "", status = "", resetAt = "" } = {}) {
  return [normalizeText(percent), normalizeText(status), normalizeText(resetAt)].filter(Boolean).join(" · ");
}

function normalizePeriod(value, fallback = "fiveHours") {
  const period = normalizeText(value, fallback).toLowerCase();
  if (period === "weekly" || period === "주간") {
    return "weekly";
  }
  return "fiveHours";
}

function inferModelFromLabel(label) {
  return normalizeCodexModelName(label);
}

function inferPeriodFromLabel(label) {
  const text = normalizeText(label);
  return text.includes("주간") || /week|weekly/i.test(text) ? "weekly" : "fiveHours";
}

function extractPercent(text) {
  const match = normalizeText(text).match(/\d{1,3}\s*%/);
  return match ? normalizeText(match[0]) : "";
}

function parseUsagePercent(value) {
  const match = normalizeText(value).match(/\d{1,3}(?:\.\d+)?\s*%/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0].replace(/\s*%/, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(100, parsed));
}

function extractStatus(text) {
  const value = normalizeText(text);
  if (!value) {
    return "";
  }
  if (value.includes("남음")) {
    return "남음";
  }
  if (value.includes("사용됨")) {
    return "사용됨";
  }
  if (/remaining/i.test(value)) {
    return "remaining";
  }
  if (/used/i.test(value)) {
    return "used";
  }
  return "";
}

function stripUsageValueTokens(text) {
  return normalizeText(
    text
      .replace(/\d{1,3}(?:\.\d+)?\s*%/g, " ")
      .replace(/남음|사용됨/g, " ")
      .replace(/\b(?:remaining|used)\b/gi, " ")
      .replace(/[·•|]+/g, " ")
  );
}

function extractReset(text) {
  const value = normalizeText(text);
  if (!value) {
    return "";
  }
  const parts = value.split("·").map((part) => normalizeText(part)).filter(Boolean);
  for (const part of parts) {
    if (part.includes("초기화") || part.includes("갱신") || /reset|resets|next/i.test(part)) {
      return part;
    }
  }
  return value.includes("초기화") || value.includes("갱신") || /reset|resets|next/i.test(value)
    ? stripUsageValueTokens(value) || value
    : "";
}

function isTargetUsageMetric(metric) {
  if (!metric) {
    return false;
  }
  return Boolean(normalizeCodexModelName(metric.model, inferModelFromLabel(metric.label)));
}

function canonicalMetricSlotKey(metric) {
  const model = normalizeCodexModelName(metric?.model, inferModelFromLabel(metric?.label));
  const period = normalizePeriod(metric?.period, inferPeriodFromLabel(metric?.label));
  if (model === CODEX_SPARK_MODEL_NAME) {
    return period === "weekly" ? "spark-weekly" : "spark-5h";
  }
  return period === "weekly" ? "codex-weekly" : "codex-5h";
}

function buildSlotMap(metrics) {
  function metricScore(metric) {
    let score = 0;
    if (normalizeText(metric?.percent)) {
      score += 2;
    }
    if (normalizeText(metric?.resetAt)) {
      score += 2;
    }
    if (normalizeText(metric?.status)) {
      score += 1;
    }
    return score;
  }

  const map = new Map();
  for (const metric of metrics) {
    if (!isTargetUsageMetric(metric)) {
      continue;
    }
    const slotKey = canonicalMetricSlotKey(metric);
    const existing = map.get(slotKey);
    if (!existing || metricScore(metric) > metricScore(existing)) {
      map.set(slotKey, metric);
    }
  }
  return map;
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const capturedAt = toFiniteNumber(raw.capturedAt, 0);
  const sourceUrl = normalizeText(raw.sourceUrl);
  const title = normalizeText(raw.title, "Codex Usage");
  const metrics = Array.isArray(raw.metrics) ? raw.metrics.map(normalizeMetric).filter(Boolean) : [];
  const lines = Array.isArray(raw.lines)
    ? raw.lines
        .map((line) => normalizeText(line))
        .filter(Boolean)
        .slice(0, 24)
    : [];

  if (!metrics.length && !lines.length) {
    return null;
  }

  return {
    capturedAt: Number.isFinite(capturedAt) && capturedAt > 0 ? Math.round(capturedAt) : 0,
    sourceUrl: sourceUrl || CODEX_USAGE_URL,
    title,
    metrics: metrics.filter(isTargetUsageMetric),
    lines,
    parserVersion: toFiniteNumber(raw.parserVersion, 1) || 1
  };
}

function fromChromeCallback(invoke, fallbackMessage) {
  return new Promise((resolve, reject) => {
    try {
      invoke((result) => {
        const message = normalizeText(chrome.runtime?.lastError?.message);
        if (message) {
          reject(new Error(message));
          return;
        }
        resolve(result);
      });
    } catch (error) {
      reject(new Error(normalizeErrorMessage(error, fallbackMessage)));
    }
  });
}

function canUseTabsApi() {
  return Boolean(chrome?.tabs && typeof chrome.tabs.query === "function" && typeof chrome.tabs.sendMessage === "function");
}

function canNavigateTabsApi() {
  return Boolean(chrome?.tabs && typeof chrome.tabs.update === "function");
}

function canUseScriptingApi() {
  return Boolean(chrome?.scripting && typeof chrome.scripting.executeScript === "function");
}

function isUsagePageUrl(url) {
  const text = normalizeText(url);
  if (!text) {
    return false;
  }

  try {
    const parsed = new URL(text);
    return parsed.hostname === "chatgpt.com" && parsed.pathname.startsWith(CODEX_USAGE_PATH);
  } catch {
    return false;
  }
}

function readTabUrl(tab) {
  return normalizeText(tab?.url || tab?.pendingUrl);
}

async function getStoredSnapshot() {
  try {
    const stored = await chrome.storage.local.get(CODEX_USAGE_STORAGE_KEY);
    return normalizeSnapshot(stored?.[CODEX_USAGE_STORAGE_KEY]);
  } catch {
    return null;
  }
}

async function queryUsageTabs() {
  if (!canUseTabsApi()) {
    return [];
  }
  const tabs = await fromChromeCallback(
    (callback) => chrome.tabs.query({ url: [CHATGPT_TAB_MATCH] }, callback),
    "Unable to query ChatGPT usage tabs."
  );
  const safeTabs = Array.isArray(tabs) ? tabs.filter((tab) => Number.isFinite(tab?.id)) : [];
  return safeTabs.filter((tab) => isUsagePageUrl(readTabUrl(tab)));
}

async function queryChatGptTabs() {
  if (!canUseTabsApi()) {
    return [];
  }
  const tabs = await fromChromeCallback(
    (callback) => chrome.tabs.query({ url: [CHATGPT_TAB_MATCH] }, callback),
    "Unable to query ChatGPT tabs."
  );
  return Array.isArray(tabs) ? tabs.filter((tab) => Number.isFinite(tab?.id)) : [];
}

async function navigateTabToUsage(tabId) {
  if (!canNavigateTabsApi()) {
    throw new Error("Unable to navigate ChatGPT tab to usage page.");
  }
  const tab = await fromChromeCallback(
    (callback) => chrome.tabs.update(tabId, { url: CODEX_USAGE_URL, active: true }, callback),
    "Unable to open ChatGPT usage page in existing tab."
  );
  try {
    await waitForTabReady(tabId, { timeoutMs: 15000 });
  } catch {
    // Some Chrome pages do not emit a reliable completion event after SPA redirects.
  }
  return tab;
}

async function resolveUsageTabForSync() {
  const usageTabs = await queryUsageTabs();
  if (usageTabs.length) {
    return usageTabs[0];
  }

  const chatGptTabs = await queryChatGptTabs();
  if (chatGptTabs.length) {
    const targetTab = chatGptTabs[0];
    await navigateTabToUsage(targetTab.id);
    return { ...targetTab, url: CODEX_USAGE_URL };
  }

  const openedTab = await openUsageTab();
  const tabId = Number(openedTab?.id);
  if (!Number.isFinite(tabId)) {
    throw new Error("Usage page opened. Log in and click Sync again.");
  }
  try {
    await waitForTabReady(tabId, { timeoutMs: 15000 });
  } catch {
    // Keep going; capture will report whether the page is usable.
  }
  return { ...openedTab, id: tabId, url: CODEX_USAGE_URL };
}

async function sendCaptureMessage(tabId) {
  return fromChromeCallback(
    (callback) => chrome.tabs.sendMessage(tabId, { type: CODEX_USAGE_CAPTURE_MESSAGE_TYPE }, callback),
    "Unable to capture usage data from tab."
  );
}

async function injectScraperScript(tabId) {
  if (!canUseScriptingApi()) {
    throw new Error("Scripting API unavailable.");
  }

  await executeScript(
    {
      target: { tabId },
      files: ["content-scripts/codexUsageScraper.js"]
    },
    { fallbackMessage: "Unable to inject usage scraper script." }
  );
}

async function captureUsageFromTab(tabId) {
  try {
    return await sendCaptureMessage(tabId);
  } catch (error) {
    const message = normalizeErrorMessage(error).toLowerCase();
    const shouldInject =
      message.includes("receiving end does not exist") ||
      message.includes("could not establish connection");

    if (!shouldInject) {
      throw error;
    }

    await injectScraperScript(tabId);
    return sendCaptureMessage(tabId);
  }
}

async function openUsageTab() {
  if (!chrome?.tabs || typeof chrome.tabs.create !== "function") {
    window.open(CODEX_USAGE_URL, "_blank", "noopener,noreferrer");
    return null;
  }
  return fromChromeCallback(
    (callback) => chrome.tabs.create({ url: CODEX_USAGE_URL, active: true }, callback),
    "Unable to open ChatGPT usage page."
  );
}

export const codexUsageWidget = {
  type: "codexUsage",
  title: "Codex Usage",
  defaultConfig: {
    openInNewTab: true
  },
  defaultLayout: {
    x: 420,
    y: 260,
    w: 380,
    h: 280
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [{ key: "openInNewTab", label: "Open usage page in new tab", type: "checkbox" }],
  create({ container, getConfig }) {
    container.classList.add("codex-usage-widget");

    const shell = document.createElement("div");
    shell.className = "codex-usage-shell";

    const toolbar = document.createElement("div");
    toolbar.className = "codex-usage-toolbar";

    const actions = document.createElement("div");
    actions.className = "codex-usage-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "btn codex-usage-btn";
    openBtn.innerHTML = '<svg class="icon"><use href="#i-open"></use></svg><span>Open</span>';
    openBtn.title = "Open ChatGPT Codex usage page";

    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "btn codex-usage-btn";
    syncBtn.innerHTML = '<svg class="icon"><use href="#i-reset"></use></svg><span>Sync</span>';
    syncBtn.title = "Sync from open usage tab";

    actions.append(openBtn, syncBtn);

    toolbar.append(actions);

    const metricList = document.createElement("ul");
    metricList.className = "codex-usage-metrics";

    const status = document.createElement("p");
    status.className = "codex-usage-status";
    status.textContent = "No data yet.";

    shell.append(toolbar, metricList, status);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let lastSyncMessage = "";
    let snapshot = null;
    let snapshotVersion = 0;

    function hasUsageMetrics(value) {
      return Boolean(value?.metrics?.length);
    }

    function formatSyncStatus(capturedAt) {
      const date = new Date(toFiniteNumber(capturedAt, Date.now()) || Date.now());
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `Updated ${hours}:${minutes}`;
    }

    function applySnapshot(nextSnapshot, { markUpdated = false } = {}) {
      snapshot = nextSnapshot;
      snapshotVersion += 1;
      if (markUpdated && nextSnapshot) {
        lastSyncMessage = formatSyncStatus(nextSnapshot.capturedAt);
      }
    }

    function renderStatus() {
      status.classList.toggle("is-error", Boolean(errorMessage));
      status.style.display = "block";

      if (loading) {
        status.textContent = "Syncing from ChatGPT usage tab...";
        return;
      }
      if (errorMessage) {
        status.textContent = errorMessage;
        return;
      }
      if (!snapshot) {
        status.textContent = "No data yet. Open usage page then Sync.";
        return;
      }
      if (lastSyncMessage) {
        status.textContent = lastSyncMessage;
        return;
      }

      status.textContent = "";
      status.style.display = "none";
    }

    function renderMetrics() {
      metricList.replaceChildren();
      const hasMetrics = Boolean(snapshot?.metrics?.length);
      metricList.classList.toggle("is-empty", !hasMetrics);

      if (!hasMetrics) {
        const empty = document.createElement("li");
        empty.className = "codex-usage-empty";
        empty.textContent = "No Codex usage metrics captured yet.";
        metricList.append(empty);
        return;
      }

      const slotMap = buildSlotMap(snapshot.metrics);

      for (const slot of SLOT_DEFINITIONS) {
        const metric = slotMap.get(slot.key);

        const item = document.createElement("li");
        item.className = "codex-usage-metric-item";

        const usagePercent = parseUsagePercent(metric?.percent || metric?.value);
        if (usagePercent === null) {
          item.classList.add("is-missing");
        } else {
          item.style.setProperty("--codex-usage-percent", `${usagePercent}%`);
          if (usagePercent >= 85) {
            item.dataset.usageState = "high";
          } else if (usagePercent >= 60) {
            item.dataset.usageState = "medium";
          } else {
            item.dataset.usageState = "low";
          }
        }

        const label = document.createElement("span");
        label.className = "codex-usage-metric-label";
        label.textContent = slot.title;

        const value = document.createElement("span");
        value.className = "codex-usage-metric-value";
        value.textContent = metric?.percent || "Pending";

        const bar = document.createElement("span");
        bar.className = "codex-usage-metric-bar";

        const barFill = document.createElement("span");
        barFill.className = "codex-usage-metric-bar-fill";
        bar.append(barFill);

        const details = document.createElement("span");
        details.className = "codex-usage-metric-details";

        const resetChip = document.createElement("span");
        resetChip.className = "codex-usage-metric-reset";
        const resetText = normalizeText(metric?.resetAt);
        resetChip.textContent = resetText;

        item.classList.toggle("has-details", Boolean(resetText));

        details.append(resetChip);

        item.append(label, value, bar, details);
        metricList.append(item);
      }
    }

    function render() {
      syncBtn.disabled = loading;
      renderStatus();
      renderMetrics();
    }

    async function syncSnapshot() {
      loading = true;
      errorMessage = "";
      render();

      try {
        const targetTab = await resolveUsageTabForSync();
        const response = await captureUsageFromTab(targetTab.id);
        if (!response?.ok) {
          throw new Error(normalizeText(response?.error, "Capture failed."));
        }

        const liveSnapshot = normalizeSnapshot(response.snapshot);
        if (hasUsageMetrics(liveSnapshot)) {
          applySnapshot(liveSnapshot, { markUpdated: true });
        } else {
          const storedSnapshot = await getStoredSnapshot();
          if (!hasUsageMetrics(storedSnapshot)) {
            throw new Error("Usage snapshot was empty. Refresh the usage page and try Sync again.");
          }
          applySnapshot(storedSnapshot, { markUpdated: true });
          errorMessage = "Live snapshot was incomplete. Showing last saved data.";
        }
      } catch (error) {
        if (!errorMessage) {
          errorMessage = normalizeErrorMessage(error, "Could not sync usage data.");
        }
      } finally {
        loading = false;
        render();
      }
    }

    function syncNow() {
      if (loading) {
        return Promise.resolve();
      }
      return syncSnapshot();
    }

    async function openUsagePage() {
      errorMessage = "";
      render();

      const cfg = getConfig?.() || {};
      const openInNewTab = cfg.openInNewTab !== false;

      if (openInNewTab) {
        await openUsageTab();
      } else {
        window.location.href = CODEX_USAGE_URL;
      }
    }

    const storageListener = (changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      if (!changes[CODEX_USAGE_STORAGE_KEY]) {
        return;
      }
      const nextSnapshot = normalizeSnapshot(changes[CODEX_USAGE_STORAGE_KEY].newValue);
      if (hasUsageMetrics(nextSnapshot)) {
        applySnapshot(nextSnapshot, { markUpdated: true });
        errorMessage = "";
      } else if (!snapshot) {
        applySnapshot(nextSnapshot);
      }
      render();
    };

    openBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openUsagePage().catch((error) => {
        errorMessage = normalizeErrorMessage(error, "Could not open usage page.");
        render();
      });
    });

    syncBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void syncNow();
    });

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(storageListener);
    }

    const initialSnapshotVersion = snapshotVersion;
    void getStoredSnapshot().then((stored) => {
      if (snapshotVersion !== initialSnapshotVersion || loading) {
        return;
      }
      applySnapshot(stored);
      render();
    });

    render();

    return {
      refresh() {
        render();
      },
      manualRefresh() {
        return syncNow();
      },
      destroy() {
        if (chrome?.storage?.onChanged) {
          chrome.storage.onChanged.removeListener(storageListener);
        }
      }
    };
  }
};

export function normalizeCodexSnapshotForContractTest(raw) {
  return normalizeSnapshot(raw);
}

export function buildCodexSlotMapForContractTest(metrics) {
  const normalizedMetrics = Array.isArray(metrics) ? metrics.map(normalizeMetric).filter(Boolean) : [];
  return buildSlotMap(normalizedMetrics);
}
