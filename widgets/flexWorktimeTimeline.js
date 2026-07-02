import { normalizeErrorMessage } from "../core/utils/error.js";
import { clamp } from "../core/utils/number.js";
import { hasOwn, isPlainObject } from "../core/utils/object.js";
import { normalizeText } from "../core/utils/text.js";
import { executeScript, hasScriptingApi } from "../core/platform/chrome-scripting.js";
import {
  createTab,
  getTabIfExists,
  hasTabsApi,
  queryTabs,
  updateTab,
  waitForTabReady
} from "../core/platform/chrome-tabs.js";
import {
  createFlexAuthRequiredError,
  FLEX_AUTH_FLOW_PENDING_MESSAGE,
  FLEX_AUTH_REQUIRED_CODE,
  isFlexAuthRequiredError,
  isFlexLoginUrl
} from "./shared/flexAuth.js";
import { extractFlexHomeWorktimeFromTab } from "./shared/flexHomeScrape.js";
import {
  comparablePath,
  isAllowedFlexHomeHost,
  isAllowedFlexHomePath,
  isLikelyOngoingFlexAuthFlowUrl,
  isMatchingFlexHomeTabUrl,
  isMatchingFlexLoginTabUrl,
  parseAllowedFlexTabUrl,
  parseFlexHomeTargetUrl
} from "./shared/flexUrls.js";
import { createFlexWorktimeCache } from "./shared/flexWorktimeCache.js";
import {
  formatClockMinutes,
  formatDurationMinutes,
  formatFlexSourceError,
  formatSyncedLabel,
  formatTimeFromRef,
  normalizeCachedWorktimeRow as normalizeCachedRow,
  normalizeFlexHomeScrapeRow,
  normalizeFlexHomeUrl,
  normalizeFlexRefreshMinutes as normalizeRefreshMinutes,
  normalizeTabId,
  parseTimeOfDayMinutes,
  resolveFlexWorktimeDetailUrl as resolveDetailUrl,
  sanitizePlaceholderMap,
  toCachedWorktimeRow as toCachedRow,
  toLocalDateKey
} from "./shared/flexWorktimeRows.js";

const FLEX_WORKTIME_CACHE_PREFIX = "s3newtab:flex-worktime-timeline-cache:v1";
const FLEX_WORKTIME_CACHE_MAX_ENTRIES = 24;
const FLEX_HOME_TAB_LOAD_TIMEOUT_MS = 20000;
const DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES = 1;
const DEFAULT_FLEX_HOME_URL = "https://flex.team/home";
const DEFAULT_FLEX_WORK_RECORD_PATH = "/time-tracking/my-work-record";
const FLEX_WORK_RECORD_PATH_RE = /^\/time-tracking\/my-work-record(?:\/|$)/i;
const FLEX_TIMELINE_TOOLTIP_LABEL_RE = /(기록\s*시작|기록\s*종료|휴게\s*기록)/u;
const FLEX_TIMELINE_TOOLTIP_SUMMARY_RE = /(?:오전|오후)\s*\d{1,2}:\d{2}.*휴게\s*(?:없음|0\s*분)/u;
const FLEX_TIMELINE_TIME_TOKEN_RE = /((?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}|기록\s*중)/gu;
const DATE_MODE_VALUES = new Set(["today", "yesterday", "tomorrow", "custom"]);

function normalizeDateMode(value, fallback = "today") {
  const mode = normalizeText(value, fallback).toLowerCase();
  return DATE_MODE_VALUES.has(mode) ? mode : "today";
}

function normalizeIsoDate(value) {
  const text = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return "";
  }

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return "";
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }
  return text;
}

function parseMeridiemTimeOfDayMinutes(value) {
  const text = normalizeText(value).replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }

  const match = text.match(/^(오전|오후)\s*(1[0-2]|0?\d):(\d{2})$/u);
  if (!match) {
    return parseTimeOfDayMinutes(text);
  }

  let hour = Number(match[2]);
  const minute = Number(match[3]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  if (match[1] === "오전") {
    if (hour === 12) {
      hour = 0;
    }
  } else if (hour !== 12) {
    hour += 12;
  }

  return hour * 60 + minute;
}

function formatTimelineTimeLabel(totalMinutes) {
  const minutes = clamp(Math.floor(Number(totalMinutes) || 0), 0, 1439);
  return formatClockMinutes(minutes);
}

function extractTimelineLabeledValue(text, label) {
  const normalized = normalizeText(text).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalized.match(
    new RegExp(`${escapedLabel}\\s*([\\s\\S]*?)(?=(?:기록\\s*시작|기록\\s*종료|휴게\\s*기록|$))`, "u")
  );
  return normalizeText(match?.[1]).replace(/\s+/g, " ").trim();
}

function extractTimelineTimeTokens(text) {
  return Array.from(normalizeText(text).matchAll(FLEX_TIMELINE_TIME_TOKEN_RE), (match) => normalizeText(match[1]));
}

export function parseFlexWorkRecordTimelineText(text, queryDate, now = new Date()) {
  const normalized = normalizeText(text).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const hasDetailedLabels = FLEX_TIMELINE_TOOLTIP_LABEL_RE.test(normalized);
  const hasSummaryTooltip = FLEX_TIMELINE_TOOLTIP_SUMMARY_RE.test(normalized);
  if (!hasDetailedLabels && !hasSummaryTooltip) {
    return null;
  }

  if (!hasDetailedLabels && hasSummaryTooltip) {
    const startToken = extractTimelineTimeTokens(normalized)[0] || "";
    const startMinutes = parseMeridiemTimeOfDayMinutes(startToken);
    if (startMinutes === null) {
      return null;
    }

    const nowMinutes = clamp(now.getHours() * 60 + now.getMinutes(), 0, 1439);
    return {
      date: normalizeText(queryDate),
      isOngoing: true,
      nowMinutes,
      sourceText: normalized,
      events: [
        {
          type: "workStart",
          at: formatTimelineTimeLabel(startMinutes),
          minutes: startMinutes
        }
      ]
    };
  }

  const startValue = extractTimelineLabeledValue(normalized, "기록 시작");
  const endValue = extractTimelineLabeledValue(normalized, "기록 종료");
  const breakValues = Array.from(
    normalized.matchAll(/휴게\s*기록\s*([\s\S]*?)(?=(?:기록\s*시작|기록\s*종료|휴게\s*기록|$))/gu),
    (match) => normalizeText(match[1]).replace(/\s+/g, " ").trim()
  ).filter(Boolean);

  const events = [];
  const addEvent = (type, token) => {
    const minutes = parseMeridiemTimeOfDayMinutes(token);
    if (minutes === null) {
      return;
    }
    events.push({
      type,
      at: formatTimelineTimeLabel(minutes),
      minutes
    });
  };

  const startToken = extractTimelineTimeTokens(startValue)[0] || "";
  addEvent("workStart", startToken);

  for (const breakValue of breakValues) {
    const [breakStartToken = "", breakEndToken = ""] = extractTimelineTimeTokens(breakValue);
    addEvent("breakStart", breakStartToken);
    if (normalizeText(breakEndToken) && normalizeText(breakEndToken) !== "기록 중") {
      addEvent("breakEnd", breakEndToken);
    }
  }

  const endTokens = extractTimelineTimeTokens(endValue);
  const endToken = endTokens.find((token) => token !== "기록 중") || "";
  const isOngoing = endTokens.includes("기록 중") || /기록\s*중/u.test(endValue);
  if (endToken) {
    addEvent("workEnd", endToken);
  }

  events.sort((left, right) => left.minutes - right.minutes);
  if (!events.length) {
    return null;
  }

  const nowMinutes = clamp(now.getHours() * 60 + now.getMinutes(), 0, 1439);
  return {
    date: normalizeText(queryDate),
    isOngoing,
    nowMinutes,
    sourceText: normalized,
    events
  };
}

