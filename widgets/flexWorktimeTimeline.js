import { normalizeErrorMessage } from "../core/utils/error.js";
import { parseJsonOrNull } from "../core/utils/json.js";
import { clamp, normalizeIntegerInRange, toFiniteNumber } from "../core/utils/number.js";
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
import { pruneCacheIndex, touchCacheIndex } from "./shared/localStorageCacheIndex.js";

const FLEX_WORKTIME_CACHE_PREFIX = "s3newtab:flex-worktime-timeline-cache:v1";
const FLEX_WORKTIME_CACHE_MAX_ENTRIES = 24;
const FLEX_WORKTIME_CACHE_INDEX_KEY = `${FLEX_WORKTIME_CACHE_PREFIX}:__index__`;
const FLEX_WORKTIME_CACHE_INDEX_OPTIONS = {
  prefix: `${FLEX_WORKTIME_CACHE_PREFIX}:`,
  indexKey: FLEX_WORKTIME_CACHE_INDEX_KEY
};
const FLEX_HOME_TAB_LOAD_TIMEOUT_MS = 20000;
const DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES = 1;
const DEFAULT_FLEX_HOME_URL = "https://flex.team/home";
const DEFAULT_FLEX_WORK_RECORD_PATH = "/time-tracking/my-work-record";
const FLEX_HOME_ALLOWED_HOSTS = new Set(["flex.team", "www.flex.team"]);
const FLEX_AUTH_REQUIRED_CODE = "FLEX_AUTH_REQUIRED";
const FLEX_AUTH_LOGIN_PATH_RE = /^\/auth\/login(?:\/|$)/i;
const FLEX_AUTH_PATH_RE = /^\/auth(?:\/|$)/i;
const FLEX_WORK_RECORD_PATH_RE = /^\/time-tracking\/my-work-record(?:\/|$)/i;
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
const FLEX_TIMELINE_TOOLTIP_LABEL_RE = /(기록\s*시작|기록\s*종료|휴게\s*기록)/u;
const FLEX_TIMELINE_TOOLTIP_SUMMARY_RE = /(?:오전|오후)\s*\d{1,2}:\d{2}.*휴게\s*(?:없음|0\s*분)/u;
const FLEX_TIMELINE_TIME_TOKEN_RE = /((?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}|기록\s*중)/gu;
const DATE_MODE_VALUES = new Set(["today", "yesterday", "tomorrow", "custom"]);

const NAME_FIELDS = [
  "employeeName",
  "name",
  "userName",
  "username",
  "fullName",
  "employee",
  "staffName",
  "memberName",
  "displayName"
];

const STATUS_FIELDS = [
  "status",
  "workStatus",
  "attendanceStatus",
  "state",
  "resultStatus",
  "workState"
];

const IN_TIME_FIELDS = [
  "workIn",
  "startAt",
  "clockIn",
  "workStart",
  "inTime",
  "checkIn",
  "startTime",
  "work_in",
  "clock_in"
];

const OUT_TIME_FIELDS = [
  "workOut",
  "endAt",
  "clockOut",
  "workEnd",
  "outTime",
  "checkOut",
  "endTime",
  "work_out",
  "clock_out"
];

const NOTE_FIELDS = ["note", "memo", "remark", "description", "comment", "message", "reason"];

const ID_FIELDS = ["id", "entryId", "recordId", "employeeId", "userId", "memberId", "uuid"];

const DURATION_MINUTE_FIELDS = [
  "workedMinutes",
  "workMinutes",
  "durationMinutes",
  "totalMinutes",
  "minutes",
  "minute"
];

const DURATION_HOUR_FIELDS = ["workedHours", "workHours", "durationHours", "totalHours", "hours", "hour"];

const DURATION_GENERIC_FIELDS = [
  "duration",
  "workDuration",
  "totalDuration",
  "durationText",
  "elapsed"
];


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

function normalizeRefreshMinutes(value, fallback = 10) {
  return normalizeIntegerInRange(value, fallback, 1, 720);
}

function normalizeFlexHomeUrl(value, fallback = DEFAULT_FLEX_HOME_URL) {
  const text = normalizeText(value, fallback);
  return text || DEFAULT_FLEX_HOME_URL;
}

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

