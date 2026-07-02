import { normalizeText } from "../../core/utils/text.js";

export function toLocalDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseAutoRefreshSlotsDone(value, slotCount) {
  const text = normalizeText(value);
  if (!text) {
    return new Set();
  }

  const normalizedSlotCount = Math.max(0, Math.floor(Number(slotCount) || 0));
  const out = new Set();
  for (const part of text.split(",")) {
    const num = Number(part);
    if (Number.isInteger(num) && num >= 0 && num < normalizedSlotCount) {
      out.add(num);
    }
  }
  return out;
}

export function serializeAutoRefreshSlotsDone(slotSet) {
  return Array.from(slotSet)
    .sort((a, b) => a - b)
    .join(",");
}

export function dateAtMinute(sourceDate, minuteOfDay) {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return new Date(
    sourceDate.getFullYear(),
    sourceDate.getMonth(),
    sourceDate.getDate(),
    hours,
    minutes,
    0,
    0
  );
}

export function autoRefreshDoneSetForDay(config, dayKey, slotCount) {
  return config?.autoRefreshDayKey === dayKey
    ? parseAutoRefreshSlotsDone(config?.autoRefreshSlotsDone, slotCount)
    : new Set();
}

export function updateAutoRefreshSlotsDoneForToday(config, now, indicesToMark, slotCount) {
  const dayKey = toLocalDayKey(now);
  const doneSet = autoRefreshDoneSetForDay(config, dayKey, slotCount);

  for (const index of indicesToMark) {
    doneSet.add(index);
  }

  return {
    dayKey,
    slotsDone: serializeAutoRefreshSlotsDone(doneSet)
  };
}
