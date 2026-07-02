import { normalizeErrorMessage } from "../core/utils/error.js";
import { parseJsonOrNull } from "../core/utils/json.js";
import { hasOwn, isPlainObject } from "../core/utils/object.js";
import { normalizeText } from "../core/utils/text.js";
import { executeScript, hasScriptingApi } from "../core/platform/chrome-scripting.js";
import {
  createTab,
  getTabIfExists,
  hasTabsApi,
  queryTabs,
  removeTab,
  updateTab,
  waitForTabReady
} from "../core/platform/chrome-tabs.js";
import {
  formatFlexSourceError,
  formatSyncedLabel,
  normalizeCachedWorktimeRow as normalizeCachedRow,
  normalizeFlexHomeScrapeRow,
  normalizeFlexHomeUrl,
  normalizeFlexRefreshMinutes as normalizeRefreshMinutes,
  normalizeTabId,
  normalizeWorktimeRow,
  sanitizePlaceholderMap,
  toCachedWorktimeRow as toCachedRow,
  toLocalDateKey
} from "./shared/flexWorktimeRows.js";
import { pruneCacheIndex, touchCacheIndex } from "./shared/localStorageCacheIndex.js";

const FLEX_WORKTIME_CACHE_PREFIX = "s3newtab:flex-worktime-cache:v1";
const FLEX_WORKTIME_CACHE_MAX_ENTRIES = 24;
const FLEX_WORKTIME_CACHE_INDEX_KEY = `${FLEX_WORKTIME_CACHE_PREFIX}:__index__`;
const FLEX_WORKTIME_CACHE_INDEX_OPTIONS = {
  prefix: `${FLEX_WORKTIME_CACHE_PREFIX}:`,
  indexKey: FLEX_WORKTIME_CACHE_INDEX_KEY
};
const FLEX_HOME_TAB_LOAD_TIMEOUT_MS = 20000;
const DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES = 1;
const DEFAULT_FLEX_HOME_URL = "https://flex.team/home";
const FLEX_HOME_ALLOWED_HOSTS = new Set(["flex.team", "www.flex.team"]);
const FLEX_AUTH_REQUIRED_CODE = "FLEX_AUTH_REQUIRED";
const FLEX_AUTH_LOGIN_PATH_RE = /^\/auth\/login(?:\/|$)/i;
const FLEX_AUTH_PATH_RE = /^\/auth(?:\/|$)/i;
const FLEX_AUTH_LOGIN_FALLBACK_RE = /(?:^|[/?#])auth\/login(?:[/?#]|$)/i;
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
const FLEX_AUTH_FLOW_PENDING_MESSAGE =
  "Flex login is still in progress on the opened tab (including Google/OAuth redirects). Finish login there, then return and refresh this widget.";

function createFlexAuthRequiredError(message) {
  const error = new Error(
    normalizeText(message, "Flex login is required. Sign in on Flex, then refresh this widget.")
  );
  error.code = FLEX_AUTH_REQUIRED_CODE;
  return error;
}

function isFlexAuthRequiredError(error) {
  return normalizeText(error?.code).toUpperCase() === FLEX_AUTH_REQUIRED_CODE;
}

function isFlexLoginUrl(value) {
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

function formatSourceError(config, error) {
  return formatFlexSourceError("Flex Home scrape", error);
}

function configSignature(config) {
  return [
    normalizeText(config.flexHomeUrl),
    config.openFlexTabIfMissing ? 1 : 0,
    normalizeText(config.detailUrlTemplate),
    config.openInNewTab ? 1 : 0
  ].join("|");
}

function requestSignature(config, queryDate) {
  return `${configSignature(config)}|${normalizeText(queryDate)}`;
}

function flexWorktimeCacheStorageKey(config, queryDate) {
  const encodedSignature = encodeURIComponent(configSignature(config));
  const encodedDate = encodeURIComponent(normalizeText(queryDate));
  return `${FLEX_WORKTIME_CACHE_PREFIX}:${encodedSignature}:${encodedDate}`;
}

function readCachedSnapshot(config, queryDate) {
  if (typeof localStorage === "undefined") {
    return null;
  }

  const key = flexWorktimeCacheStorageKey(config, queryDate);
  let raw = "";
  try {
    raw = localStorage.getItem(key) || "";
  } catch {
    return null;
  }

  const parsed = parseJsonOrNull(raw);
  if (!isPlainObject(parsed)) {
    return null;
  }

  const fetchedAt = Number(parsed.fetchedAt);
  const rows = Array.isArray(parsed.rows)
    ? parsed.rows.map(normalizeCachedRow).filter(Boolean)
    : [];

  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) {
    return null;
  }

  return {
    fetchedAt: Math.round(fetchedAt),
    rows
  };
}

function pruneCacheEntries(maxEntries = FLEX_WORKTIME_CACHE_MAX_ENTRIES) {
  if (typeof localStorage === "undefined") {
    return;
  }

  pruneCacheIndex(localStorage, {
    ...FLEX_WORKTIME_CACHE_INDEX_OPTIONS,
    maxEntries
  });
}

function writeCachedSnapshot(config, queryDate, rows, fetchedAt = Date.now()) {
  if (typeof localStorage === "undefined") {
    return;
  }

  const key = flexWorktimeCacheStorageKey(config, queryDate);
  const payload = {
    fetchedAt: Math.max(1, Math.round(Number(fetchedAt) || Date.now())),
    rows: Array.isArray(rows) ? rows.map(toCachedRow).filter(Boolean) : []
  };

  try {
    localStorage.setItem(key, JSON.stringify(payload));
    touchCacheIndex(localStorage, {
      ...FLEX_WORKTIME_CACHE_INDEX_OPTIONS,
      key,
      fetchedAt: payload.fetchedAt,
      maxEntries: FLEX_WORKTIME_CACHE_MAX_ENTRIES
    });
  } catch {
    // noop
  }
}

function resolveQueryDateForSource(config) {
  return toLocalDateKey(new Date());
}

function normalizedConfig(config) {
  return {
    flexHomeUrl: normalizeFlexHomeUrl(config?.flexHomeUrl, DEFAULT_FLEX_HOME_URL),
    openFlexTabIfMissing: config?.openFlexTabIfMissing !== false,
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES),
    detailUrlTemplate: normalizeText(config?.detailUrlTemplate),
    openInNewTab: config?.openInNewTab !== false
  };
}

function ensureFlexHomeScrapeApis() {
  if (!hasTabsApi() || !hasScriptingApi()) {
    throw new Error('Flex Home scrape mode requires "tabs" and "scripting" extension permissions.');
  }
}

function comparablePath(pathname) {
  const path = normalizeText(pathname, "/");
  if (path === "/") {
    return "/";
  }
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function isAllowedFlexHomeHost(hostname) {
  return FLEX_HOME_ALLOWED_HOSTS.has(normalizeText(hostname).toLowerCase());
}

function isAllowedFlexHomePath(pathname) {
  const path = comparablePath(pathname || "/");
  return path === "/home" || path.startsWith("/home/");
}

function isAllowedFlexLoginPath(pathname) {
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

function parseAllowedFlexTabUrl(value) {
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

function getReusableScrapeTabId(scrapeFlowState) {
  if (!isPlainObject(scrapeFlowState)) {
    return null;
  }
  return normalizeTabId(scrapeFlowState.reusableTabId);
}

function setReusableScrapeTabId(scrapeFlowState, tabId) {
  if (!isPlainObject(scrapeFlowState)) {
    return;
  }
  scrapeFlowState.reusableTabId = normalizeTabId(tabId);
}

function isLikelyOngoingFlexAuthFlowUrl(tabUrl, targetUrl) {
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

function parseFlexHomeTargetUrl(value) {
  const text = normalizeText(value, DEFAULT_FLEX_HOME_URL);

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

function isMatchingFlexHomeTabUrl(tabUrl, targetUrl) {
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

function isMatchingFlexLoginTabUrl(tabUrl, targetUrl) {
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

function findPreferredFlexTab(tabs, targetUrl) {
  const homeMatch = tabs.find((tab) => isMatchingFlexHomeTabUrl(tab?.url, targetUrl));
  if (homeMatch) {
    return homeMatch;
  }

  return tabs.find((tab) => isMatchingFlexLoginTabUrl(tab?.url, targetUrl)) || null;
}

function executeScriptInTab(tabId, func) {
  return executeScript(
    { target: { tabId }, func },
    { fallbackMessage: "Unable to run script in Flex Home tab." }
  );
}

async function findFlexHomeTab(targetUrl) {
  const activeCurrentWindow = await queryTabs({ active: true, currentWindow: true });
  const activeMatch = findPreferredFlexTab(activeCurrentWindow, targetUrl);
  if (activeMatch) {
    return activeMatch;
  }

  const currentWindowTabs = await queryTabs({ currentWindow: true });
  const currentMatch = findPreferredFlexTab(currentWindowTabs, targetUrl);
  if (currentMatch) {
    return currentMatch;
  }

  const allTabs = await queryTabs({});
  return findPreferredFlexTab(allTabs, targetUrl);
}

async function extractFlexHomeWorktimeFromTab(tabId) {
  const results = await executeScriptInTab(tabId, async () => {
    const AUTH_REQUIRED_CODE = "FLEX_AUTH_REQUIRED";
    const STATUS_PATTERNS = [
      { regex: /근무\s*중|업무\s*중/u, label: "근무중" },
      { regex: /미출근|결근/u, label: "미출근" },
      { regex: /(^|[^미])출근/u, label: "출근" },
      { regex: /퇴근|근무\s*종료|업무\s*종료/u, label: "퇴근" },
      { regex: /휴게|휴식/u, label: "휴게" },
      { regex: /외근/u, label: "외근" },
      { regex: /재택/u, label: "재택" },
      { regex: /근무\s*전/u, label: "근무전" },
      { regex: /휴가/u, label: "휴가" }
    ];
    const DURATION_PATTERN = /(\d+\s*시간\s*\d+\s*분|\d+\s*시간|\d+\s*분)/u;
    const LOGIN_MARKER_GROUPS = [
      ["로그인", "비밀번호"],
      ["로그인", "이메일"],
      ["login", "password"],
      ["sign in", "password"]
    ];
    const WAIT_MS = 7000;
    const INTERVAL_MS = 350;

    function normalizeSpace(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function normalizeDuration(value) {
      const text = normalizeSpace(value);
      if (!text) {
        return "";
      }

      const hourMinute = text.match(/(\d+)\s*시간\s*(\d+)\s*분/u);
      if (hourMinute) {
        return `${Number(hourMinute[1])}시간 ${Number(hourMinute[2])}분`;
      }

      const hourOnly = text.match(/(\d+)\s*시간/u);
      if (hourOnly) {
        return `${Number(hourOnly[1])}시간`;
      }

      const minuteOnly = text.match(/(\d+)\s*분/u);
      if (minuteOnly) {
        return `${Number(minuteOnly[1])}분`;
      }

      return text;
    }

    function detectStatus(text) {
      const line = normalizeSpace(text);
      for (const pattern of STATUS_PATTERNS) {
        if (pattern.regex.test(line)) {
          return pattern.label;
        }
      }
      return "";
    }

    function isLoginUrl(urlText) {
      const text = String(urlText || "");
      if (!text) {
        return false;
      }

      try {
        const parsed = new URL(text, location.origin);
        return /^\/auth\/login(?:\/|$)/i.test(String(parsed.pathname || "/"));
      } catch {
        return /(?:^|[/?#])auth\/login(?:[/?#]|$)/i.test(text);
      }
    }

    function hasLoginTextMarkers(bodyText, titleText) {
      const normalized = `${normalizeSpace(titleText)} ${normalizeSpace(bodyText)}`.toLowerCase();
      if (!normalized) {
        return false;
      }
      return LOGIN_MARKER_GROUPS.some((markerGroup) => markerGroup.every((marker) => normalized.includes(marker)));
    }

    function buildLoginRequiredResult(urlText, bodyText, titleText) {
      if (!isLoginUrl(urlText) && !hasLoginTextMarkers(bodyText, titleText)) {
        return null;
      }

      return {
        ok: false,
        code: AUTH_REQUIRED_CODE,
        authRequired: true,
        error: "Flex login is required. Sign in on the opened Flex tab, then return and refresh this widget.",
        title: normalizeSpace(titleText),
        url: normalizeSpace(urlText)
      };
    }

    function scanText() {
      const pageUrl = String(location.href || "");
      const pageTitle = String(document.title || "");

      if (!document.body) {
        const loginResult = buildLoginRequiredResult(pageUrl, "", pageTitle);
        if (loginResult) {
          return loginResult;
        }

        return {
          ok: false,
          error: "Flex Home page is not ready yet."
        };
      }

      const bodyTextRaw = String(document.body.innerText || "");
      const loginResult = buildLoginRequiredResult(pageUrl, bodyTextRaw, pageTitle);
      if (loginResult) {
        return loginResult;
      }

      const bodyText = normalizeSpace(bodyTextRaw);
      if (!bodyText) {
        return {
          ok: false,
          error: "Flex Home page text is empty."
        };
      }

      const candidates = [];

      function addCandidate(status, duration, line, bonus = 0) {
        const normalizedStatus = normalizeSpace(status);
        const normalizedDuration = normalizeDuration(duration);
        if (!normalizedStatus && !normalizedDuration) {
          return;
        }
        const normalizedLine = normalizeSpace(line || `${normalizedStatus} ${normalizedDuration}`.trim());
        const score =
          (normalizedStatus ? 35 : 0) +
          (normalizedDuration ? 45 : 0) +
          Math.max(0, 90 - normalizedLine.length) +
          bonus;
        candidates.push({
          status: normalizedStatus,
          duration: normalizedDuration,
          line: normalizedLine,
          score
        });
      }

      const seen = new Set();
      const lines = [];
      for (const rawLine of bodyTextRaw.split(/\n+/g)) {
        const line = normalizeSpace(rawLine);
        if (!line || line.length > 120 || seen.has(line)) {
          continue;
        }
        seen.add(line);
        lines.push(line);
      }

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const next = lines[index + 1] || "";

        const lineStatus = detectStatus(line);
        const lineDurationMatch = line.match(DURATION_PATTERN);
        const lineDuration = lineDurationMatch ? lineDurationMatch[1] : "";
        if (lineStatus || lineDuration) {
          addCandidate(lineStatus, lineDuration, line, lineStatus && lineDuration ? 120 : 0);
        }

        const nextStatus = detectStatus(next);
        const nextDurationMatch = next.match(DURATION_PATTERN);
        const nextDuration = nextDurationMatch ? nextDurationMatch[1] : "";

        if (lineStatus && !lineDuration && nextDuration) {
          addCandidate(lineStatus, nextDuration, `${line} ${next}`, 70);
        }
        if (!lineStatus && lineDuration && nextStatus) {
          addCandidate(nextStatus, lineDuration, `${nextStatus} ${lineDuration}`, 70);
        }
      }

      const bodyStatus = detectStatus(bodyText);
      const bodyDurationMatch = bodyText.match(DURATION_PATTERN);
      const bodyDuration = bodyDurationMatch ? bodyDurationMatch[1] : "";
      if (bodyStatus || bodyDuration) {
        addCandidate(bodyStatus, bodyDuration, `${bodyStatus} ${bodyDuration}`.trim(), 10);
      }

      if (!candidates.length) {
        return {
          ok: false,
          error: "Could not find work status/duration text on flex.team/home.",
          sample: lines.slice(0, 8),
          title: pageTitle,
          url: pageUrl
        };
      }

      candidates.sort((left, right) => right.score - left.score);
      const best = candidates[0];
      return {
        ok: true,
        status: best.status,
        duration: best.duration,
        line: best.line,
        title: pageTitle,
        url: pageUrl,
        extractedAt: Date.now()
      };
    }

    function wait(ms) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }

    const deadline = Date.now() + WAIT_MS;
    let lastResult = null;
    while (Date.now() <= deadline) {
      const result = scanText();
      lastResult = result;
      if (result.ok) {
        return result;
      }
      await wait(INTERVAL_MS);
    }

    return lastResult || { ok: false, error: "Flex Home scrape timed out." };
  });

  const result = Array.isArray(results) && results.length > 0 ? results[0].result : null;
  if (!isPlainObject(result)) {
    throw new Error("Flex Home scrape returned no result.");
  }

  if (!result.ok) {
    if (
      normalizeText(result.code).toUpperCase() === FLEX_AUTH_REQUIRED_CODE ||
      result.authRequired === true ||
      isFlexLoginUrl(result.url)
    ) {
      throw createFlexAuthRequiredError(result.error);
    }

    const extractedError = normalizeText(result.error);
    if (extractedError) {
      throw new Error(extractedError);
    }
    throw new Error("Unable to extract work status from Flex Home page.");
  }

  return result;
}

export async function fetchFlexHomeScrapeRows(config, queryDate, scrapeFlowState = null) {
  ensureFlexHomeScrapeApis();
  const targetUrl = parseFlexHomeTargetUrl(config.flexHomeUrl);

  let targetTab = null;
  let temporaryTabManaged = false;
  let keepTemporaryTabOpen = false;

  const reusableTabId = getReusableScrapeTabId(scrapeFlowState);
  if (reusableTabId !== null) {
    targetTab = await getTabIfExists(reusableTabId);
    if (targetTab) {
      temporaryTabManaged = true;
    } else {
      setReusableScrapeTabId(scrapeFlowState, null);
    }
  }

  if (!targetTab) {
    targetTab = await findFlexHomeTab(targetUrl);
  }

  if (!targetTab) {
    if (!config.openFlexTabIfMissing) {
      throw new Error(
        `No Flex Home tab found for ${targetUrl.toString()}. Open it first or enable "Open Flex tab if missing".`
      );
    }

    targetTab = await createTab({
      url: targetUrl.toString(),
      active: false
    });
    temporaryTabManaged = true;
  }

  const tabId = normalizeTabId(targetTab?.id);
  if (tabId === null) {
    setReusableScrapeTabId(scrapeFlowState, null);
    throw new Error("Unable to access Flex Home tab.");
  }

  if (temporaryTabManaged) {
    setReusableScrapeTabId(scrapeFlowState, tabId);
  }

  try {
    await waitForTabReady(tabId, { timeoutMs: FLEX_HOME_TAB_LOAD_TIMEOUT_MS });
    const extracted = await extractFlexHomeWorktimeFromTab(tabId);
    return [normalizeFlexHomeScrapeRow(extracted, queryDate, targetUrl.toString())];
  } catch (error) {
    if (temporaryTabManaged) {
      const currentTab = await getTabIfExists(tabId);
      const currentTabUrl = normalizeText(currentTab?.url, normalizeText(targetTab?.url));
      const authFlowLikely =
        isFlexAuthRequiredError(error) ||
        isLikelyOngoingFlexAuthFlowUrl(currentTabUrl, targetUrl);

      if (authFlowLikely) {
        keepTemporaryTabOpen = true;
        setReusableScrapeTabId(scrapeFlowState, tabId);
        try {
          await updateTab(tabId, { active: true });
        } catch {
          // noop
        }
        throw createFlexAuthRequiredError(FLEX_AUTH_FLOW_PENDING_MESSAGE);
      }
    }
    throw error;
  } finally {
    if (temporaryTabManaged && !keepTemporaryTabOpen) {
      try {
        await removeTab(tabId);
      } catch {
        // noop
      }
      setReusableScrapeTabId(scrapeFlowState, null);
    }
  }
}

async function fetchRowsBySource(config, queryDate, scrapeFlowState = null) {
  return fetchFlexHomeScrapeRows(config, queryDate, scrapeFlowState);
}

function resolvePathValue(source, path) {
  if (!path) {
    return undefined;
  }

  if (isPlainObject(source) && hasOwn(source, path)) {
    return source[path];
  }

  const segments = path.split(".").filter(Boolean);
  if (!segments.length) {
    return undefined;
  }

  let current = source;
  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    if (!hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function applyTemplate(template, context) {
  const text = normalizeText(template);
  if (!text) {
    return "";
  }

  return text.replace(/\{([A-Za-z0-9_.-]+)\}/g, (fullMatch, key) => {
    const value = resolvePathValue(context, key);
    if (value === null || value === undefined) {
      return "";
    }
    return encodeURIComponent(String(value));
  });
}

function resolveDetailUrl(config, queryDate, entry) {
  const template = normalizeText(config.detailUrlTemplate);
  if (!template) {
    return "";
  }

  const row = isPlainObject(entry) && isPlainObject(entry.placeholders)
    ? entry
    : normalizeWorktimeRow(entry, 0);

  const context = {
    date: queryDate,
    entry: isPlainObject(row.rawEntry) ? row.rawEntry : {},
    ...sanitizePlaceholderMap(row.placeholders)
  };

  const resolved = applyTemplate(template, context);
  if (!resolved) {
    return "";
  }

  let parsed;
  try {
    parsed = new URL(resolved);
  } catch {
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }

  return parsed.toString();
}

export const flexWorktimeWidget = {
  type: "flexWorktime",
  title: "Flex Worktime",
  defaultConfig: {
    flexHomeUrl: "https://flex.team/home",
    openFlexTabIfMissing: true,
    refreshMinutes: DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES,
    detailUrlTemplate: "",
    openInNewTab: true
  },
  defaultLayout: {
    x: 660,
    y: 220,
    w: 300,
    h: 150
  },
  defaultGridSize: {
    w: 2,
    h: 1
  },
  settingsSchema: [
    {
      key: "flexHomeUrl",
      label: "Flex Home URL",
      type: "text",
      placeholder: "https://flex.team/home",
      helpText: "Reads the visible summary text from your logged-in flex.team/home tab."
    },
    {
      key: "openFlexTabIfMissing",
      label: "Open Flex tab if missing",
      type: "checkbox",
      helpText: "If enabled, the widget opens Flex Home in a background tab, scrapes, then closes it."
    },
    {
      key: "refreshMinutes",
      label: "Refresh every (minutes)",
      type: "number",
      min: 1,
      max: 720,
      step: 1
    },
    {
      key: "detailUrlTemplate",
      label: "Detail URL template (optional)",
      type: "text",
      placeholder: "https://example.com/worktime?date={date}&id={id}"
    },
    { key: "openInNewTab", label: "Open detail in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, isEditMode, openSettings }) {
    container.classList.add("flex-worktime-widget", "flex-worktime-compact");

    const shell = document.createElement("div");
    shell.className = "flex-worktime-shell";
    shell.tabIndex = 0;
    shell.setAttribute("aria-label", "Flex Worktime");

    const toolbar = document.createElement("div");
    toolbar.className = "flex-worktime-toolbar";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "icon-btn flex-worktime-refresh-btn";
    refreshBtn.title = "Refresh flex worktime";
    refreshBtn.setAttribute("aria-label", "Refresh flex worktime");
    refreshBtn.innerHTML = '<svg class="icon"><use href="#i-reset"></use></svg>';

    toolbar.append(refreshBtn);

    const list = document.createElement("ul");
    list.className = "flex-worktime-list";

    shell.append(toolbar, list);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let rows = [];
    let lastSyncedAt = 0;
    let lastRequestSig = "";
    let lastQueryDate = "";
    let timer = null;
    let refreshPausedWhileHidden = false;
    let requestSerial = 0;
    const scrapeFlowState = { reusableTabId: null };

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        refreshPausedWhileHidden = true;
        clearRefreshTimer();
        return;
      }

      if (refreshPausedWhileHidden) {
        refreshPausedWhileHidden = false;
        void loadWorktime();
        return;
      }

      scheduleRefresh();
    }

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      if (document.visibilityState === "hidden") {
        refreshPausedWhileHidden = true;
        return;
      }

      refreshPausedWhileHidden = false;
      const cfg = normalizedConfig(getConfig());
      const delayMs = cfg.refreshMinutes * 60000;
      timer = setTimeout(() => {
        void loadWorktime();
      }, delayMs);
    }

    function applyCachedSnapshotIfPresent(config, queryDate) {
      const cached = readCachedSnapshot(config, queryDate);
      if (!cached) {
        return false;
      }

      rows = cached.rows;
      lastSyncedAt = cached.fetchedAt;
      return true;
    }

    function openResolvedDetailHref(href, config) {
      if (!href) {
        return false;
      }

      if (config.openInNewTab) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = href;
      }
      return true;
    }

    function openDetailInternal(entry) {
      const cfg = normalizedConfig(getConfig());
      let queryDate = lastQueryDate;
      try {
        queryDate = resolveQueryDateForSource(cfg);
      } catch {
        if (!queryDate) {
          return false;
        }
      }

      const href = resolveDetailUrl(cfg, queryDate, entry);
      return openResolvedDetailHref(href, cfg);
    }

    function resolveSyncState() {
      if (loading) {
        return {
          label: rows.length ? "Syncing..." : "Loading...",
          tone: "loading",
          tooltip: rows.length ? "Refreshing cached worktime data." : "Loading worktime data."
        };
      }

      if (errorMessage) {
        return {
          label: "Sync failed",
          tone: "error",
          tooltip: errorMessage
        };
      }

      const synced = formatSyncedLabel(lastSyncedAt);
      if (synced) {
        return {
          label: `Synced ${synced}`,
          tone: "success",
          tooltip: `Last synced at ${synced}`
        };
      }

      return {
        label: "Not synced",
        tone: "idle",
        tooltip: "No sync history yet."
      };
    }

    function renderList(config, queryDate) {
      list.replaceChildren();

      const primaryRow = rows.length > 0 ? rows[0] : null;
      const detailHref = primaryRow ? resolveDetailUrl(config, queryDate, primaryRow) : "";
      const clickable = Boolean(detailHref);
      const syncState = resolveSyncState();
      container.setAttribute("data-sync-tone", syncState.tone);
      shell.title = syncState.tooltip;

      const rowItem = document.createElement("li");
      rowItem.className = "flex-worktime-row";

      const entry = clickable ? document.createElement("button") : document.createElement("div");
      if (clickable) {
        entry.type = "button";
      }
      entry.className = `flex-worktime-entry${clickable ? " is-clickable" : ""}`;

      if (clickable) {
        entry.title = "Open detail";
        entry.addEventListener("click", (event) => {
          if (isEditMode?.()) {
            event.preventDefault();
            event.stopPropagation();
            openSettings?.();
            return;
          }
          openResolvedDetailHref(detailHref, config);
        });
      }

      const duration = document.createElement("p");
      duration.className = "flex-worktime-duration";
      duration.textContent = normalizeText(primaryRow?.durationLabel, "--");
      duration.title = syncState.tooltip;

      entry.append(duration);
      rowItem.append(entry);
      list.append(rowItem);
    }

    function render() {


      const cfg = normalizedConfig(getConfig());

      let queryDate = lastQueryDate;
      try {
        queryDate = resolveQueryDateForSource(cfg);
      } catch {
        // keep previous queryDate
      }

      refreshBtn.disabled = loading;
      refreshBtn.title = loading ? "Refreshing..." : "Refresh flex worktime";
      renderList(cfg, queryDate);
    }

    async function loadWorktime() {
      if (document.visibilityState === "hidden") {
        refreshPausedWhileHidden = true;
        clearRefreshTimer();
        return;
      }

      const requestId = ++requestSerial;
      let cfg;
      let queryDate;
      let nextRequestSig;

      try {
        cfg = normalizedConfig(getConfig());
        queryDate = resolveQueryDateForSource(cfg);
        nextRequestSig = requestSignature(cfg, queryDate);
      } catch (error) {
        loading = false;
        errorMessage = cfg ? formatSourceError(cfg, error) : normalizeErrorMessage(error);
        render();
        scheduleRefresh();
        return;
      }

      loading = true;
      errorMessage = "";
      lastQueryDate = queryDate;
      lastRequestSig = nextRequestSig;
      render();

      try {
        const fetchedRows = await fetchRowsBySource(cfg, queryDate, scrapeFlowState);
        if (requestId !== requestSerial) {
          return;
        }

        rows = fetchedRows;
        lastSyncedAt = Date.now();
        writeCachedSnapshot(cfg, queryDate, rows, lastSyncedAt);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }
        errorMessage = formatSourceError(cfg, error);
      } finally {
        if (requestId !== requestSerial) {
          return;
        }
        loading = false;
        render();
        scheduleRefresh();
      }
    }

    refreshBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (loading) {
        return;
      }
      void loadWorktime();
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    let initialConfig;
    try {
      initialConfig = normalizedConfig(getConfig());
      const initialDate = resolveQueryDateForSource(initialConfig);
      lastQueryDate = initialDate;
      lastRequestSig = requestSignature(initialConfig, initialDate);
      applyCachedSnapshotIfPresent(initialConfig, initialDate);
    } catch (error) {
      errorMessage = initialConfig ? formatSourceError(initialConfig, error) : normalizeErrorMessage(error);
    }

    render();
    void loadWorktime();

    return {
      refresh() {
        const cfg = normalizedConfig(getConfig());
        let queryDate = "";

        try {
          queryDate = resolveQueryDateForSource(cfg);
        } catch (error) {
          requestSerial += 1;
          loading = false;
          errorMessage = formatSourceError(cfg, error);
          render();
          scheduleRefresh();
          return;
        }

        const nextSig = requestSignature(cfg, queryDate);
        render();

        if (nextSig !== lastRequestSig) {
          requestSerial += 1;
          loading = false;
          lastRequestSig = nextSig;
          lastQueryDate = queryDate;
          errorMessage = "";

          if (!applyCachedSnapshotIfPresent(cfg, queryDate)) {
            rows = [];
            lastSyncedAt = 0;
          }

          render();
          void loadWorktime();
          return;
        }

        scheduleRefresh();
      },
      manualRefresh() {
        return loadWorktime();
      },
      destroy() {
        requestSerial += 1;
        clearRefreshTimer();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        scrapeFlowState.reusableTabId = null;
      },
      openDetail(entry) {
        return openDetailInternal(entry);
      }
    };
  }
};