function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatClockMinutes(totalMinutes) {
  const minutes = clamp(Math.floor(Number(totalMinutes) || 0), 0, 1439);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeOfDayMinutes(value) {
  const text = normalizeText(value);
  const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return hour * 60 + minute;
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

function formatTimeFromRef(timeRef) {
  if (!timeRef) {
    return "--";
  }
  if (timeRef.type === "minute") {
    return formatClockMinutes(timeRef.value);
  }
  if (timeRef.type === "timestamp") {
    return new Date(timeRef.value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  return "--";
}

function formatDurationMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remains = minutes % 60;
  if (hours > 0 && remains > 0) {
    return `${hours}h ${remains}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remains}m`;
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

function formatSyncedLabel(timestampMs) {
  const ts = Number(timestampMs);
  if (!Number.isFinite(ts) || ts <= 0) {
    return "";
  }
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function sourceModeLabel() {
  return "Flex Work Record scrape";
}

function formatSourceError(config, error) {
  const prefix = sourceModeLabel();
  const message = normalizeErrorMessage(error);
  if (!message) {
    return `${prefix} failed.`;
  }
  if (message.toLowerCase().startsWith(prefix.toLowerCase())) {
    return message;
  }
  return `${prefix}: ${message}`;
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

function requestSignature(config, queryDate) {
  return `${configSignature(config)}|${normalizeText(queryDate)}`;
}

function flexWorktimeCacheStorageKey(config, queryDate) {
  const encodedSignature = encodeURIComponent(configSignature(config));
  const encodedDate = encodeURIComponent(normalizeText(queryDate));
  return `${FLEX_WORKTIME_CACHE_PREFIX}:${encodedSignature}:${encodedDate}`;
}

function sanitizePlaceholderMap(source) {
  if (!isPlainObject(source)) {
    return {};
  }

  const out = {};
  for (const [key, rawValue] of Object.entries(source)) {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) {
      continue;
    }
    if (rawValue === null || rawValue === undefined) {
      continue;
    }
    if (typeof rawValue === "object") {
      continue;
    }
    const textValue = String(rawValue);
    out[normalizedKey] = textValue;
  }
  return out;
}

function normalizeCachedRow(entry) {
  if (!isPlainObject(entry)) {
    return null;
  }

  const name = normalizeText(entry.name);
  const id = normalizeText(entry.id, name);
  if (!id && !name) {
    return null;
  }

  return {
    id: id || name || "entry",
    name: name || "Unknown",
    status: normalizeText(entry.status),
    inLabel: normalizeText(entry.inLabel, "--"),
    outLabel: normalizeText(entry.outLabel, "--"),
    durationLabel: normalizeText(entry.durationLabel, "--"),
    note: normalizeText(entry.note),
    placeholders: sanitizePlaceholderMap(entry.placeholders),
    rawEntry: isPlainObject(entry.rawEntry) ? entry.rawEntry : {}
  };
}

function toCachedRow(row) {
  return {
    id: normalizeText(row?.id),
    name: normalizeText(row?.name),
    status: normalizeText(row?.status),
    inLabel: normalizeText(row?.inLabel, "--"),
    outLabel: normalizeText(row?.outLabel, "--"),
    durationLabel: normalizeText(row?.durationLabel, "--"),
    note: normalizeText(row?.note),
    placeholders: sanitizePlaceholderMap(row?.placeholders),
    rawEntry: isPlainObject(row?.rawEntry) ? row.rawEntry : {}
  };
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

function normalizeValueText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return normalizeText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isPlainObject(value)) {
    const fromLabel = normalizeText(value.label);
    if (fromLabel) {
      return fromLabel;
    }
    const fromName = normalizeText(value.name);
    if (fromName) {
      return fromName;
    }
    const fromText = normalizeText(value.text);
    if (fromText) {
      return fromText;
    }
    const fromValue = normalizeText(value.value);
    if (fromValue) {
      return fromValue;
    }
  }
  return "";
}

function lowerKeyMap(entry) {
  const map = new Map();
  for (const [key, value] of Object.entries(entry || {})) {
    if (!map.has(key.toLowerCase())) {
      map.set(key.toLowerCase(), value);
    }
  }
  return map;
}

function pickEntryValue(entry, keyMap, candidates) {
  for (const key of candidates) {
    if (hasOwn(entry, key)) {
      return entry[key];
    }
    const lowerKey = key.toLowerCase();
    if (keyMap.has(lowerKey)) {
      return keyMap.get(lowerKey);
    }
  }
  return undefined;
}

function parseTimeReference(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return { type: "timestamp", value: value.getTime() };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    if (value >= 0 && value <= 24 && Number.isInteger(value)) {
      const minuteValue = value * 60;
      return { type: "minute", value: clamp(minuteValue, 0, 1439) };
    }

    if (value >= 0 && value <= 1440) {
      const minuteValue = Math.floor(value);
      return { type: "minute", value: clamp(minuteValue, 0, 1439) };
    }

    if (value > 1440 && value <= 86400) {
      const minuteValue = Math.floor(value / 60);
      return { type: "minute", value: clamp(minuteValue, 0, 1439) };
    }

    const ts = value < 1e11 ? value * 1000 : value;
    const date = new Date(ts);
    if (Number.isFinite(date.getTime())) {
      return { type: "timestamp", value: date.getTime() };
    }

    return null;
  }

  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const minuteValue = parseTimeOfDayMinutes(text);
  if (minuteValue !== null) {
    return { type: "minute", value: minuteValue };
  }

  const numericText = Number(text);
  if (Number.isFinite(numericText)) {
    return parseTimeReference(numericText);
  }

  const parsedTimestamp = Date.parse(text);
  if (Number.isFinite(parsedTimestamp)) {
    return { type: "timestamp", value: parsedTimestamp };
  }

  return null;
}

function parseGenericDurationMinutes(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    if (value > 86400) {
      return Math.round(value / 60000);
    }
    if (value > 1440) {
      return Math.round(value / 60);
    }
    if (value <= 24) {
      return Math.round(value * 60);
    }
    return Math.round(value);
  }

  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const clockMatch = text.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (clockMatch) {
    const hours = Number(clockMatch[1]);
    const minutes = Number(clockMatch[2]);
    const seconds = Number(clockMatch[3] || 0);
    if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return Math.round(hours * 60 + minutes + seconds / 60);
    }
  }

  const unitMatch = text
    .toLowerCase()
    .match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/);
  if (unitMatch) {
    const hours = toFiniteNumber(unitMatch[1], 0) || 0;
    const minutes = toFiniteNumber(unitMatch[2], 0) || 0;
    if (hours > 0 || minutes > 0) {
      return Math.round(hours * 60 + minutes);
    }
  }

  const numericText = Number(text);
  if (Number.isFinite(numericText)) {
    return parseGenericDurationMinutes(numericText);
  }

  return null;
}

function diffMinutesFromRefs(inRef, outRef) {
  if (!inRef || !outRef) {
    return null;
  }

  if (inRef.type === "timestamp" && outRef.type === "timestamp") {
    const minutes = Math.round((outRef.value - inRef.value) / 60000);
    return Math.max(0, minutes);
  }

  if (inRef.type === "minute" && outRef.type === "minute") {
    let minutes = outRef.value - inRef.value;
    if (minutes < 0) {
      minutes += 24 * 60;
    }
    return Math.max(0, minutes);
  }

  return null;
}

function appendPrimitivePlaceholders(target, source, prefix = "", depth = 0) {
  if (!isPlainObject(source) || depth > 1) {
    return;
  }

  for (const [key, rawValue] of Object.entries(source)) {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) {
      continue;
    }

    const composedKey = `${prefix}${normalizedKey}`;
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    if (isPlainObject(rawValue) && depth < 1) {
      appendPrimitivePlaceholders(target, rawValue, `${composedKey}.`, depth + 1);
      continue;
    }

    if (typeof rawValue === "object") {
      continue;
    }

    target[composedKey] = String(rawValue);
  }
}

