import { executeScript } from "../core/platform/chrome-scripting.js";

const CODEX_USAGE_URL = "https://chatgpt.com/codex/settings/usage";
const CHATGPT_TAB_MATCH = "https://chatgpt.com/*";
const CODEX_USAGE_STORAGE_KEY = "s3newtab-codex-usage-snapshot-v1";
const CODEX_USAGE_CAPTURE_MESSAGE_TYPE = "S3_CODEX_USAGE_CAPTURE";
const CODEX_USAGE_PATH = "/codex/settings/usage";
const DEFAULT_MODEL_NAME = "GPT-5.3-Codex";
const SLOT_DEFINITIONS = [
  { key: "codex-5h", model: DEFAULT_MODEL_NAME, period: "fiveHours", title: "GPT-5.3-Codex · 5시간" },
  { key: "codex-weekly", model: DEFAULT_MODEL_NAME, period: "weekly", title: "GPT-5.3-Codex · 주간" },
  { key: "spark-5h", model: "GPT-5.3-Codex-Spark", period: "fiveHours", title: "GPT-5.3-Codex-Spark · 5시간" },
  { key: "spark-weekly", model: "GPT-5.3-Codex-Spark", period: "weekly", title: "GPT-5.3-Codex-Spark · 주간" }
];

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeErrorMessage(error, fallback = "Unknown error") {
  if (!error) {
    return fallback;
  }
  if (typeof error === "string") {
    return normalizeText(error, fallback);
  }
  return normalizeText(error?.message, fallback);
}

function normalizeMetric(entry) {
  const label = normalizeText(entry?.label);
  const value = normalizeText(entry?.value);
  if (!label && !value) {
    return null;
  }
  const model = normalizeText(entry?.model, inferModelFromLabel(label));
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
  const text = normalizeText(label);
  if (/spark/i.test(text)) {
    return "GPT-5.3-Codex-Spark";
  }
  return DEFAULT_MODEL_NAME;
}

function inferPeriodFromLabel(label) {
  const text = normalizeText(label);
  return text.includes("주간") || /week|weekly/i.test(text) ? "weekly" : "fiveHours";
}

function extractPercent(text) {
  const match = normalizeText(text).match(/\d{1,3}\s*%/);
  return match ? normalizeText(match[0]) : "";
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
  return value.includes("초기화") || value.includes("갱신") || /reset|resets|next/i.test(value) ? value : "";
}

function isTargetUsageMetric(metric) {
  if (!metric) {
    return false;
  }
  const model = normalizeText(metric.model, inferModelFromLabel(metric.label));
  return /codex/i.test(model);
}

function canonicalMetricSlotKey(metric) {
  const model = normalizeText(metric?.model, inferModelFromLabel(metric?.label)).toLowerCase();
  const period = normalizePeriod(metric?.period, inferPeriodFromLabel(metric?.label));
  const isSpark = model.includes("spark");
  if (isSpark) {
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

  const capturedAt = Number(raw.capturedAt);
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
    parserVersion: Number(raw.parserVersion) || 1
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
    let snapshot = null;

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

      status.textContent = "";
      status.style.display = "none";
    }

    function renderMetrics() {
      metricList.replaceChildren();
      if (!snapshot?.metrics?.length) {
        const empty = document.createElement("li");
        empty.className = "codex-usage-empty";
        empty.textContent = "GPT / GPT-Spark 주간 사용량 항목을 찾지 못했습니다.";
        metricList.append(empty);
        return;
      }

      const slotMap = buildSlotMap(snapshot.metrics);

      for (const slot of SLOT_DEFINITIONS) {
        const metric = slotMap.get(slot.key);

        const item = document.createElement("li");
        item.className = "codex-usage-metric-item";

        const label = document.createElement("span");
        label.className = "codex-usage-metric-label";
        label.textContent = slot.title;

        const value = document.createElement("span");
        value.className = "codex-usage-metric-value";
        value.textContent = metric?.percent || "";

        const details = document.createElement("span");
        details.className = "codex-usage-metric-details";

        const resetChip = document.createElement("span");
        resetChip.className = "codex-usage-metric-reset";
        const resetText = normalizeText(metric?.resetAt);
        resetChip.textContent = resetText;

        if (!resetText) {
          details.style.display = "none";
        }

        details.append(resetChip);

        item.append(label, value, details);
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
        const usageTabs = await queryUsageTabs();
        if (!usageTabs.length) {
          await openUsageTab();
          throw new Error("Usage tab opened. Log in and click Sync again.");
        }

        const targetTab = usageTabs[0];
        const response = await captureUsageFromTab(targetTab.id);
        if (!response?.ok) {
          throw new Error(normalizeText(response?.error, "Capture failed."));
        }

        const liveSnapshot = normalizeSnapshot(response.snapshot);
        if (liveSnapshot) {
          snapshot = liveSnapshot;
        } else {
          const storedSnapshot = await getStoredSnapshot();
          if (!storedSnapshot) {
            throw new Error("Usage snapshot was empty. Refresh the usage page and try Sync again.");
          }
          snapshot = storedSnapshot;
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
      snapshot = normalizeSnapshot(changes[CODEX_USAGE_STORAGE_KEY].newValue);
      if (snapshot) {
        errorMessage = "";
      }
      render();
    };

    openBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openUsagePage();
    });

    syncBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (loading) {
        return;
      }
      void syncSnapshot();
    });

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(storageListener);
    }

    void getStoredSnapshot().then((stored) => {
      snapshot = stored;
      render();
    });

    render();

    return {
      refresh() {
        render();
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
