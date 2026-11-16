// Client for the local connector's /api/must/* routes (the vault must note lives behind it).
// Every call resolves to { ok, state? , offline?, error? }; nothing here throws, so the gate can fail open.

export const MUST_BRIDGE_ORIGIN = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 2500;

export function createMustBridge({ fetchImpl, baseUrl = MUST_BRIDGE_ORIGIN, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);

  async function request(method, path, body) {
    if (!doFetch) {
      return { ok: false, offline: true, error: { code: "NO_FETCH", message: "fetch unavailable" } };
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller?.signal
      });
      let json = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      if (!response.ok) {
        const code = json?.error?.code || `HTTP_${response.status}`;
        // Not configured / note missing means the gate cannot work yet: treat it like offline so it never blocks.
        const unavailable = response.status === 503 || response.status === 403;
        return {
          ok: false,
          offline: unavailable,
          status: response.status,
          error: { code, message: json?.error?.message || `HTTP ${response.status}`, ...(json?.error?.must ? { must: json.error.must } : {}) }
        };
      }
      return { ok: true, state: json };
    } catch (error) {
      return { ok: false, offline: true, error: { code: "OFFLINE", message: String(error?.message || error) } };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  const post = (path, payload = {}) => request("POST", path, payload);
  const itemPath = (id, action) => `/api/must/${encodeURIComponent(id)}/${action}`;

  return {
    load: () => request("GET", "/api/must"),
    capture: (payload) => post("/api/must/capture", payload),
    promote: (id) => post(itemPath(id, "promote")),
    done: (id, payload) => post(itemPath(id, "done"), payload),
    defer: (id, payload) => post(itemPath(id, "defer"), payload),
    drop: (id, payload) => post(itemPath(id, "drop"), payload),
    split: (id, payload) => post(itemPath(id, "split"), payload)
  };
}
