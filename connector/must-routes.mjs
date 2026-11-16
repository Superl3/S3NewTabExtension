// /api/must/* routes: the new-tab gate and widget read and change the vault must note through these.
import { MustError } from "./must-core.mjs";
import {
  evaluateBridgeRequest,
  readJsonBody,
  sendBridgeError,
  sendBridgeJson,
  sendPreflight
} from "./bridge-http.mjs";

const ACTIONS = new Set(["promote", "done", "defer", "drop", "split"]);
const STATUS_BY_CODE = {
  NOT_FOUND: 404,
  NOT_OPEN: 409,
  CAP_FULL: 409,
  DEFER_LIMIT: 409,
  FILE_MISSING: 503,
  NOT_CONFIGURED: 503,
  CONFLICT: 409
};

export function isMustPath(pathname) {
  return pathname === "/api/must" || pathname.startsWith("/api/must/");
}

export async function handleMustRoute({ req, res, pathname, method, store, guardOptions }) {
  const decision = evaluateBridgeRequest(req, guardOptions);
  if (!decision.ok) {
    sendBridgeError(res, decision.status, decision.code, decision.message);
    return;
  }
  const { origin } = decision;
  if (method === "OPTIONS") {
    sendPreflight(res, origin);
    return;
  }
  if (!store) {
    sendBridgeError(res, 503, "NOT_CONFIGURED", "MUST_FILE이 설정되지 않았다", origin);
    return;
  }

  try {
    if (pathname === "/api/must" && method === "GET") {
      sendBridgeJson(res, 200, store.read(), origin);
      return;
    }
    if (method !== "POST") {
      sendBridgeError(res, 405, "METHOD_NOT_ALLOWED", "허용되지 않은 메서드", origin);
      return;
    }
    const parts = pathname.split("/").filter(Boolean); // ["api","must", ...]
    const body = await readJsonBody(req);
    if (parts.length === 3 && parts[2] === "capture") {
      sendBridgeJson(res, 200, store.mutate("capture", body), origin);
      return;
    }
    if (parts.length === 4 && ACTIONS.has(parts[3])) {
      sendBridgeJson(res, 200, store.mutate(parts[3], { ...body, id: decodeURIComponent(parts[2]) }), origin);
      return;
    }
    sendBridgeError(res, 404, "NOT_FOUND", "알 수 없는 경로", origin);
  } catch (error) {
    if (error instanceof MustError) {
      sendBridgeError(res, STATUS_BY_CODE[error.code] ?? 400, error.code, error.message, origin, error.extra);
      return;
    }
    if (error?.code === "BAD_CONTENT_TYPE" || error?.code === "BAD_JSON" || error?.code === "BODY_TOO_LARGE") {
      sendBridgeError(res, 400, error.code, error.message, origin);
      return;
    }
    sendBridgeError(res, 500, "INTERNAL", "내부 오류", origin);
  }
}
