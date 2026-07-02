import { normalizeText } from "../../core/utils/text.js";

export const MONDAY_API_URL = "https://api.monday.com/v2";
export const MONDAY_WEB_URL = "https://monday.com/";

function normalizeHostname(value) {
  const text = normalizeText(value).toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!text || text.includes("..") || !text.includes(".")) {
    return "";
  }
  if (!/^[a-z0-9.-]+$/i.test(text)) {
    return "";
  }
  return text;
}

export function parseUrlSafely(rawUrl) {
  const text = normalizeText(rawUrl);
  if (!text) {
    return null;
  }

  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function extractHostFromUrl(rawUrl) {
  const parsed = parseUrlSafely(rawUrl);
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
    return "";
  }
  return normalizeHostname(parsed.hostname);
}

function resolveMondayHostFromAccountLabel(rawValue) {
  const text = normalizeText(rawValue);
  if (!text) {
    return "";
  }

  const directUrlHost = extractHostFromUrl(text);
  if (directUrlHost) {
    return directUrlHost;
  }

  const emailMatch = text.match(/@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (emailMatch?.[1]) {
    return normalizeHostname(emailMatch[1]);
  }

  const hostCandidate = text.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0];
  return normalizeHostname(hostCandidate);
}

function mondaySiteRootFromHost(host) {
  const normalizedHost = normalizeHostname(host);
  if (!normalizedHost) {
    return "";
  }
  return `https://${normalizedHost}/`;
}

export function isMondayAuthFailureMessage(message) {
  const text = normalizeText(message).toLowerCase();
  return (
    text.includes("unauthorized") ||
    text.includes("not authenticated") ||
    text.includes("invalid token") ||
    text.includes("forbidden") ||
    text.includes("access denied")
  );
}

export function resolveMondaySiteUrl(accountLabel, candidateUrls = []) {
  const accountHost = resolveMondayHostFromAccountLabel(accountLabel);
  if (accountHost) {
    return mondaySiteRootFromHost(accountHost);
  }

  for (const candidateUrl of candidateUrls) {
    const candidateHost = extractHostFromUrl(candidateUrl);
    if (candidateHost) {
      return mondaySiteRootFromHost(candidateHost);
    }
  }

  return "";
}

export async function mondayFetchGraphql(accessToken, query, options = {}) {
  const { fetchImpl = fetch, apiUrl = MONDAY_API_URL, apiVersion = "" } = options;
  const headers = {
    Authorization: accessToken,
    "Content-Type": "application/json"
  };

  if (apiVersion) {
    headers["API-Version"] = apiVersion;
  }

  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    cache: "no-store"
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      normalizeText(payload?.errors?.[0]?.message) ||
      normalizeText(payload?.error_message) ||
      `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    if (response.status === 401 || response.status === 403) {
      error.code = "auth";
    }
    throw error;
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Monday API response is empty.");
  }

  if (Array.isArray(payload.errors) && payload.errors.length) {
    const message = normalizeText(payload.errors[0]?.message, "Monday API request failed.");
    const error = new Error(message);
    if (isMondayAuthFailureMessage(message)) {
      error.code = "auth";
    }
    throw error;
  }

  return payload.data || {};
}