function normalizeWorktimeRow(entry, index) {
  const source = isPlainObject(entry) ? entry : {};
  const keyMap = lowerKeyMap(source);

  const nameValue = pickEntryValue(source, keyMap, NAME_FIELDS);
  const statusValue = pickEntryValue(source, keyMap, STATUS_FIELDS);
  const inValue = pickEntryValue(source, keyMap, IN_TIME_FIELDS);
  const outValue = pickEntryValue(source, keyMap, OUT_TIME_FIELDS);
  const noteValue = pickEntryValue(source, keyMap, NOTE_FIELDS);
  const idValue = pickEntryValue(source, keyMap, ID_FIELDS);

  const inRef = parseTimeReference(inValue);
  const outRef = parseTimeReference(outValue);

  const minuteDurationField = pickEntryValue(source, keyMap, DURATION_MINUTE_FIELDS);
  const hourDurationField = pickEntryValue(source, keyMap, DURATION_HOUR_FIELDS);
  const genericDurationField = pickEntryValue(source, keyMap, DURATION_GENERIC_FIELDS);

  const explicitMinutes = toFiniteNumber(minuteDurationField, null);
  const explicitHours = toFiniteNumber(hourDurationField, null);
  const genericMinutes = parseGenericDurationMinutes(genericDurationField);

  let durationMinutes = null;
  if (explicitMinutes !== null) {
    durationMinutes = Math.max(0, Math.round(explicitMinutes));
  } else if (explicitHours !== null) {
    durationMinutes = Math.max(0, Math.round(explicitHours * 60));
  } else if (genericMinutes !== null) {
    durationMinutes = Math.max(0, Math.round(genericMinutes));
  } else {
    durationMinutes = diffMinutesFromRefs(inRef, outRef);
  }

  const name = normalizeText(normalizeValueText(nameValue), `Entry ${index + 1}`);
  const statusText = normalizeText(normalizeValueText(statusValue));
  const status =
    statusText || (outRef ? "Checked out" : inRef ? "Checked in" : durationMinutes !== null ? "Recorded" : "");
  const note = normalizeText(normalizeValueText(noteValue));

  const row = {
    id: normalizeText(normalizeValueText(idValue), `${name}-${index + 1}`),
    name,
    status,
    inLabel: formatTimeFromRef(inRef),
    outLabel: formatTimeFromRef(outRef),
    durationLabel: durationMinutes === null ? "--" : formatDurationMinutes(durationMinutes),
    note,
    placeholders: {},
    rawEntry: source
  };

  const placeholders = {};
  appendPrimitivePlaceholders(placeholders, source);
  placeholders.id = row.id;
  placeholders.name = row.name;
  placeholders.status = row.status;
  placeholders.in = row.inLabel;
  placeholders.out = row.outLabel;
  placeholders.duration = row.durationLabel;
  placeholders.note = row.note;
  row.placeholders = sanitizePlaceholderMap(placeholders);

  return row;
}

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

