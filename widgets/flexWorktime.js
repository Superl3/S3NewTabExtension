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
const DEFAULT_SOURCE_MODE = "flexHomeScrape";
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

const SOURCE_MODE_VALUES = new Set(["flexHomeScrape", "api"]);
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return normalizeText(error, "Unknown error");
  }
  if (typeof error.message === "string") {
    return normalizeText(error.message, "Unknown error");
  }
  return "Unknown error";
}

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

function tryParseJson(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key);
}

function asFiniteNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeRefreshMinutes(value, fallback = 10) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 720);
  }
  return clamp(Math.round(num), 1, 720);
}

function normalizeSourceMode(value, fallback = DEFAULT_SOURCE_MODE) {
  const mode = normalizeText(value, fallback);
  return SOURCE_MODE_VALUES.has(mode) ? mode : fallback;
}

function hasLegacyApiFields(config) {
  if (!isPlainObject(config)) {
    return false;
  }

  return ["apiUrlTemplate", "authHeaderName", "authTokenPrefix", "accessToken", "dateMode", "customDate"]
    .some((key) => hasOwn(config, key));
}

function resolveSourceMode(config, fallback = DEFAULT_SOURCE_MODE) {
  if (isPlainObject(config) && hasOwn(config, "sourceMode")) {
    const explicitMode = normalizeText(config.sourceMode);
    if (SOURCE_MODE_VALUES.has(explicitMode)) {
      return explicitMode;
    }
  }

  if (hasLegacyApiFields(config)) {
    return "api";
  }

  return fallback;
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

function normalizeHeaderName(value, fallback = "Authorization") {
  const text = normalizeText(value, fallback).replace(/[\r\n]/g, "").trim();
  return text || fallback;
}

function tokenFingerprint(token) {
  const text = normalizeText(token);
  let checksum = 0;
  for (let index = 0; index < text.length; index += 1) {
    checksum = (checksum + text.charCodeAt(index) * (index + 1)) % 1000000007;
  }
  return `${text.length}:${checksum}`;
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

function sourceModeLabel(value) {
  return normalizeSourceMode(value, DEFAULT_SOURCE_MODE) === "api" ? "API" : "Flex Home scrape";
}

function formatSourceError(config, error) {
  const prefix = sourceModeLabel(config?.sourceMode);
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
    resolveSourceMode(config, DEFAULT_SOURCE_MODE),
    normalizeText(config.flexHomeUrl),
    config.openFlexTabIfMissing ? 1 : 0,
    normalizeText(config.apiUrlTemplate),
    normalizeText(config.authHeaderName).toLowerCase(),
    normalizeText(config.authTokenPrefix),
    tokenFingerprint(config.accessToken)
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

  const parsed = tryParseJson(raw);
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
    if (Object.prototype.hasOwnProperty.call(entry, key)) {
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
    const hours = asFiniteNumber(unitMatch[1], 0) || 0;
    const minutes = asFiniteNumber(unitMatch[2], 0) || 0;
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

  const explicitMinutes = asFiniteNumber(minuteDurationField, null);
  const explicitHours = asFiniteNumber(hourDurationField, null);
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

function findArrayCandidate(candidate) {
  if (Array.isArray(candidate)) {
    return { found: true, items: candidate };
  }
  if (!isPlainObject(candidate)) {
    return { found: false, items: [] };
  }

  for (const key of ["items", "records", "data"]) {
    if (Array.isArray(candidate[key])) {
      return { found: true, items: candidate[key] };
    }
  }

  return { found: false, items: [] };
}

function extractRecords(payload) {
  const direct = findArrayCandidate(payload);
  if (direct.found) {
    return direct.items;
  }

  if (isPlainObject(payload)) {
    for (const key of ["items", "records", "data"]) {
      const nested = findArrayCandidate(payload[key]);
      if (nested.found) {
        return nested.items;
      }
    }

    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
}

function parseResponseErrorMessage(bodyText, status) {
  const fallback = normalizeText(bodyText, `Flex worktime request failed: HTTP ${status}`);
  const payload = tryParseJson(bodyText);
  if (!isPlainObject(payload)) {
    return fallback;
  }

  const message =
    normalizeText(payload.message) ||
    normalizeText(payload.error) ||
    normalizeText(payload.errorMessage) ||
    normalizeText(payload.detail);

  return message || fallback;
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
  if (resolveSourceMode(config, DEFAULT_SOURCE_MODE) === "flexHomeScrape") {
    return toLocalDateKey(new Date());
  }
  return resolveQueryDate(config);
}

function normalizedConfig(config) {
  return {
    sourceMode: resolveSourceMode(config, DEFAULT_SOURCE_MODE),
    flexHomeUrl: normalizeFlexHomeUrl(config?.flexHomeUrl, DEFAULT_FLEX_HOME_URL),
    openFlexTabIfMissing: config?.openFlexTabIfMissing !== false,
    apiUrlTemplate: normalizeText(config?.apiUrlTemplate, "https://api.example.com/flex-worktime?date={date}"),
    authHeaderName: normalizeHeaderName(config?.authHeaderName, "Authorization"),
    authTokenPrefix: normalizeText(config?.authTokenPrefix, "Bearer"),
    accessToken: normalizeText(config?.accessToken),
    dateMode: normalizeDateMode(config?.dateMode, "today"),
    customDate: normalizeIsoDate(config?.customDate),
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES),
    detailUrlTemplate: normalizeText(config?.detailUrlTemplate),
    openInNewTab: config?.openInNewTab !== false
  };
}

function buildApiUrl(config, queryDate) {
  const template = normalizeText(config.apiUrlTemplate);
  if (!template) {
    throw new Error("API URL template is required.");
  }

  if (!template.includes("{date}")) {
    throw new Error("API URL template must include {date} placeholder.");
  }

  const replaced = template.replace(/\{date\}/g, encodeURIComponent(queryDate));

  let parsed;
  try {
    parsed = new URL(replaced);
  } catch {
    throw new Error("API URL template resolved to an invalid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("API URL template must use http or https.");
  }

  return parsed.toString();
}

function buildHeaders(config) {
  const headers = {
    Accept: "application/json"
  };

  const token = normalizeText(config.accessToken);
  if (!token) {
    return headers;
  }

  const headerName = normalizeHeaderName(config.authHeaderName, "Authorization");
  const prefix = normalizeText(config.authTokenPrefix);
  headers[headerName] = prefix ? `${prefix} ${token}` : token;
  return headers;
}

async function fetchWorktimeRows(config, queryDate) {
  const apiUrl = buildApiUrl(config, queryDate);
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: buildHeaders(config),
    cache: "no-store"
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(parseResponseErrorMessage(responseText, response.status));
  }

  const payload = tryParseJson(responseText);
  if (payload === null && normalizeText(responseText)) {
    throw new Error("Flex worktime response parse failed.");
  }

  const records = extractRecords(payload);
  return records.map((entry, index) => normalizeWorktimeRow(entry, index)).filter(Boolean);
}

function ensureFlexHomeScrapeApis() {
  const hasApis =
    typeof chrome !== "undefined" &&
    Boolean(chrome?.tabs) &&
    Boolean(chrome?.scripting) &&
    typeof chrome.tabs.query === "function" &&
    typeof chrome.tabs.create === "function" &&
    typeof chrome.tabs.get === "function" &&
    typeof chrome.tabs.update === "function" &&
    typeof chrome.tabs.remove === "function" &&
    Boolean(chrome.tabs.onUpdated) &&
    typeof chrome.scripting.executeScript === "function";

  if (!hasApis) {
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

function normalizeTabId(value) {
  const tabId = Number(value);
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
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

function fromChromeCallback(run, fallbackMessage) {
  return new Promise((resolve, reject) => {
    try {
      run((result) => {
        const runtimeError = normalizeText(chrome?.runtime?.lastError?.message);
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }
        resolve(result);
      });
    } catch (error) {
      if (error instanceof Error) {
        reject(error);
        return;
      }
      reject(new Error(fallbackMessage));
    }
  });
}

function queryTabs(queryInfo) {
  return fromChromeCallback((callback) => chrome.tabs.query(queryInfo, callback), "Unable to query browser tabs.");
}

function getTab(tabId) {
  return fromChromeCallback((callback) => chrome.tabs.get(tabId, callback), "Unable to read browser tab state.");
}

async function getTabIfExists(tabId) {
  try {
    return await getTab(tabId);
  } catch {
    return null;
  }
}

function createTab(createProperties) {
  return fromChromeCallback((callback) => chrome.tabs.create(createProperties, callback), "Unable to open Flex Home tab.");
}

function updateTab(tabId, updateProperties) {
  return fromChromeCallback(
    (callback) => chrome.tabs.update(tabId, updateProperties, callback),
    "Unable to activate temporary Flex Home tab."
  );
}

function removeTab(tabId) {
  return fromChromeCallback((callback) => chrome.tabs.remove(tabId, callback), "Unable to close temporary Flex Home tab.");
}

function executeScriptInTab(tabId, func) {
  return fromChromeCallback(
    (callback) => chrome.scripting.executeScript({ target: { tabId }, func }, callback),
    "Unable to run script in Flex Home tab."
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

function waitForTabReady(tabId, timeoutMs = FLEX_HOME_TAB_LOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    let updatedListener = null;

    function cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (updatedListener) {
        try {
          chrome.tabs.onUpdated.removeListener(updatedListener);
        } catch {
          // noop
        }
        updatedListener = null;
      }
    }

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }

    updatedListener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (changeInfo.status === "complete" || tab?.status === "complete") {
        finish();
      }
    };

    try {
      chrome.tabs.onUpdated.addListener(updatedListener);
    } catch {
      finish(new Error("Unable to subscribe to Flex Home tab updates."));
      return;
    }

    timeoutId = setTimeout(() => {
      finish(new Error("Timed out waiting for Flex Home tab to finish loading."));
    }, Math.max(1000, Number(timeoutMs) || FLEX_HOME_TAB_LOAD_TIMEOUT_MS));

    void getTab(tabId)
      .then((tab) => {
        if (tab?.status === "complete") {
          finish();
        }
      })
      .catch((error) => {
        finish(error);
      });
  });
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

async function fetchFlexHomeScrapeRows(config, queryDate, scrapeFlowState = null) {
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
    await waitForTabReady(tabId, FLEX_HOME_TAB_LOAD_TIMEOUT_MS);
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
  if (resolveSourceMode(config, DEFAULT_SOURCE_MODE) === "api") {
    return fetchWorktimeRows(config, queryDate);
  }
  return fetchFlexHomeScrapeRows(config, queryDate, scrapeFlowState);
}

function resolvePathValue(source, path) {
  if (!path) {
    return undefined;
  }

  if (isPlainObject(source) && Object.prototype.hasOwnProperty.call(source, path)) {
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
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
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
    sourceMode: "flexHomeScrape",
    flexHomeUrl: "https://flex.team/home",
    openFlexTabIfMissing: true,
    apiUrlTemplate: "https://api.example.com/flex-worktime?date={date}",
    authHeaderName: "Authorization",
    authTokenPrefix: "Bearer",
    accessToken: "",
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
    h: 150
  },
  defaultGridSize: {
    w: 2,
    h: 1
  },
  settingsSchema: [
    {
      key: "sourceMode",
      label: "Source mode",
      type: "select",
      options: [
        { value: "flexHomeScrape", label: "Flex Home scrape (default)" },
        { value: "api", label: "API" }
      ],
      helpText: "Flex Home scrape reads visible text from your logged-in flex.team/home tab. API mode keeps the previous endpoint flow."
    },
    {
      key: "flexHomeUrl",
      label: "Flex Home URL",
      type: "text",
      placeholder: "https://flex.team/home",
      helpText: "Used only in Flex Home scrape mode."
    },
    {
      key: "openFlexTabIfMissing",
      label: "Open Flex tab if missing",
      type: "checkbox",
      helpText: "If enabled, the widget opens Flex Home in a background tab, scrapes, then closes it."
    },
    {
      key: "apiUrlTemplate",
      label: "API URL template",
      type: "text",
      placeholder: "https://api.example.com/flex-worktime?date={date}",
      helpText: "Used in API mode. Include {date}, for example ...?date={date}."
    },
    {
      key: "authHeaderName",
      label: "Auth header name",
      type: "text",
      placeholder: "Authorization"
    },
    {
      key: "authTokenPrefix",
      label: "Auth token prefix",
      type: "text",
      placeholder: "Bearer"
    },
    {
      key: "accessToken",
      label: "Access token",
      type: "password",
      placeholder: "Token"
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
      helpText: "Used in API mode only."
    },
    {
      key: "customDate",
      label: "Custom date",
      type: "text",
      placeholder: "YYYY-MM-DD"
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
      const delayMs = 60000;
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
          errorMessage = formatSourceError(cfg, error);
          render();
          scheduleRefresh();
          return;
        }

        const nextSig = requestSignature(cfg, queryDate);
        render();

        if (!loading && nextSig !== lastRequestSig) {
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
