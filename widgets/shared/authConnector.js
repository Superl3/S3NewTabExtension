import { normalizeText } from "../../core/utils/text.js";

function tryParseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

export const LOCAL_AUTH_CONNECTOR_URL = "http://localhost:8787/api/auth/start";

export function normalizeConnectorUrl(value, fallback = "") {
  const text = normalizeText(value, fallback);
  if (!text) {
    return "";
  }

  try {
    const parsed = new URL(text);
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(isLocalhost && parsed.protocol === "http:")) {
      return "";
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function normalizeLocalAuthConnectorUrl(value, fallback = LOCAL_AUTH_CONNECTOR_URL) {
  return normalizeConnectorUrl(value, fallback);
}

export function rewriteAuthorizationLoadError(message) {
  const text = normalizeText(message).toLowerCase();
  if (text.includes("authorization page") && (text.includes("load") || text.includes("not loaded"))) {
    return "Authorization page could not be loaded. Check that connector server is running at http://localhost:8787 and then try Connect again.";
  }
  return message;
}

export function isAuthCancelledMessage(message) {
  const text = normalizeText(message).toLowerCase();
  return (
    text.includes("cancel") ||
    text.includes("canceled") ||
    text.includes("cancelled") ||
    text.includes("did not approve") ||
    text.includes("closed") ||
    text.includes("interaction")
  );
}

export function createAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildAuthConnectorStartUrl(connectorUrl, redirectUri, state, provider = "") {
  const url = new URL(connectorUrl);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (provider) {
    url.searchParams.set("provider", provider);
  }
  return url.toString();
}

export function parseAuthFlowResult(callbackUrl) {
  const parsed = new URL(callbackUrl);
  const hashText = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
  const hashParams = new URLSearchParams(hashText);
  const queryParams = parsed.searchParams;
  const read = (key) => normalizeText(queryParams.get(key) || hashParams.get(key));

  return {
    state: read("state"),
    accessToken: read("access_token") || read("accessToken") || read("token") || read("id_token"),
    accountLabel: read("account") || read("email") || read("user") || read("name"),
    error: read("error"),
    errorDescription: read("error_description")
  };
}

export async function fetchConnectorToken(connectorUrl, provider) {
  const url = new URL(connectorUrl);
  url.searchParams.set("mode", "token");
  url.searchParams.set("provider", provider);
  const response = await fetch(url.toString());
  const text = normalizeText(await response.text());
  const payload = tryParseJson(text);
  if (!response.ok) {
    const message =
      normalizeText(payload?.message) ||
      normalizeText(payload?.error) ||
      normalizeText(payload?.error_description) ||
      `Token relay failed (HTTP ${response.status})`;
    throw new Error(message);
  }
  const token =
    normalizeText(payload?.access_token) ||
    normalizeText(payload?.accessToken) ||
    normalizeText(payload?.token) ||
    normalizeText(payload?.id_token);
  if (!token) {
    throw new Error("Token relay response missing access_token.");
  }
  const accountLabel =
    normalizeText(payload?.account) ||
    normalizeText(payload?.email) ||
    normalizeText(payload?.user) ||
    normalizeText(payload?.name);
  return { accessToken: token, accountLabel };
}
