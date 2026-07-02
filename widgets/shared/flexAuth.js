import { normalizeText } from "../../core/utils/text.js";

export const FLEX_AUTH_REQUIRED_CODE = "FLEX_AUTH_REQUIRED";
export const FLEX_AUTH_LOGIN_PATH_RE = /^\/auth\/login(?:\/|$)/i;
export const FLEX_AUTH_LOGIN_FALLBACK_RE = /(?:^|[/?#])auth\/login(?:[/?#]|$)/i;
export const FLEX_AUTH_FLOW_PENDING_MESSAGE =
  "Flex login is still in progress on the opened tab (including Google/OAuth redirects). Finish login there, then return and refresh this widget.";

export function createFlexAuthRequiredError(message) {
  const error = new Error(
    normalizeText(message, "Flex login is required. Sign in on Flex, then refresh this widget.")
  );
  error.code = FLEX_AUTH_REQUIRED_CODE;
  return error;
}

export function isFlexAuthRequiredError(error) {
  return normalizeText(error?.code).toUpperCase() === FLEX_AUTH_REQUIRED_CODE;
}

export function isFlexLoginUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }

  try {
    const parsed = new URL(text);
    return FLEX_AUTH_LOGIN_PATH_RE.test(normalizeText(parsed.pathname, "/"));
  } catch {
    return FLEX_AUTH_LOGIN_FALLBACK_RE.test(text);
  }
}