export function buildFlexTimelineSegments(timeline, now = new Date()) {
  const events = Array.isArray(timeline?.events)
    ? timeline.events
      .map((event) => ({
        type: normalizeText(event?.type),
        minutes: clamp(Math.floor(Number(event?.minutes) || 0), 0, 1439),
        at: normalizeText(event?.at)
      }))
      .filter((event) => event.type)
      .sort((left, right) => left.minutes - right.minutes)
    : [];

  if (!events.length) {
    return [];
  }

  const explicitNowMinutes = Number(timeline?.nowMinutes);
  const nowMinutes = Number.isFinite(explicitNowMinutes)
    ? clamp(Math.floor(explicitNowMinutes), 0, 1439)
    : clamp(now.getHours() * 60 + now.getMinutes(), 0, 1439);
  const effectiveEndMinutes = timeline?.isOngoing === true ? nowMinutes : null;
  const segments = [];
  let activeType = "";
  let cursor = null;

  const pushSegment = (type, startMinutes, endMinutes, isActive = false) => {
    if (!type || !Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
      return;
    }

    segments.push({
      type,
      isActive,
      startMinutes,
      endMinutes,
      startLabel: formatTimelineTimeLabel(startMinutes),
      endLabel: formatTimelineTimeLabel(endMinutes),
      startPercent: (startMinutes / 1440) * 100,
      widthPercent: ((endMinutes - startMinutes) / 1440) * 100
    });
  };

  for (const event of events) {
    if (event.type === "workStart") {
      activeType = "work";
      cursor = event.minutes;
      continue;
    }

    if (event.type === "breakStart") {
      if (activeType === "work" && cursor !== null) {
        pushSegment("work", cursor, event.minutes);
      }
      activeType = "break";
      cursor = event.minutes;
      continue;
    }

    if (event.type === "breakEnd") {
      if (activeType === "break" && cursor !== null) {
        pushSegment("break", cursor, event.minutes);
      }
      activeType = "work";
      cursor = event.minutes;
      continue;
    }

    if (event.type === "workEnd") {
      if (activeType && cursor !== null) {
        pushSegment(activeType, cursor, event.minutes);
      }
      activeType = "";
      cursor = null;
    }
  }

  if (timeline?.isOngoing === true && activeType && cursor !== null) {
    pushSegment(activeType, cursor, effectiveEndMinutes, true);
  }

  return segments;
}

function summarizeFlexTimeline(timeline) {
  const events = Array.isArray(timeline?.events)
    ? timeline.events
      .map((event) => ({
        type: normalizeText(event?.type),
        at: normalizeText(event?.at),
        minutes: Number(event?.minutes)
      }))
      .filter((event) => event.type)
      .sort((left, right) => left.minutes - right.minutes)
    : [];
  const segments = buildFlexTimelineSegments(timeline);
  const workedMinutes = segments
    .filter((segment) => segment.type === "work")
    .reduce((total, segment) => total + Math.max(0, segment.endMinutes - segment.startMinutes), 0);
  const activeSegment = [...segments].reverse().find((segment) => segment.isActive) || segments[segments.length - 1] || null;
  const workStart = events.find((event) => event.type === "workStart") || null;
  const workEnd = [...events].reverse().find((event) => event.type === "workEnd") || null;

  let status = "상태 확인 필요";
  if (timeline?.isOngoing === true) {
    status = activeSegment?.type === "break" ? "휴게" : "근무중";
  } else if (workEnd) {
    status = "퇴근";
  } else if (workStart) {
    status = "근무 기록";
  }

  return {
    status,
    durationMinutes: workedMinutes,
    durationLabel: workedMinutes > 0 ? formatDurationMinutes(workedMinutes) : "--",
    inLabel: workStart?.at || "--",
    outLabel: workEnd?.at || "--",
    segments
  };
}

function parseDurationLabelMinutes(value) {
  const text = normalizeText(value).replace(/\s+/g, " ").trim();
  if (!text || text === "--") {
    return null;
  }

  let total = 0;
  let matched = false;

  const hourMatch = text.match(/(\d+)\s*(?:h|시간)/i);
  if (hourMatch) {
    total += Number(hourMatch[1]) * 60;
    matched = true;
  }

  const minuteMatch = text.match(/(\d+)\s*(?:m|분)/i);
  if (minuteMatch) {
    total += Number(minuteMatch[1]);
    matched = true;
  }

  if (!matched) {
    const bareNumber = Number(text);
    if (Number.isFinite(bareNumber)) {
      return Math.max(0, Math.round(bareNumber));
    }
    return null;
  }

  return Math.max(0, total);
}

function inferTimelineFromSummary(summary, queryDate, now = new Date()) {
  if (!isPlainObject(summary)) {
    return null;
  }

  const durationMinutes = parseDurationLabelMinutes(summary.duration);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  const nowMinutes = clamp(now.getHours() * 60 + now.getMinutes(), 0, 1439);
  const startMinutes = clamp(nowMinutes - durationMinutes, 0, nowMinutes);
  const statusText = normalizeText(summary.status).toLowerCase();
  const isOngoing = !statusText.includes("퇴근") && !statusText.includes("종료");
  const events = [
    {
      type: "workStart",
      at: formatTimelineTimeLabel(startMinutes),
      minutes: startMinutes
    }
  ];

  if (!isOngoing) {
    events.push({
      type: "workEnd",
      at: formatTimelineTimeLabel(nowMinutes),
      minutes: nowMinutes
    });
  }

  return {
    date: normalizeText(queryDate),
    isOngoing,
    nowMinutes,
    sourceText: normalizeText(summary.line, summary.duration),
    inferred: true,
    events
  };
}

function sourceModeLabel() {
  return "Flex Work Record scrape";
}

function formatSourceError(config, error) {
  return formatFlexSourceError(sourceModeLabel(), error);
}

