// POST /api/op/assigned and /api/op/meetings: read-only OpenProject lists for the new-tab widgets.
// POST (not GET) because browsers attach Origin only to POSTs from extension pages, and the guard needs it.
import { OpError } from "./op-client.mjs";
import {
  evaluateBridgeRequest,
  logDeniedBridgeRequest,
  readJsonBody,
  sendBridgeError,
  sendBridgeJson,
  sendPreflight
} from "./bridge-http.mjs";

export function isOpPath(pathname) {
  return pathname === "/api/op/assigned" || pathname === "/api/op/meetings";
}

export async function handleOpRoute({ req, res, pathname, method, client, meetingProjects = [], guardOptions }) {
  const decision = evaluateBridgeRequest(req, guardOptions);
  if (!decision.ok) {
    logDeniedBridgeRequest(req, decision);
    sendBridgeError(res, decision.status, decision.code, decision.message);
    return;
  }
  const { origin } = decision;
  if (method === "OPTIONS") {
    sendPreflight(res, origin);
    return;
  }
  if (method !== "POST") {
    sendBridgeError(res, 405, "METHOD_NOT_ALLOWED", "허용되지 않은 메서드", origin);
    return;
  }
  if (!client) {
    sendBridgeError(res, 503, "NOT_CONFIGURED", "OpenProject 연동이 설정되지 않았다", origin);
    return;
  }
  try {
    const body = await readJsonBody(req);
    if (pathname === "/api/op/assigned") {
      const max = Math.min(50, Math.max(1, Number(body.max) || 20));
      sendBridgeJson(res, 200, await client.getAssigned({ hideResolved: body.hideResolved !== false, hideSamples: body.hideSamples !== false, max }), origin);
      return;
    }
    sendBridgeJson(res, 200, await client.getMeetings({ projects: meetingProjects }), origin);
  } catch (error) {
    if (error instanceof OpError) {
      sendBridgeError(res, error.status, error.code, error.message, origin);
      return;
    }
    if (error?.code === "BAD_CONTENT_TYPE" || error?.code === "BAD_JSON" || error?.code === "BODY_TOO_LARGE") {
      sendBridgeError(res, 400, error.code, error.message, origin);
      return;
    }
    sendBridgeError(res, 500, "INTERNAL", "내부 오류", origin);
  }
}
