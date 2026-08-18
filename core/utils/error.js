import { normalizeText } from "./text.js";

export function normalizeErrorMessage(error, fallback = "Unknown error") {
  if (!error) {
    return fallback;
  }
  if (typeof error === "string") {
    return normalizeText(error, fallback);
  }
  if (typeof error.message === "string") {
    return normalizeText(error.message, fallback);
  }
  return fallback;
}

export function isAbortError(error) {
  return String(error?.name || "") === "AbortError";
}

/**
 * Translate a request failure into copy a user can act on.
 *
 * Upstream messages (`Failed to fetch`, `Bad credentials`, raw HTML error
 * bodies, multi-sentence rate-limit text) must never reach the UI. Messages that
 * are already actionable pass through unchanged.
 *
 * Returns an empty string for aborted requests, which are cancellations rather
 * than failures and should not be rendered at all.
 */
export function describeRequestError(error, { subject = "This service", hint = "" } = {}) {
  if (isAbortError(error)) {
    return "";
  }

  const raw = normalizeErrorMessage(error, "");
  const trimmedHint = normalizeText(hint);
  const suffix = trimmedHint ? ` ${trimmedHint}` : "";
  const unavailable = `${subject} is not available right now.${suffix}`;

  if (!raw) {
    return unavailable;
  }

  const lower = raw.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return `Cannot reach ${subject}. Check your network connection.`;
  }
  if (lower.includes("bad credentials") || lower.includes("401") || lower.includes("unauthorized")) {
    return `${subject} rejected your credentials. Update the access token in widget settings.`;
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return `${subject} rate limit reached. It will retry automatically.`;
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return `${subject} was not found. Check the widget settings, or your access to it.`;
  }
  if (raw.trimStart().startsWith("<") || lower.includes("<html")) {
    return `${subject} returned an unexpected response. Try again shortly.`;
  }
  if (lower.includes("parse") || lower.includes("unexpected token")) {
    return `${subject} could not be read.${suffix}`;
  }
  if (lower === "unknown error") {
    return unavailable;
  }

  return raw;
}
