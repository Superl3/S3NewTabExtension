const CODEX_USAGE_STORAGE_KEY = "s3newtab-codex-usage-snapshot-v1";
const CODEX_USAGE_CAPTURE_MESSAGE_TYPE = "S3_CODEX_USAGE_CAPTURE";
const CODEX_USAGE_PATH = "/codex/settings/usage";
const CODEX_MODEL_NAME = "Codex";
const CODEX_SPARK_MODEL_NAME = "Codex-Spark";

function normalizeText(value, fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function matchesUsagePath(pathname) {
  return normalizeText(pathname).startsWith(CODEX_USAGE_PATH);
}

function normalizeModelName(raw, fallback = CODEX_MODEL_NAME) {
  const model = normalizeText(raw);
  if (!model) {
    return fallback;
  }
  if (/codex/i.test(model) && /spark/i.test(model)) {
    return CODEX_SPARK_MODEL_NAME;
  }
  if (/codex/i.test(model)) {
    return CODEX_MODEL_NAME;
  }
  return fallback;
}

function normalizePeriod(raw) {
  const token = normalizeText(raw).toLowerCase();
  if (token === "주간" || token === "weekly" || token === "week") {
    return "weekly";
  }
  return "fiveHours";
}

function getQuotaHeaderRegex(flags = "i") {
  return new RegExp(
    "(?:((?:GPT[\\w.-]*(?:\\s+Codex)?|Codex)(?:[\\s-]*Spark)?)\\s+)?" +
      "((?:5\\s*(?:시간|hours?|h))|(?:주간|weekly))\\s*" +
      "(?:사용\\s*한도|usage\\s*limit)",
    flags
  );
}

function parseQuotaHeader(line) {
  const text = normalizeText(line);
  if (!text) {
    return null;
  }

  const match = text.match(getQuotaHeaderRegex());
  if (!match) {
    return null;
  }

  const prefix = normalizeText(text.slice(0, match.index || 0));
  if (!match[1] && /\bGPT[\w.-]*$/i.test(prefix)) {
    return null;
  }

  const model = normalizeModelName(match[1], match[1] ? "" : CODEX_MODEL_NAME);
  if (!model) {
    return null;
  }
  const period = normalizePeriod(match[2]);

  return {
    model,
    period,
    label: `${model} ${period === "weekly" ? "주간" : "5시간"} 사용 한도`,
    matchedText: normalizeText(match[0]),
    trailingText: normalizeText(text.slice((match.index || 0) + match[0].length))
  };
}

function splitLineAroundQuotaHeaders(line) {
  const text = normalizeText(line);
  if (!text) {
    return [];
  }

  const matches = Array.from(text.matchAll(getQuotaHeaderRegex("gi")));
  if (matches.length <= 1) {
    return [text];
  }

  const segments = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || text.length : text.length;
    const segment = normalizeText(text.slice(start, end));
    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
}

function pickPercent(line) {
  const text = normalizeText(line);
  const match = text.match(/(\d{1,3}\s*%)/);
  return match ? normalizeText(match[1]) : "";
}

function pickStatus(line) {
  const text = normalizeText(line);
  if (!text) {
    return "";
  }
  if (text.includes("남음")) {
    return "남음";
  }
  if (/remaining/i.test(text)) {
    return "remaining";
  }
  if (/used/i.test(text)) {
    return "used";
  }
  return "";
}

function stripUsageValueTokens(line) {
  return normalizeText(
    line
      .replace(/\d{1,3}(?:\.\d+)?\s*%/g, " ")
      .replace(/남음|사용됨/g, " ")
      .replace(/\b(?:remaining|used)\b/gi, " ")
      .replace(/[·•|]+/g, " ")
  );
}

function pickResetAt(line) {
  const text = normalizeText(line);
  if (!text) {
    return "";
  }
  if (text.includes("초기화") || text.includes("갱신") || /reset|resets|next/i.test(text)) {
    return stripUsageValueTokens(text) || text;
  }
  return "";
}

function buildSummaryValue({ percent = "", status = "", resetAt = "" } = {}) {
  return [normalizeText(percent), normalizeText(status), normalizeText(resetAt)].filter(Boolean).join(" · ");
}

function readMainLines() {
  const root = document.querySelector("main") || document.querySelector('[role="main"]') || document.body;
  const rawText = String(root?.innerText || "");
  if (!normalizeText(rawText)) {
    return [];
  }

  const lines = [];
  for (const rawLine of rawText.split(/\n+/)) {
    const line = normalizeText(rawLine);
    if (!line) {
      continue;
    }
    const segments = splitLineAroundQuotaHeaders(line);
    for (const segment of segments) {
      if (!segment || (segment.length > 500 && !parseQuotaHeader(segment))) {
        continue;
      }
      lines.push(segment.slice(0, 500));
    }
  }
  return lines;
}

function extractQuotaItems(lines) {
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = parseQuotaHeader(lines[index]);
    if (!header) {
      continue;
    }

    let nextHeaderIndex = lines.length;
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (parseQuotaHeader(lines[scan])) {
        nextHeaderIndex = scan;
        break;
      }
    }

    let percent = "";
    let status = "";
    let resetAt = "";

    if (header.trailingText) {
      percent = pickPercent(header.trailingText);
      status = pickStatus(header.trailingText);
      resetAt = pickResetAt(header.trailingText);
    }

    for (let scan = index + 1; scan < nextHeaderIndex; scan += 1) {
      const line = lines[scan];

      if (!percent) {
        percent = pickPercent(line);
      }
      if (!status) {
        status = pickStatus(line);
      }
      if (!resetAt) {
        resetAt = pickResetAt(line);
      }
    }

    if (!status && percent) {
      status = "남음";
    }

    items.push({
      model: header.model,
      period: header.period,
      label: header.label,
      percent,
      status,
      resetAt,
      value: buildSummaryValue({ percent, status, resetAt })
    });
  }

  return items;
}