function configSignature(config) {
  return [
    normalizeText(config.flexHomeUrl),
    config.openFlexTabIfMissing ? 1 : 0,
    normalizeText(config.dateMode),
    normalizeText(config.customDate),
    normalizeText(config.detailUrlTemplate),
    config.openInNewTab ? 1 : 0
  ].join("|");
}

const {
  requestSignature,
  readCachedSnapshot,
  pruneCacheEntries,
  writeCachedSnapshot
} = createFlexWorktimeCache({
  cachePrefix: FLEX_WORKTIME_CACHE_PREFIX,
  maxEntries: FLEX_WORKTIME_CACHE_MAX_ENTRIES,
  configSignature,
  normalizeCachedRow,
  toCachedRow
});

function resolveQueryDate(config) {
  const mode = normalizeDateMode(config.dateMode, "today");
  const base = new Date();

  if (mode === "today") {
    return toLocalDateKey(base);
  }

  if (mode === "yesterday") {
    base.setDate(base.getDate() - 1);
    return toLocalDateKey(base);
  }

  if (mode === "tomorrow") {
    base.setDate(base.getDate() + 1);
    return toLocalDateKey(base);
  }

  const customDate = normalizeIsoDate(config.customDate);
  if (!customDate) {
    throw new Error("Custom date must use YYYY-MM-DD format.");
  }
  return customDate;
}

function resolveQueryDateForSource(config) {
  return resolveQueryDate(config);
}

function formatTimelineCaption(queryDate) {
  const target = normalizeIsoDate(queryDate);
  const today = toLocalDateKey(new Date());
  if (!target || target === today) {
    return "Today timeline";
  }

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (target === toLocalDateKey(yesterdayDate)) {
    return "Yesterday timeline";
  }

  return `${target} timeline`;
}

function normalizedConfig(config) {
  return {
    flexHomeUrl: normalizeFlexHomeUrl(config?.flexHomeUrl, DEFAULT_FLEX_HOME_URL),
    openFlexTabIfMissing: config?.openFlexTabIfMissing !== false,
    dateMode: normalizeDateMode(config?.dateMode, "today"),
    customDate: normalizeIsoDate(config?.customDate),
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES),
    detailUrlTemplate: normalizeText(config?.detailUrlTemplate),
    openInNewTab: config?.openInNewTab !== false
  };
}

function ensureFlexHomeScrapeApis() {
  if (!hasTabsApi() || !hasScriptingApi()) {
    throw new Error('Flex Work Record scrape requires "tabs" and "scripting" extension permissions.');
  }
}

function isAllowedFlexWorkRecordPath(pathname) {
  const path = comparablePath(pathname || "/");
  return FLEX_WORK_RECORD_PATH_RE.test(path);
}

function getReusableScrapeTabIdByKey(scrapeFlowState, key) {
  if (!isPlainObject(scrapeFlowState)) {
    return null;
  }

  if (key === "home" && hasOwn(scrapeFlowState, "reusableTabId")) {
    return normalizeTabId(scrapeFlowState.reusableTabId);
  }

  if (!isPlainObject(scrapeFlowState.reusableTabIds)) {
    return null;
  }

  return normalizeTabId(scrapeFlowState.reusableTabIds[key]);
}

function setReusableScrapeTabIdByKey(scrapeFlowState, key, tabId) {
  const normalizedTabId = normalizeTabId(tabId);
  if (!isPlainObject(scrapeFlowState)) {
    return;
  }

  if (!isPlainObject(scrapeFlowState.reusableTabIds)) {
    scrapeFlowState.reusableTabIds = {};
  }

  scrapeFlowState.reusableTabIds[key] = normalizedTabId;
  if (key === "home") {
    scrapeFlowState.reusableTabId = normalizedTabId;
  }
}

