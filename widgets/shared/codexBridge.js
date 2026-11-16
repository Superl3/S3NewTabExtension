// AI Chat "Codex (local)" mode: one chat turn through the local connector's /api/codex/chat.
// Chats are only ever sent to a loopback origin, whatever the connector URL says.

export const CODEX_DEFAULT_ORIGIN = "http://127.0.0.1:8787";
export const CODEX_TIERS = [
  { value: "luna", label: "luna (high)" },
  { value: "terra", label: "terra (medium)" },
  { value: "sol", label: "sol (low)" }
];
const MAX_TOTAL_CHARS = 20000;
const DEFAULT_TIMEOUT_MS = 130000;

export function codexBridgeOrigin(connectorUrl) {
  try {
    const url = new URL(String(connectorUrl || ""));
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return url.origin;
    }
  } catch {
    // fall through to the default
  }
  return CODEX_DEFAULT_ORIGIN;
}

export function normalizeCodexTier(value) {
  return CODEX_TIERS.some((tier) => tier.value === value) ? value : "luna";
}

export function buildCodexMessages(history, text) {
  const all = [...(Array.isArray(history) ? history : []), { role: "user", content: text }]
    .filter((item) => (item?.role === "user" || item?.role === "assistant") && typeof item.content === "string" && item.content.trim())
    .map((item) => ({ role: item.role, content: item.content }));
  // Keep the newest messages that fit; the last one is always the new user text.
  const kept = [];
  let total = 0;
  for (let index = all.length - 1; index >= 0; index -= 1) {
    total += all[index].content.length;
    if (total > MAX_TOTAL_CHARS && kept.length > 0) {
      break;
    }
    kept.unshift(all[index]);
  }
  while (kept.length > 1 && kept[0].role !== "user") {
    kept.shift();
  }
  return kept;
}

export async function callCodexBridge({ connectorUrl, history, text, systemPrompt, tier, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  if (!doFetch) {
    return { ok: false, code: "NO_FETCH", message: "fetch unavailable" };
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await doFetch(`${codexBridgeOrigin(connectorUrl)}/api/codex/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: buildCodexMessages(history, text),
        system: typeof systemPrompt === "string" ? systemPrompt.slice(0, 4000) : "",
        tier: normalizeCodexTier(tier)
      }),
      signal: controller?.signal
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) {
      return { ok: false, code: json?.error?.code || `HTTP_${response.status}`, message: json?.error?.message || `HTTP ${response.status}` };
    }
    const reply = typeof json?.text === "string" ? json.text.trim() : "";
    if (!reply) {
      return { ok: false, code: "EMPTY_REPLY", message: "Codex가 빈 답을 돌려줬다" };
    }
    return { ok: true, text: reply, model: json.model, effort: json.effort };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "TIMEOUT" : "OFFLINE",
      message: aborted ? "Codex 응답을 기다리다 시간이 지났다" : "커넥터에 연결되지 않았다. node connector/server.mjs 를 실행하고 ALLOWED_EXTENSION_IDS를 설정해야 한다"
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
