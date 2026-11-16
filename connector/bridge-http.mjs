// Shared HTTP guard for connector routes that touch local files or processes.
// Only the allow-listed extension origin may call them; web pages cannot (Origin and Host are checked).
import { normalizeText } from "./redirect-policy.mjs";

const EXTENSION_ORIGIN_RE = /^chrome-extension:\/\/([a-p]{32})$/;
const MAX_BODY_BYTES = 64 * 1024;

export function evaluateBridgeRequest(req, { allowedExtensionIds, port }) {
  if (!(allowedExtensionIds instanceof Set) || allowedExtensionIds.size === 0) {
    return { ok: false, status: 503, code: "NOT_CONFIGURED", message: "ALLOWED_EXTENSION_IDS가 설정되지 않았다" };
  }
  const host = normalizeText(req.headers?.host).toLowerCase();
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (!allowedHosts.has(host)) {
    return { ok: false, status: 403, code: "BAD_HOST", message: "허용되지 않은 Host" };
  }
  const origin = normalizeText(req.headers?.origin);
  const match = EXTENSION_ORIGIN_RE.exec(origin);
  if (!match || !allowedExtensionIds.has(match[1])) {
    return { ok: false, status: 403, code: "BAD_ORIGIN", message: "허용되지 않은 Origin" };
  }
  return { ok: true, origin };
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

export function sendBridgeJson(res, status, data, origin = "") {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(origin ? corsHeaders(origin) : {})
  });
  res.end(JSON.stringify(data));
}

export function sendBridgeError(res, status, code, message, origin = "", extra = {}) {
  sendBridgeJson(res, status, { error: { code, message, ...extra } }, origin);
}

export function sendPreflight(res, origin) {
  res.writeHead(204, corsHeaders(origin));
  res.end();
}

export function readJsonBody(req, { limit = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const type = normalizeText(req.headers?.["content-type"]).toLowerCase();
    if (!type.startsWith("application/json")) {
      reject(Object.assign(new Error("Content-Type must be application/json"), { code: "BAD_CONTENT_TYPE" }));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Body too large"), { code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      let raw;
      try {
        // Strict UTF-8: mojibake must never be written into the vault note.
        raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      } catch {
        reject(Object.assign(new Error("Body is not valid UTF-8"), { code: "BAD_JSON" }));
        return;
      }
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { code: "BAD_JSON" }));
      }
    });
    req.on("error", reject);
  });
}