function buildFlexWorkRecordTargetUrl(value) {
  const parsed = parseFlexScrapeBaseTargetUrl(value);
  parsed.pathname = DEFAULT_FLEX_WORK_RECORD_PATH;
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

function isMatchingFlexWorkRecordTabUrl(tabUrl, targetUrl) {
  const parsed = parseAllowedFlexTabUrl(tabUrl);
  if (!parsed) {
    return false;
  }

  if (!isAllowedFlexWorkRecordPath(parsed.pathname)) {
    return false;
  }

  const targetPath = comparablePath(targetUrl.pathname || DEFAULT_FLEX_WORK_RECORD_PATH);
  const tabPath = comparablePath(parsed.pathname || "/");
  return tabPath === targetPath || tabPath.startsWith(`${targetPath}/`);
}

function findPreferredFlexTab(tabs, targetUrl, matchTabUrl) {
  const pageMatch = tabs.find((tab) => matchTabUrl(tab?.url, targetUrl));
  if (pageMatch) {
    return pageMatch;
  }

  return tabs.find((tab) => isMatchingFlexLoginTabUrl(tab?.url, targetUrl)) || null;
}

function executeScriptInTab(tabId, func, args = [], fallbackMessage = "Unable to run script in Flex tab.") {
  return executeScript(
    { target: { tabId }, func, args },
    { fallbackMessage }
  );
}

async function findFlexTab(targetUrl, matchTabUrl) {
  const activeCurrentWindow = await queryTabs({ active: true, currentWindow: true });
  const activeMatch = findPreferredFlexTab(activeCurrentWindow, targetUrl, matchTabUrl);
  if (activeMatch) {
    return activeMatch;
  }

  const currentWindowTabs = await queryTabs({ currentWindow: true });
  const currentMatch = findPreferredFlexTab(currentWindowTabs, targetUrl, matchTabUrl);
  if (currentMatch) {
    return currentMatch;
  }

  const allTabs = await queryTabs({});
  return findPreferredFlexTab(allTabs, targetUrl, matchTabUrl);
}

async function findFlexHomeTab(targetUrl) {
  return findFlexTab(targetUrl, isMatchingFlexHomeTabUrl);
}

async function findFlexWorkRecordTab(targetUrl) {
  return findFlexTab(targetUrl, isMatchingFlexWorkRecordTabUrl);
}

function normalizeFlexWorkRecordRow(timeline, queryDate, workRecordUrl) {
  const resolvedTimeline = isPlainObject(timeline?.timeline)
    ? timeline.timeline
    : (Array.isArray(timeline?.events) ? timeline : null);
  const fallbackSummary = isPlainObject(timeline?.summary) ? timeline.summary : null;
  const inferredTimeline = !resolvedTimeline ? inferTimelineFromSummary(fallbackSummary, queryDate) : null;
  const effectiveTimeline = resolvedTimeline || inferredTimeline;
  const inferredSummary = inferredTimeline ? summarizeFlexTimeline(inferredTimeline) : null;
  const summary = resolvedTimeline
    ? summarizeFlexTimeline(resolvedTimeline)
    : inferredSummary
      ? {
        ...inferredSummary,
        status: normalizeText(fallbackSummary?.status, inferredSummary.status),
        durationLabel: normalizeText(fallbackSummary?.duration, inferredSummary.durationLabel)
      }
      : {
        status: normalizeText(fallbackSummary?.status, "상태 확인 필요"),
        durationLabel: normalizeText(fallbackSummary?.duration, "--"),
        inLabel: "--",
      outLabel: "--",
      segments: []
    };
  const rawEntry = {
    sourceMode: "flexWorkRecordScrape",
    queryDate: normalizeText(queryDate),
    sourceUrl: normalizeText(timeline?.sourceUrl, workRecordUrl),
    pageTitle: normalizeText(timeline?.pageTitle),
    extractedAt: Math.max(1, Math.round(Number(timeline?.extractedAt) || Date.now())),
    timeline: effectiveTimeline || null,
    summary: fallbackSummary,
    status: summary.status,
    duration: summary.durationLabel
  };

  const row = {
    id: `flex-work-record-${normalizeText(queryDate, toLocalDateKey(new Date()))}`,
    name: "Flex Work Record",
    status: summary.status,
    inLabel: summary.inLabel,
    outLabel: summary.outLabel,
    durationLabel: summary.durationLabel,
    note: normalizeText(effectiveTimeline?.sourceText, normalizeText(fallbackSummary?.line)),
    placeholders: {},
    rawEntry
  };

  row.placeholders = sanitizePlaceholderMap({
    id: row.id,
    name: row.name,
    status: row.status,
    in: row.inLabel,
    out: row.outLabel,
    duration: row.durationLabel,
    note: row.note,
    sourceMode: rawEntry.sourceMode,
    queryDate: normalizeText(queryDate),
    flexWorkRecordUrl: rawEntry.sourceUrl,
    pageTitle: rawEntry.pageTitle
  });

  return row;
}

function parseFlexScrapeBaseTargetUrl(value) {
  const text = normalizeText(value, DEFAULT_FLEX_HOME_URL);

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("Flex URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Flex URL must use https.");
  }

  if (!isAllowedFlexHomeHost(parsed.hostname)) {
    throw new Error('Flex URL must use host "flex.team" (or "www.flex.team").');
  }

  if (!isAllowedFlexHomePath(parsed.pathname) && !isAllowedFlexWorkRecordPath(parsed.pathname)) {
    throw new Error('Flex URL path must be "/home" or "/time-tracking/my-work-record".');
  }

  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

async function fetchFlexScrapePayload({
  config,
  scrapeFlowState,
  scrapeKey,
  targetUrl,
  findTab,
  missingTabMessage,
  extractPayload,
  inaccessibleTabMessage = "Unable to access Flex tab."
}) {
  ensureFlexHomeScrapeApis();

  let targetTab = null;
  let managedTab = false;

  const reusableTabId = getReusableScrapeTabIdByKey(scrapeFlowState, scrapeKey);
  if (reusableTabId !== null) {
    targetTab = await getTabIfExists(reusableTabId);
    if (targetTab) {
      managedTab = true;
    } else {
      setReusableScrapeTabIdByKey(scrapeFlowState, scrapeKey, null);
    }
  }

  if (!targetTab) {
    targetTab = await findTab(targetUrl);
  }

  if (!targetTab) {
    if (!config.openFlexTabIfMissing) {
      throw new Error(missingTabMessage);
    }

    targetTab = await createTab({
      url: targetUrl.toString(),
      active: false
    });
    managedTab = true;
  }

  const tabId = normalizeTabId(targetTab?.id);
  if (tabId === null) {
    setReusableScrapeTabIdByKey(scrapeFlowState, scrapeKey, null);
    throw new Error(inaccessibleTabMessage);
  }

  if (managedTab) {
    setReusableScrapeTabIdByKey(scrapeFlowState, scrapeKey, tabId);
  }

  try {
    await waitForTabReady(tabId, { timeoutMs: FLEX_HOME_TAB_LOAD_TIMEOUT_MS });
    return await extractPayload(tabId);
  } catch (error) {
    const currentTab = await getTabIfExists(tabId);
    if (!currentTab && managedTab) {
      setReusableScrapeTabIdByKey(scrapeFlowState, scrapeKey, null);
    }

    const currentTabUrl = normalizeText(currentTab?.url, normalizeText(targetTab?.url));
    const authFlowLikely =
      managedTab &&
      (isFlexAuthRequiredError(error) || isLikelyOngoingFlexAuthFlowUrl(currentTabUrl, targetUrl));

    if (authFlowLikely) {
      setReusableScrapeTabIdByKey(scrapeFlowState, scrapeKey, tabId);
      try {
        await updateTab(tabId, { active: true });
      } catch {
        // noop
      }
      throw createFlexAuthRequiredError(FLEX_AUTH_FLOW_PENDING_MESSAGE);
    }

    throw error;
  }
}

async function extractFlexWorkRecordTimelineFromTab(tabId, queryDate) {
  const results = await executeScriptInTab(
    tabId,
    async (targetDateKey) => {
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
      const DURATION_PATTERN = /(\d+\s*시간\s*\d+\s*분|\d+\s*시간|\d+\s*분|\b\d{1,2}:\d{2}\b)/u;
      const MAX_VISIBLE_SCAN_NODES = 700;
      const MAX_HOVER_TARGETS = 24;
      const MAX_DATE_LABEL_CANDIDATES = 900;
      const MAX_CHART_PROBE_POINTS = 24;
      const LOGIN_MARKER_GROUPS = [
        ["로그인", "비밀번호"],
        ["로그인", "이메일"],
        ["login", "password"],
        ["sign in", "password"]
      ];
      const WAIT_MS = 8000;
      const INTERVAL_MS = 220;
      const TOOLTIP_SELECTOR = [
        '[role="tooltip"]',
        '[class*="tooltip"]',
        '[id*="tooltip"]',
        '[aria-label*="기록 시작"]',
        '[aria-label*="휴게 기록"]',
        '[title*="기록 시작"]',
        '[title*="휴게 기록"]',
        '[data-tooltip*="기록 시작"]',
        '[data-tooltip*="휴게 기록"]'
      ].join(",");

      function normalizeSpace(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
      }

      function wait(ms) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
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

        const clockLike = text.match(/\b(\d{1,2}):(\d{2})\b/);
        if (clockLike) {
          return `${Number(clockLike[1])}시간 ${Number(clockLike[2])}분`;
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

      function scanSummaryText(pageUrl, pageTitle, bodyTextRaw) {
        const bodyText = normalizeSpace(bodyTextRaw);
        if (!bodyText) {
          return null;
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
          return null;
        }

        candidates.sort((left, right) => right.score - left.score);
        return {
          ...candidates[0],
          title: pageTitle,
          url: pageUrl,
          extractedAt: Date.now()
        };
      }

      function scanRowSummaryText(row, pageUrl, pageTitle) {
        if (!(row instanceof Element)) {
          return null;
        }

        const textParts = [row.textContent || ""];
        for (const node of Array.from(row.querySelectorAll("[title], [aria-label], [data-tooltip], [data-tip]"))) {
          textParts.push(
            node.getAttribute("title") || "",
            node.getAttribute("aria-label") || "",
            node.getAttribute("data-tooltip") || "",
            node.getAttribute("data-tip") || ""
          );
        }

        return scanSummaryText(pageUrl, pageTitle, textParts.filter(Boolean).join("\n"));
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

      function isVisible(element) {
        if (!(element instanceof Element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }

        const style = window.getComputedStyle(element);
        return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
      }

      function looksLikeTimelineText(text) {
        const normalized = normalizeSpace(text);
        return (
          Boolean(normalized) &&
          (
            (
              /(기록\s*시작|기록\s*종료|휴게\s*기록)/u.test(normalized) &&
              /(?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}|기록\s*중/u.test(normalized)
            ) ||
            (/(?:오전|오후)\s*\d{1,2}:\d{2}/u.test(normalized) && /휴게\s*(?:없음|0\s*분)/u.test(normalized) && normalized.length <= 48)
          )
        );
      }

      function addCandidate(map, text, bonus = 0) {
        const normalized = normalizeSpace(text);
        if (!looksLikeTimelineText(normalized)) {
          return;
        }

        const isDetailed = /(기록\s*시작|기록\s*종료|휴게\s*기록)/u.test(normalized);
        const score =
          (normalized.includes("기록 시작") ? 30 : 0) +
          (normalized.includes("기록 종료") ? 30 : 0) +
          (normalized.includes("휴게 기록") ? 30 : 0) +
          (isDetailed ? 90 : 0) +
          Math.max(0, 80 - normalized.length) +
          bonus;
        const current = map.get(normalized);
        if (!current || score > current.score) {
          map.set(normalized, {
            text: normalized,
            score,
            isDetailed
          });
        }
      }

      function collectElementTexts(element) {
        if (!(element instanceof Element)) {
          return [];
        }

        return [
          element.getAttribute("title"),
          element.getAttribute("aria-label"),
          element.getAttribute("aria-description"),
          element.getAttribute("data-tooltip"),
          element.getAttribute("data-tip"),
          element.textContent
        ];
      }

      const timelineCandidateCache = new WeakMap();

      function resolveScanRoot(root = document) {
        if (root === document) {
          return document.body || document.documentElement || document;
        }
        return root?.body || root;
      }

      function scanTimelineCandidate(root = document, options = {}) {
        const scanRoot = resolveScanRoot(root);
        const cacheRoot = scanRoot instanceof Element || scanRoot === document ? scanRoot : null;
        if (!options.fresh && cacheRoot) {
          const cached = timelineCandidateCache.get(cacheRoot);
          if (cached) {
            return cached;
          }
        }

        const candidateScores = new Map();
        const tooltipNodes = Array.from(scanRoot.querySelectorAll?.(TOOLTIP_SELECTOR) || []);
        for (const node of tooltipNodes) {
          for (const text of collectElementTexts(node)) {
            addCandidate(candidateScores, text, 120);
          }
        }

        const attributeNodes = Array.from(scanRoot.querySelectorAll?.("[title], [aria-label], [data-tooltip], [data-tip]") || []);
        for (const node of attributeNodes) {
          for (const text of collectElementTexts(node)) {
            addCandidate(candidateScores, text, 70);
          }
        }

        const maxVisibleNodes = Math.max(1, Number(options.maxVisibleNodes) || MAX_VISIBLE_SCAN_NODES);
        const maxScannedNodes = maxVisibleNodes * 6;
        let inspectedVisibleNodes = 0;
        let scannedNodes = 0;
        const walkerRoot = scanRoot instanceof Element ? scanRoot : document.body;
        const walker = document.createTreeWalker(walkerRoot, window.NodeFilter?.SHOW_ELEMENT || 1);
        for (let node = walker.currentNode; node; node = walker.nextNode()) {
          scannedNodes += 1;
          if (scannedNodes > maxScannedNodes) {
            break;
          }
          const text = normalizeSpace(node.textContent);
          if (!looksLikeTimelineText(text)) {
            continue;
          }
          inspectedVisibleNodes += 1;
          if (inspectedVisibleNodes > maxVisibleNodes) {
            break;
          }
          if (!isVisible(node)) {
            continue;
          }
          addCandidate(candidateScores, text, 15);
        }

        const ranked = Array.from(candidateScores.values()).sort((left, right) => right.score - left.score);
        const result = ranked[0] || null;
        if (!options.fresh && cacheRoot) {
          timelineCandidateCache.set(cacheRoot, result);
        }
        return result;
      }

      function scanTimelineText(root = document) {
        return scanTimelineCandidate(root)?.text || "";
      }

      function getDayRowContainer(labelElement) {
        let current = labelElement;
        while (current && current !== document.body) {
          const rect = current.getBoundingClientRect();
          if (rect.width >= window.innerWidth * 0.45 && rect.height >= 34 && rect.height <= 140) {
            return current;
          }
          current = current.parentElement;
        }
        return null;
      }

      function getScrollableAncestors(element) {
        const ancestors = [];
        let current = element?.parentElement || null;
        while (current && current !== document.body) {
          const style = window.getComputedStyle(current);
          const overflow = `${style.overflow} ${style.overflowY}`;
          if (/(auto|scroll|overlay)/.test(overflow) && current.scrollHeight > current.clientHeight + 4) {
            ancestors.push(current);
          }
          current = current.parentElement;
        }
        return ancestors;
      }

      function getScrollableRoots() {
        const candidates = Array.from(document.querySelectorAll("body *"));
        const roots = [];
        const seen = new Set();

        const addRoot = (node) => {
          if (!(node instanceof Element)) {
            return;
          }
          if (seen.has(node)) {
            return;
          }
          seen.add(node);
          roots.push(node);
        };

        for (const node of candidates) {
          if (!(node instanceof Element)) {
            continue;
          }
          const style = window.getComputedStyle(node);
          const overflow = `${style.overflow} ${style.overflowY}`;
          if (!/(auto|scroll|overlay)/.test(overflow)) {
            continue;
          }
          if (node.scrollHeight <= node.clientHeight + 40) {
            continue;
          }
          addRoot(node);
        }

        const documentRoot = document.scrollingElement;
        if (documentRoot instanceof Element && documentRoot.scrollHeight > documentRoot.clientHeight + 40) {
          addRoot(documentRoot);
        }

        roots.sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
        });

        return roots;
      }

      async function scrollRowIntoView(row) {
        if (!(row instanceof Element)) {
          return;
        }

        for (const ancestor of getScrollableAncestors(row)) {
          const rowRect = row.getBoundingClientRect();
          const ancestorRect = ancestor.getBoundingClientRect();
          const targetTop = ancestor.scrollTop + (rowRect.top - ancestorRect.top) - ancestor.clientHeight / 2 + rowRect.height / 2;
          ancestor.scrollTop = Math.max(0, targetTop);
        }

        try {
          row.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        } catch {
          row.scrollIntoView({ block: "center", inline: "nearest" });
        }

        await wait(180);
      }

      function findTargetDateRow() {
        const dayNumber = Number(String(targetDateKey || "").slice(-2));
        if (!Number.isFinite(dayNumber) || dayNumber <= 0) {
          return null;
        }

        const candidates = [];
        let inspectedLabels = 0;
        const walkerRoot = document.body || document.documentElement;
        const walker = document.createTreeWalker(walkerRoot, window.NodeFilter?.SHOW_ELEMENT || 1);
        for (let element = walker.currentNode; element; element = walker.nextNode()) {
          const text = normalizeSpace(element.textContent);
          if (!text || text.length > 20) {
            continue;
          }

          const normalizedToken = text.replace(/\s+/g, "").trim();
          const startsWithDay = new RegExp(`^${dayNumber}(?:\\s|$|\\D)`, "u").test(text);
          const containsDay = new RegExp(`(^|\\D)${dayNumber}(?:\\D|$)`, "u").test(text);
          const exactCompactMatch = normalizedToken === String(dayNumber) || normalizedToken.startsWith(`${dayNumber}`);
          if (!startsWithDay && !containsDay && !exactCompactMatch) {
            continue;
          }

          inspectedLabels += 1;
          if (inspectedLabels > MAX_DATE_LABEL_CANDIDATES) {
            break;
          }

          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            continue;
          }
          if (rect.right > window.innerWidth * 0.38 || rect.height > 64) {
            continue;
          }

          const row = getDayRowContainer(element);
          if (!row) {
            continue;
          }

          const rowRect = row.getBoundingClientRect();
          candidates.push({
            row,
            score:
              (startsWithDay ? 2000 : 0) +
              (exactCompactMatch ? 1200 : 0) +
              Math.round(rowRect.width) -
              Math.round(Math.abs(rowRect.top - rect.top)) -
              Math.round(rect.left) -
              text.length
          });
        }

        candidates.sort((left, right) => right.score - left.score);
        return candidates[0]?.row || null;
      }

      async function findTargetDateRowWithScroll() {
        let row = findTargetDateRow();
        if (row) {
          return row;
        }

        const scrollRoots = getScrollableRoots();
        if (!scrollRoots.length) {
          return null;
        }

        for (const scrollRoot of scrollRoots) {
          const originalScrollTop = scrollRoot.scrollTop;
          const maxScrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
          const step = Math.max(120, Math.floor(scrollRoot.clientHeight * 0.75));
          const checkpoints = [];

          for (let y = 0; y <= maxScrollTop; y += step) {
            checkpoints.push(y);
          }
          if (!checkpoints.includes(maxScrollTop)) {
            checkpoints.push(maxScrollTop);
          }

          const visited = new Set();
          for (const rawY of checkpoints) {
            const y = clamp(Math.round(rawY), 0, maxScrollTop);
            if (visited.has(y)) {
              continue;
            }
            visited.add(y);
            scrollRoot.scrollTop = y;
            await wait(140);
            row = findTargetDateRow();
            if (row) {
              return row;
            }
          }

          scrollRoot.scrollTop = originalScrollTop;
          await wait(80);
          row = findTargetDateRow();
          if (row) {
            return row;
          }
        }

        return null;
      }

      function dispatchHover(target, clientX, clientY) {
        const hoverTarget = target || document.elementFromPoint(clientX, clientY);
        if (!(hoverTarget instanceof Element)) {
          return;
        }

        const baseOptions = {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          pageX: clientX + window.scrollX,
          pageY: clientY + window.scrollY,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          buttons: 0,
          button: 0,
          view: window
        };

        for (const type of ["pointerenter", "mouseenter", "pointerover", "mouseover", "pointermove", "mousemove"]) {
          const EventCtor = type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
          try {
            hoverTarget.dispatchEvent(new EventCtor(type, baseOptions));
          } catch {
            // noop
          }
        }
      }

      function collectRowHoverTargets(row) {
        const rowRect = row.getBoundingClientRect();
        const targets = [];
        for (const node of Array.from(row.querySelectorAll("*"))) {
          if (!isVisible(node)) {
            continue;
          }

          const rect = node.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 4) {
            continue;
          }
          if (rect.left < rowRect.left || rect.right > rowRect.right || rect.top < rowRect.top || rect.bottom > rowRect.bottom) {
            continue;
          }
          if (rect.left < window.innerWidth * 0.2) {
            continue;
          }

          const topBias = Math.max(0, rowRect.bottom - rect.top);
          targets.push({
            node,
            score: rect.width * rect.height + topBias * 16
          });
        }

        return targets
          .sort((left, right) => right.score - left.score)
          .slice(0, MAX_HOVER_TARGETS)
          .map((entry) => entry.node);
      }

      function buildProbePoints(rect, options = {}) {
        const horizontalSteps = Array.isArray(options.horizontalSteps) && options.horizontalSteps.length
          ? options.horizontalSteps
          : [0.2, 0.35, 0.5, 0.65, 0.8];
        const verticalSteps = Array.isArray(options.verticalSteps) && options.verticalSteps.length
          ? options.verticalSteps
          : [0.22, 0.38, 0.5];
        const points = [];
        for (const yStep of verticalSteps) {
          for (const xStep of horizontalSteps) {
            points.push({
              clientX: rect.left + rect.width * xStep,
              clientY: rect.top + rect.height * yStep
            });
          }
        }
        return points;
      }

      async function probeRowForTimelineText(row) {
        let bestFallbackCandidate = scanTimelineCandidate(row);
        if (bestFallbackCandidate?.isDetailed) {
          return bestFallbackCandidate.text;
        }

        for (const target of collectRowHoverTargets(row)) {
          const rect = target.getBoundingClientRect();
          const points = buildProbePoints(rect, {
            horizontalSteps: [0.18, 0.33, 0.5, 0.67, 0.82],
            verticalSteps: rect.height <= 18 ? [0.5] : [0.2, 0.38, 0.55]
          });
          for (const point of points) {
            dispatchHover(target, point.clientX, point.clientY);
            await wait(110);
            const tooltipCandidate = scanTimelineCandidate(document, {
              fresh: true,
              maxVisibleNodes: Math.floor(MAX_VISIBLE_SCAN_NODES / 2)
            });
            if (tooltipCandidate?.isDetailed) {
              return tooltipCandidate.text;
            }
            if (tooltipCandidate && (!bestFallbackCandidate || tooltipCandidate.score > bestFallbackCandidate.score)) {
              bestFallbackCandidate = tooltipCandidate;
            }
          }
        }

        const rowRect = row.getBoundingClientRect();
        const chartRect = {
          left: Math.max(rowRect.left + Math.min(rowRect.width * 0.26, 150), window.innerWidth * 0.22),
          top: rowRect.top + Math.min(14, rowRect.height * 0.16),
          width: Math.max(12, rowRect.right - Math.max(rowRect.left + Math.min(rowRect.width * 0.26, 150), window.innerWidth * 0.22) - 10),
          height: Math.max(12, Math.min(rowRect.height * 0.52, 36))
        };
        const rowPoints = buildProbePoints(chartRect, {
          horizontalSteps: [0.05, 0.12, 0.2, 0.28, 0.36, 0.44, 0.52, 0.6, 0.68, 0.76, 0.84, 0.92],
          verticalSteps: [0.18, 0.34, 0.5, 0.66]
        }).slice(0, MAX_CHART_PROBE_POINTS);
        for (const point of rowPoints) {
          dispatchHover(null, point.clientX, point.clientY);
          await wait(110);
          const tooltipCandidate = scanTimelineCandidate(document, {
            fresh: true,
            maxVisibleNodes: Math.floor(MAX_VISIBLE_SCAN_NODES / 2)
          });
          if (tooltipCandidate?.isDetailed) {
            return tooltipCandidate.text;
          }
          if (tooltipCandidate && (!bestFallbackCandidate || tooltipCandidate.score > bestFallbackCandidate.score)) {
            bestFallbackCandidate = tooltipCandidate;
          }
        }

        return bestFallbackCandidate?.text || "";
      }

      async function scanTimeline() {
        const pageUrl = String(location.href || "");
        const pageTitle = String(document.title || "");
        const todayDateKey = (() => {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, "0");
          const day = String(now.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        })();
        const allowVisibleFallback = String(targetDateKey || "") === todayDateKey;

        if (!document.body) {
          const loginResult = buildLoginRequiredResult(pageUrl, "", pageTitle);
          if (loginResult) {
            return loginResult;
          }
          return {
            ok: false,
            error: "Flex work record page is not ready yet."
          };
        }

        const bodyText = String(document.body.innerText || "");
        const loginResult = buildLoginRequiredResult(pageUrl, bodyText, pageTitle);
        if (loginResult) {
          return loginResult;
        }
        const summary = scanSummaryText(pageUrl, pageTitle, bodyText);

        const visibleTooltipCandidate = scanTimelineCandidate(document);
        const row = await findTargetDateRowWithScroll();
        if (!row) {
          if (allowVisibleFallback && (visibleTooltipCandidate?.text || summary)) {
            return {
              ok: true,
              tooltipText: visibleTooltipCandidate?.text || "",
              summary,
              title: pageTitle,
              url: pageUrl,
              extractedAt: Date.now()
            };
          }
          return {
            ok: false,
            error: `Could not find the row for ${String(targetDateKey || "the selected date")} on my-work-record.`,
            title: pageTitle,
            url: pageUrl
          };
        }

        await scrollRowIntoView(row);

        const rowSummary = scanRowSummaryText(row, pageUrl, pageTitle);
        const tooltipText = await probeRowForTimelineText(row);
        if (!tooltipText && allowVisibleFallback && (visibleTooltipCandidate?.text || summary)) {
          return {
            ok: true,
            tooltipText: visibleTooltipCandidate?.text || "",
            summary,
            title: pageTitle,
            url: pageUrl,
            extractedAt: Date.now()
          };
        }
        if (!tooltipText && rowSummary) {
          return {
            ok: true,
            tooltipText: "",
            summary: rowSummary,
            title: pageTitle,
            url: pageUrl,
            extractedAt: Date.now()
          };
        }
        if (!tooltipText) {
          return {
            ok: false,
            error: `Could not open a work record tooltip for ${String(targetDateKey || "the selected date")}.`,
            title: pageTitle,
            url: pageUrl
          };
        }

        return {
          ok: true,
          tooltipText,
          title: pageTitle,
          url: pageUrl,
          extractedAt: Date.now()
        };
      }

      const deadline = Date.now() + WAIT_MS;
      let lastResult = null;
      while (Date.now() <= deadline) {
        const result = await scanTimeline();
        lastResult = result;
        if (result.ok) {
          return result;
        }
        await wait(INTERVAL_MS);
      }

      return lastResult || { ok: false, error: "Flex work record scrape timed out." };
    },
    [queryDate],
    "Unable to run script in Flex work record tab."
  );

  const result = Array.isArray(results) && results.length > 0 ? results[0].result : null;
  if (!isPlainObject(result)) {
    throw new Error("Flex work record scrape returned no result.");
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
    throw new Error("Unable to extract work record timeline from Flex.");
  }

  const timeline = parseFlexWorkRecordTimelineText(result.tooltipText, queryDate);
  if (!timeline && !isPlainObject(result.summary)) {
    throw new Error("Unable to parse work record timeline from Flex tooltip text.");
  }

  return {
    timeline,
    summary: isPlainObject(result.summary) ? result.summary : null,
    sourceUrl: normalizeText(result.url),
    pageTitle: normalizeText(result.title),
    extractedAt: Math.max(1, Math.round(Number(result.extractedAt) || Date.now()))
  };
}

