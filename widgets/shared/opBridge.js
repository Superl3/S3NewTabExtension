// OpenProject widgets read through the local connector (the API token never enters the extension).
// POST because extension-page GETs carry no Origin header and the connector authenticates by Origin.

export const OP_BRIDGE_ORIGIN = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 15000;

export async function fetchOpList(path, body = {}, { fetchImpl, baseUrl = OP_BRIDGE_ORIGIN, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  if (!doFetch) {
    return { ok: false, offline: true, message: "fetch unavailable" };
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await doFetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller?.signal
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) {
      return {
        ok: false,
        offline: response.status === 403,
        code: json?.error?.code || `HTTP_${response.status}`,
        message: json?.error?.message || `HTTP ${response.status}`
      };
    }
    return { ok: true, data: json };
  } catch {
    return {
      ok: false,
      offline: true,
      code: "OFFLINE",
      message: "커넥터에 연결되지 않았다. node connector/server.mjs 를 실행해야 한다"
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function dueLabel(due, today) {
  if (!due) {
    return { text: "기한 없음", tone: "muted" };
  }
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days < 0) {
    return { text: `${-days}일 지남 (${due.slice(5)})`, tone: "overdue" };
  }
  if (days === 0) {
    return { text: "오늘 마감", tone: "soon" };
  }
  return { text: `D-${days} (${due.slice(5)})`, tone: days <= 3 ? "soon" : "normal" };
}

export function meetingDateLabel(date, time) {
  if (!date) {
    return "";
  }
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${date.slice(5)} (${weekday}) ${time}`;
}

export function todayInSeoul(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}
