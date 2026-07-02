import { normalizeText } from "../../core/utils/text.js";
import { toLocalDateKey } from "./localDates.js";

export function unfoldIcsLines(rawText) {
  const normalized = String(rawText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sourceLines = normalized.split("\n");
  const lines = [];

  for (const line of sourceLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
      continue;
    }
    lines.push(line);
  }

  return lines;
}

export function parseIcsLine(line) {
  const colonIndex = line.indexOf(":");
  if (colonIndex <= 0) {
    return null;
  }

  const left = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [rawName, ...rawParams] = left.split(";");
  const name = normalizeText(rawName).toUpperCase();
  if (!name) {
    return null;
  }

  const params = {};
  for (const paramChunk of rawParams) {
    const equalIndex = paramChunk.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }

    const key = normalizeText(paramChunk.slice(0, equalIndex)).toUpperCase();
    if (!key) {
      continue;
    }

    const paramValue = normalizeText(paramChunk.slice(equalIndex + 1)).replace(/^"|"$/g, "");
    params[key] = paramValue;
  }

  return { name, params, value };
}

function unescapeIcsText(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseDateParts(parts, utc = false) {
  const [year, month, day, hour = 0, minute = 0, second = 0] = parts.map((part) => Number(part));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  const date = utc
    ? new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    : new Date(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date;
}

function buildDateInfo(date, allDay) {
  return {
    allDay,
    startDate: date,
    startTs: date.getTime(),
    dateKey: toLocalDateKey(date),
    dateLabel: date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      weekday: "short"
    }),
    timeLabel: allDay
      ? "All day"
      : date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit"
        })
  };
}

export function parseIcsStartDate(rawValue, params = {}) {
  const value = normalizeText(rawValue);
  if (!value) {
    return null;
  }

  const valueType = normalizeText(params.VALUE).toUpperCase();
  if (valueType === "DATE" || /^\d{8}$/.test(value)) {
    const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) {
      return null;
    }

    const date = parseDateParts([match[1], match[2], match[3]]);
    return date ? buildDateInfo(date, true) : null;
  }

  let date = null;
  const utcMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    date = parseDateParts(utcMatch.slice(1), true);
  }

  if (!date) {
    const localMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (localMatch) {
      date = parseDateParts(localMatch.slice(1), false);
    }
  }

  if (!date) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      date = parsed;
    }
  }

  return date ? buildDateInfo(date, false) : null;
}

export function parseIcsEvents(icsText) {
  const lines = unfoldIcsLines(icsText);
  const rawEvents = [];
  let current = null;

  for (const line of lines) {
    const upper = normalizeText(line).toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (upper === "END:VEVENT") {
      if (current) {
        rawEvents.push(current);
      }
      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    const parsed = parseIcsLine(line);
    if (!parsed) {
      continue;
    }

    const { name, params, value } = parsed;
    if (!Object.prototype.hasOwnProperty.call(current, name)) {
      current[name] = { value, params };
    }
  }

  return rawEvents.reduce((events, entry, index) => {
    const start = parseIcsStartDate(entry.DTSTART?.value, entry.DTSTART?.params || {});
    if (!start) {
      return events;
    }

    events.push({
      status: normalizeText(entry.STATUS?.value).toUpperCase(),
      id: normalizeText(unescapeIcsText(entry.UID?.value), `event-${index}`),
      title: normalizeText(unescapeIcsText(entry.SUMMARY?.value), "(No title)"),
      location: normalizeText(unescapeIcsText(entry.LOCATION?.value)),
      url: normalizeText(unescapeIcsText(entry.URL?.value)),
      allDay: start.allDay,
      startDate: start.startDate,
      startTs: start.startTs,
      dateKey: start.dateKey,
      dateLabel: start.dateLabel,
      timeLabel: start.timeLabel
    });
    return events;
  }, []);
}
