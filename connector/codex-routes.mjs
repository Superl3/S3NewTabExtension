// POST /api/codex/chat: one chat turn through the local Codex CLI. Same origin guard as /api/must.
import { CodexError } from "./codex-runner.mjs";
import {
  evaluateBridgeRequest,
  readJsonBody,
  logDeniedBridgeRequest,
  sendBridgeError,
  sendBridgeJson,
  sendPreflight
} from "./bridge-http.mjs";

export function isCodexPath(pathname) {
  return pathname === "/api/codex/chat";
}

export async function handleCodexRoute({ req, res, method, runner, guardOptions }) {
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
  if (!runner) {
    sendBridgeError(res, 503, "CODEX_DISABLED", "Codex 채팅이 꺼져 있다 (CODEX_CHAT_DISABLED)", origin);
    return;
  }
  try {
    const body = await readJsonBody(req, { limit: 128 * 1024 });
    sendBridgeJson(res, 200, await runner.run(body), origin);
  } catch (error) {
    if (error instanceof CodexError) {
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