export async function fetchFlexHomeScrapeRows(config, queryDate, scrapeFlowState = null) {
  const targetUrl = parseFlexHomeTargetUrl(config.flexHomeUrl);
  const extracted = await fetchFlexScrapePayload({
    config,
    scrapeFlowState,
    scrapeKey: "home",
    targetUrl,
    findTab: findFlexHomeTab,
    missingTabMessage: `No Flex Home tab found for ${targetUrl.toString()}. Open it first or enable "Open Flex tab if missing".`,
    inaccessibleTabMessage: "Unable to access Flex Home tab.",
    extractPayload: extractFlexHomeWorktimeFromTab
  });
  return [normalizeFlexHomeScrapeRow(extracted, queryDate, targetUrl.toString())];
}

export async function fetchFlexWorkRecordTimeline(config, queryDate, scrapeFlowState = null) {
  const targetUrl = buildFlexWorkRecordTargetUrl(config.flexHomeUrl);
  return fetchFlexScrapePayload({
    config,
    scrapeFlowState,
    scrapeKey: "workRecord",
    targetUrl,
    findTab: findFlexWorkRecordTab,
    missingTabMessage: `No Flex work record tab found for ${targetUrl.toString()}. Open it first or enable "Open Flex tab if missing".`,
    inaccessibleTabMessage: "Unable to access Flex work record tab.",
    extractPayload: (tabId) => extractFlexWorkRecordTimelineFromTab(tabId, queryDate)
  });
}

