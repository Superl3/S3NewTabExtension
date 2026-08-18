import { normalizeErrorMessage } from "../../core/utils/error.js";
import { clamp, normalizeIntegerInRange, toFiniteNumber, toInteger } from "../../core/utils/number.js";
import { hasOwn, isPlainObject } from "../../core/utils/object.js";
import { normalizeText } from "../../core/utils/text.js";
import { toLocalDateKey } from "./localDates.js";

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
const DURATION_GENERIC_FIELDS = ["duration", "workDuration", "totalDuration", "durationText", "elapsed"];

export const FLEX_WORKTIME_CACHE_MAX_ENTRIES = 24;
export const FLEX_HOME_TAB_LOAD_TIMEOUT_MS = 20000;
// Flex worktime changes on the scale of hours, and each refresh may open, script,
// and close a background tab. A 1-minute default meant up to 60 tab lifecycles
// per hour per widget.
export const FLEX_WORKTIME_DEFAULT_REFRESH_MINUTES = 15;
export const FLEX_WORKTIME_DEFAULT_HOME_URL = "https://flex.team/home";

export function normalizeFlexRefreshMinutes(value, fallback = 10) {
  return normalizeIntegerInRange(value, fallback, 1, 720);
}

export function normalizeFlexHomeUrl(value, fallback = "https://flex.team/home") {
  const text = normalizeText(value, fallback);
  return text || "https://flex.team/home";
}

export function normalizeFlexWidgetBaseConfig(config, options = {}) {
  const {
    defaultFlexHomeUrl = "https://flex.team/home",
    defaultRefreshMinutes = 10
  } = options;

  return {
    flexHomeUrl: normalizeFlexHomeUrl(config?.flexHomeUrl, defaultFlexHomeUrl),
    openFlexTabIfMissing: config?.openFlexTabIfMissing !== false,
    refreshMinutes: normalizeFlexRefreshMinutes(config?.refreshMinutes, defaultRefreshMinutes),
    detailUrlTemplate: normalizeText(config?.detailUrlTemplate),
    openInNewTab: config?.openInNewTab !== false
  };
}

export function buildFlexWidgetConfigSignature(config, parts = []) {
  return [
    normalizeText(config?.flexHomeUrl),
    config?.openFlexTabIfMissing ? 1 : 0,
    ...parts
  ].join("|");
}

export function buildFlexWorktimeRowId(prefix, queryDate) {
  return `${prefix}-${normalizeText(queryDate, toLocalDateKey(new Date()))}`;
}

export function formatClockMinutes(totalMinutes) {
  const minutes = clamp(toInteger(totalMinutes, 0), 0, 1439);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseTimeOfDayMinutes(value) {
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

export function formatTimeFromRef(timeRef) {
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

export function formatDurationMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(toFiniteNumber(totalMinutes, 0)));
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

export function formatSyncedLabel(timestampMs) {
  const ts = Number(timestampMs);
  if (!Number.isFinite(ts) || ts <= 0) {
    return "";
  }
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function resolveFlexSyncState({
  loading = false,
  rowCount = 0,
  errorMessage = "",
  lastSyncedAt = 0
} = {}) {
  if (loading) {
    return {
      label: rowCount ? "Syncing..." : "Loading...",
      tone: "loading",
      tooltip: rowCount ? "Refreshing cached worktime data." : "Loading worktime data."
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

export function formatFlexSourceError(prefix, error) {
  const message = normalizeErrorMessage(error);
  if (!message) {
    return `${prefix} failed.`;
  }
  if (message.toLowerCase().startsWith(prefix.toLowerCase())) {
    return message;
  }
  return `${prefix}: ${message}`;
}

export function formatFlexHomeScrapeError(_config, error) {
  return formatFlexSourceError("Flex Home scrape", error);
}

export function formatFlexWorkRecordScrapeError(_config, error) {
  return formatFlexSourceError("Flex Work Record scrape", error);
}

export function sanitizePlaceholderMap(source) {
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

export function normalizeCachedWorktimeRow(entry) {
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

export function toCachedWorktimeRow(row) {
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
    const hours = toFiniteNumber(unitMatch[1], 0);
    const minutes = toFiniteNumber(unitMatch[2], 0);
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

export function normalizeWorktimeRow(entry, index) {
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

export function normalizeFlexHomeScrapeRow(scraped, queryDate, flexHomeUrl) {
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
    extractedAt: Math.max(1, Math.round(toFiniteNumber(scraped?.extractedAt, Date.now()))),
    status,
    duration,
    line
  };

  const row = {
    id: buildFlexWorktimeRowId("flex-home", queryDate),
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

function resolvePlaceholderPathValue(source, path) {
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

function applyDetailUrlTemplate(template, context) {
  const text = normalizeText(template);
  if (!text) {
    return "";
  }

  return text.replace(/\{([A-Za-z0-9_.-]+)\}/g, (fullMatch, key) => {
    const value = resolvePlaceholderPathValue(context, key);
    if (value === null || value === undefined) {
      return "";
    }
    return encodeURIComponent(String(value));
  });
}

export function resolveFlexWorktimeDetailUrl(config, queryDate, entry) {
  const template = normalizeText(config?.detailUrlTemplate);
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

  const resolved = applyDetailUrlTemplate(template, context);
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

export function normalizeTabId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const tabId = Number(value);
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
}