function chooseBetter(current, candidate) {
  const currentScore =
    (normalizeText(current?.percent) ? 2 : 0) +
    (normalizeText(current?.resetAt) ? 2 : 0) +
    (normalizeText(current?.status) ? 1 : 0);
  const candidateScore =
    (normalizeText(candidate?.percent) ? 2 : 0) +
    (normalizeText(candidate?.resetAt) ? 2 : 0) +
    (normalizeText(candidate?.status) ? 1 : 0);
  return candidateScore > currentScore ? candidate : current;
}

function normalizeTargetItems(items) {
  const bySlot = new Map();

  for (const item of items) {
    const model = normalizeModelName(item?.model);
    const period = item?.period === "weekly" ? "weekly" : "fiveHours";
    const slotKey = `${model.toLowerCase()}|${period}`;
    const normalized = {
      model,
      period,
      label: normalizeText(item?.label, `${model} ${period === "weekly" ? "주간" : "5시간"} 사용 한도`),
      percent: normalizeText(item?.percent),
      status: normalizeText(item?.status),
      resetAt: normalizeText(item?.resetAt),
      value: normalizeText(item?.value)
    };

    const existing = bySlot.get(slotKey);
    bySlot.set(slotKey, existing ? chooseBetter(existing, normalized) : normalized);
  }

  return Array.from(bySlot.values());
}

function buildSnapshot() {
  const lines = readMainLines();
  const metrics = normalizeTargetItems(extractQuotaItems(lines));

  return {
    capturedAt: Date.now(),
    sourceUrl: window.location.href,
    title: normalizeText(document.title, "Codex Usage"),
    metrics,
    lines,
    parserVersion: 5
  };
}

async function captureAndStoreUsage() {
  const snapshot = buildSnapshot();
  await chrome.storage.local.set({ [CODEX_USAGE_STORAGE_KEY]: snapshot });
  return snapshot;
}

let captureTimer = null;

function queueCapture(delayMs = 240) {
  if (captureTimer) {
    clearTimeout(captureTimer);
  }
  captureTimer = setTimeout(() => {
    captureTimer = null;
    void captureAndStoreUsage();
  }, delayMs);
}

function bootstrapCaptureFlow() {
  if (!matchesUsagePath(window.location.pathname)) {
    return;
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    queueCapture(40);
  } else {
    window.addEventListener("DOMContentLoaded", () => queueCapture(40), { once: true });
  }

  const observer = new MutationObserver(() => {
    queueCapture(260);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      queueCapture(80);
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== CODEX_USAGE_CAPTURE_MESSAGE_TYPE) {
    return undefined;
  }

  if (!matchesUsagePath(window.location.pathname)) {
    sendResponse({ ok: false, error: "Not on Codex usage page." });
    return undefined;
  }

  captureAndStoreUsage()
    .then((snapshot) => sendResponse({ ok: true, snapshot }))
    .catch((error) => sendResponse({ ok: false, error: normalizeText(error?.message, "Capture failed.") }));

  return true;
});

bootstrapCaptureFlow();