export async function fetchFlexWorkRecordRows(config, queryDate, scrapeFlowState = null) {
  const targetUrl = buildFlexWorkRecordTargetUrl(config.flexHomeUrl);
  const timeline = await fetchFlexWorkRecordTimeline(config, queryDate, scrapeFlowState);
  return [normalizeFlexWorkRecordRow(timeline, queryDate, targetUrl.toString())];
}

async function fetchRowsBySource(config, queryDate, scrapeFlowState = null) {
  return fetchFlexWorkRecordRows(config, queryDate, scrapeFlowState);
}

export const flexWorktimeTimelineWidget = {
  type: "flexWorktimeTimeline",
  title: "Flex Worktime History",
  defaultConfig: {
    flexHomeUrl: "https://flex.team/home",
    openFlexTabIfMissing: true,
    dateMode: "today",
    customDate: "",
    refreshMinutes: DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES,
    detailUrlTemplate: "",
    openInNewTab: true
  },
  defaultLayout: {
    x: 660,
    y: 220,
    w: 300,
    h: 220
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [
    {
      key: "flexHomeUrl",
      label: "Flex URL",
      type: "text",
      placeholder: "https://flex.team/home",
      helpText: "Reads the daily history from flex.team/time-tracking/my-work-record. /home and /time-tracking/my-work-record are both accepted."
    },
    {
      key: "openFlexTabIfMissing",
      label: "Open Flex tab if missing",
      type: "checkbox",
      helpText: "If enabled, the widget opens and reuses a background Flex Work Record tab for history scraping."
    },
    {
      key: "dateMode",
      label: "Date mode",
      type: "select",
      options: [
        { value: "today", label: "Today" },
        { value: "yesterday", label: "Yesterday" },
        { value: "tomorrow", label: "Tomorrow" },
        { value: "custom", label: "Custom" }
      ],
      helpText: "Choose which day to read from my-work-record."
    },
    {
      key: "customDate",
      label: "Custom date",
      type: "text",
      placeholder: "YYYY-MM-DD",
      helpText: "Used when Date mode is set to Custom."
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
    container.classList.add("flex-worktime-widget");

    const shell = document.createElement("div");
    shell.className = "flex-worktime-shell";
    shell.tabIndex = 0;
    shell.setAttribute("aria-label", "Flex Worktime History");

    const toolbar = document.createElement("div");
    toolbar.className = "flex-worktime-toolbar";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "icon-btn flex-worktime-refresh-btn";
    refreshBtn.title = "Refresh flex worktime history";
    refreshBtn.setAttribute("aria-label", "Refresh flex worktime history");
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
    const scrapeFlowState = { reusableTabId: null, reusableTabIds: {} };

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
      const timeline = isPlainObject(primaryRow?.rawEntry?.timeline) ? primaryRow.rawEntry.timeline : null;
      const timelineSegments = buildFlexTimelineSegments(timeline);

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

      // Top line: duration and status
      const topLine = document.createElement("div");
      topLine.style.display = "flex";
      topLine.style.justifyContent = "space-between";
      topLine.style.alignItems = "baseline";
      topLine.style.width = "100%";

      const duration = document.createElement("p");
      duration.className = "flex-worktime-duration";
      duration.textContent = normalizeText(primaryRow?.durationLabel, "--");

      const statusLabel = normalizeText(primaryRow?.status);
      if (statusLabel) {
        const statusText = document.createElement("span");
        statusText.className = "flex-worktime-row-status";
        statusText.textContent = statusLabel;
        statusText.title = statusLabel;
        statusText.setAttribute("aria-label", `Status ${statusLabel}`);
        topLine.append(duration, statusText);
      } else {
        topLine.append(duration);
      }

      // Sync text on its own line, aligned to the right
      const syncText = document.createElement("span");
      syncText.className = `flex-worktime-sync is-${syncState.tone}`;
      syncText.textContent = syncState.label;
      syncText.title = syncState.tooltip;
      syncText.style.alignSelf = "flex-end";
      syncText.style.width = "100%";
      syncText.style.textAlign = "right";

      entry.append(topLine, syncText);

      if (timelineSegments.length > 0) {
        const viewportStartMinutes = timelineSegments[0].startMinutes;
        const viewportEndMinutes = timelineSegments[timelineSegments.length - 1].endMinutes;
        const viewportSpanMinutes = Math.max(1, viewportEndMinutes - viewportStartMinutes);
        const timelineBlock = document.createElement("div");
        timelineBlock.className = "flex-worktime-timeline";
        timelineBlock.title = normalizeText(timeline?.sourceText, "Today's work/break timeline");

        const timelineCaption = document.createElement("div");
        timelineCaption.className = "flex-worktime-timeline-caption";
        timelineCaption.textContent = formatTimelineCaption(queryDate);

        const track = document.createElement("div");
        track.className = "flex-worktime-timeline-track";
        for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
          const tick = document.createElement("span");
          tick.className = "flex-worktime-timeline-tick";
          tick.style.left = `${ratio * 100}%`;
          track.append(tick);
        }

        for (const segment of timelineSegments) {
          const segmentEl = document.createElement("span");
          segmentEl.className = `flex-worktime-timeline-segment is-${segment.type}${segment.isActive ? " is-active" : ""}`;
          const normalizedStartPercent = clamp(((segment.startMinutes - viewportStartMinutes) / viewportSpanMinutes) * 100, 0, 100);
          const normalizedWidthPercent = clamp(((segment.endMinutes - segment.startMinutes) / viewportSpanMinutes) * 100, 0, 100);
          segmentEl.style.left = `${normalizedStartPercent}%`;
          segmentEl.style.width = `${Math.max(normalizedWidthPercent, 1.25)}%`;
          segmentEl.title = `${segment.type === "break" ? "Break" : "Work"} ${segment.startLabel}-${segment.endLabel}`;
          track.append(segmentEl);
        }

        const labels = document.createElement("div");
        labels.className = "flex-worktime-timeline-labels";

        const startLabel = document.createElement("span");
        startLabel.className = "flex-worktime-timeline-label";
        startLabel.textContent = timelineSegments[0].startLabel;

        const endLabel = document.createElement("span");
        endLabel.className = "flex-worktime-timeline-label";
        endLabel.textContent = timelineSegments[timelineSegments.length - 1].endLabel;

        labels.append(startLabel, endLabel);
        timelineBlock.append(timelineCaption, track, labels);
        entry.append(timelineBlock);
      }

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
      const previousRequestSig = lastRequestSig;

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
      if (nextRequestSig !== previousRequestSig) {
        rows = [];
        lastSyncedAt = 0;
      }
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
        scrapeFlowState.reusableTabIds = {};
      },
      openDetail(entry) {
        return openDetailInternal(entry);
      }
    };
  }
};
