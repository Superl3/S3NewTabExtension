import { normalizeText } from "../../core/utils/text.js";
import { FLEX_AUTH_LOGIN_PATH_RE, isFlexLoginUrl } from "./flexAuth.js";

const FLEX_HOME_ALLOWED_HOSTS = new Set(["flex.team", "www.flex.team"]);
const FLEX_AUTH_PATH_RE = /^\/auth(?:\/|$)/i;
const FLEX_AUTH_SAME_HOST_PATH_HINT_RE =
  /(?:^|\/)(?:auth|oauth(?:2)?|callback|login|signin|authorize|consent|sso)(?:\/|$)/i;
const FLEX_AUTH_OAUTH_QUERY_KEYS = new Set([
  "code",
  "state",
  "error",
  "error_description",
  "error_uri",
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "prompt",
  "login_hint"
]);
const FLEX_EXTERNAL_AUTH_HOST_EXACT = new Set(["accounts.google.com"]);
const FLEX_EXTERNAL_AUTH_HOST_HINT_RE =
  /(?:^|[.-])(?:oauth|login|signin|sso|idp|okta|onelogin|microsoftonline|auth)(?:[.-]|$)/i;
const FLEX_EXTERNAL_AUTH_PATH_HINT_RE =
  /(?:^|\/)(?:oauth(?:2)?|login|signin|authorize|consent|sso|auth)(?:\/|$)/i;

export function comparablePath(pathname) {
  const path = normalizeText(pathname, "/");
  if (path === "/") {
    return "/";
  }
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isAllowedFlexHomeHost(hostname) {
  return FLEX_HOME_ALLOWED_HOSTS.has(normalizeText(hostname).toLowerCase());
}

export function isAllowedFlexHomePath(pathname) {
  const path = comparablePath(pathname || "/");
  return path === "/home" || path.startsWith("/home/");
}

export function isAllowedFlexLoginPath(pathname) {
  const path = comparablePath(pathname || "/");
  return FLEX_AUTH_LOGIN_PATH_RE.test(path);
}

function hasAuthQueryMarkers(searchParams) {
  if (!searchParams || typeof searchParams.has !== "function") {
    return false;
  }

  for (const key of FLEX_AUTH_OAUTH_QUERY_KEYS) {
    if (searchParams.has(key)) {
      return true;
    }
  }
  return false;
}

function areEquivalentFlexHosts(leftHost, rightHost) {
  const left = normalizeText(leftHost).toLowerCase();
  const right = normalizeText(rightHost).toLowerCase();
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return isAllowedFlexHomeHost(left) && isAllowedFlexHomeHost(right);
}

function isLikelySameHostFlexAuthProgressUrl(tabUrl, targetUrl) {
  const tabHost = normalizeText(tabUrl?.hostname).toLowerCase();
  const targetHost = normalizeText(targetUrl?.hostname).toLowerCase();
  if (!areEquivalentFlexHosts(tabHost, targetHost)) {
    return false;
  }

  const path = comparablePath(tabUrl.pathname || "/");
  if (isAllowedFlexLoginPath(path)) {
    return true;
  }

  if (FLEX_AUTH_PATH_RE.test(path)) {
    return true;
  }

  if (!hasAuthQueryMarkers(tabUrl.searchParams)) {
    return false;
  }

  return path === "/" || isAllowedFlexHomePath(path) || FLEX_AUTH_SAME_HOST_PATH_HINT_RE.test(path);
}

function isLikelyExternalAuthFlowUrl(tabUrl, targetUrl) {
  const tabHost = normalizeText(tabUrl?.hostname).toLowerCase();
  const targetHost = normalizeText(targetUrl?.hostname).toLowerCase();
  if (!tabHost || !targetHost) {
    return false;
  }

  if (areEquivalentFlexHosts(tabHost, targetHost)) {
    return false;
  }

  if (FLEX_EXTERNAL_AUTH_HOST_EXACT.has(tabHost)) {
    return true;
  }

  const path = comparablePath(tabUrl.pathname || "/");
  const hostLooksAuth = FLEX_EXTERNAL_AUTH_HOST_HINT_RE.test(tabHost);
  const pathLooksAuth = FLEX_EXTERNAL_AUTH_PATH_HINT_RE.test(path);
  const queryLooksAuth = hasAuthQueryMarkers(tabUrl.searchParams);

  return (hostLooksAuth && (pathLooksAuth || queryLooksAuth)) || (pathLooksAuth && queryLooksAuth);
}

export function parseAllowedFlexTabUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  if (!isAllowedFlexHomeHost(parsed.hostname)) {
    return null;
  }

  return parsed;
}

export function isLikelyOngoingFlexAuthFlowUrl(tabUrl, targetUrl) {
  if (isFlexLoginUrl(tabUrl)) {
    return true;
  }

  const text = normalizeText(tabUrl);
  if (!text) {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  if (isLikelySameHostFlexAuthProgressUrl(parsed, targetUrl)) {
    return true;
  }

  return isLikelyExternalAuthFlowUrl(parsed, targetUrl);
}

export function parseFlexHomeTargetUrl(value, defaultUrl = "https://flex.team/home") {
  const text = normalizeText(value, defaultUrl);

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("Flex Home URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Flex Home URL must use https.");
  }

  if (!isAllowedFlexHomeHost(parsed.hostname)) {
    throw new Error('Flex Home URL must use host "flex.team" (or "www.flex.team").');
  }

  if (!isAllowedFlexHomePath(parsed.pathname)) {
    throw new Error('Flex Home URL path must be "/home" or start with "/home/".');
  }

  parsed.hash = "";
  return parsed;
}

export function isMatchingFlexHomeTabUrl(tabUrl, targetUrl) {
  const parsed = parseAllowedFlexTabUrl(tabUrl);
  if (!parsed) {
    return false;
  }

  if (!isAllowedFlexHomePath(parsed.pathname)) {
    return false;
  }

  const targetPath = comparablePath(targetUrl.pathname || "/home");
  const tabPath = comparablePath(parsed.pathname || "/");
  return tabPath === targetPath || tabPath.startsWith(`${targetPath}/`);
}

export function isMatchingFlexLoginTabUrl(tabUrl, targetUrl) {
  const parsed = parseAllowedFlexTabUrl(tabUrl);
  if (!parsed) {
    return false;
  }

  const targetHost = normalizeText(targetUrl?.hostname).toLowerCase();
  if (!targetHost || normalizeText(parsed.hostname).toLowerCase() !== targetHost) {
    return false;
  }

  return isAllowedFlexLoginPath(parsed.pathname);
}