function isAllowedFlexWorkRecordPath(pathname) {
  const path = comparablePath(pathname || "/");
  return FLEX_WORK_RECORD_PATH_RE.test(path);
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

function normalizeTabId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const tabId = Number(value);
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
}

function getReusableScrapeTabId(scrapeFlowState) {
  return getReusableScrapeTabIdByKey(scrapeFlowState, "home");
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

function setReusableScrapeTabId(scrapeFlowState, tabId) {
  setReusableScrapeTabIdByKey(scrapeFlowState, "home", tabId);
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

function buildFlexWorkRecordTargetUrl(value) {
  const parsed = parseFlexScrapeBaseTargetUrl(value);
  parsed.pathname = DEFAULT_FLEX_WORK_RECORD_PATH;
  parsed.search = "";
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

function normalizeFlexHomeScrapeRow(scraped, queryDate, flexHomeUrl) {
  const duration = normalizeText(scraped?.duration);
  const status = normalizeText(scraped?.status, "상태 확인 필요");
  const line = normalizeText(scraped?.line);
  const combined = normalizeText(`${status} ${duration}`);
  const note = line && line !== combined ? line : "";

  const rawEntry = {
    sourceMode: "flexHomeScrape",
    queryDate: normalizeText(queryDate),
    sourceUrl: normalizeText(scraped?.url, flexHomeUrl),
    pageTitle: normalizeText(scraped?.title),
    extractedAt: Math.max(1, Math.round(Number(scraped?.extractedAt) || Date.now())),
    status,
    duration,
    line
  };

  const row = {
    id: `flex-home-${normalizeText(queryDate, toLocalDateKey(new Date()))}`,
    name: "Flex Home",
    status,
    inLabel: "--",
    outLabel: "--",
    durationLabel: duration || "--",
    note,
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
    sourceMode: "flexHomeScrape",
    queryDate: normalizeText(queryDate),
    flexHomeUrl: rawEntry.sourceUrl,
    pageTitle: rawEntry.pageTitle
  });

  return row;
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
    extractPayload: (tabId) => extractFlexHomeWorktimeFromTab(tabId)
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
