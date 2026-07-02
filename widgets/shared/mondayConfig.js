import { normalizeText } from "../../core/utils/text.js";

export function normalizeBoardId(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, Math.floor(num));
}

export function splitCsvText(value) {
  return normalizeText(value)
    .split(",")
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

export function csvEntries(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => splitCsvText(entry));
  }
  return splitCsvText(value);
}

export function normalizeBoardIds(value, fallback = []) {
  const source = csvEntries(value);
  const fallbackIds = csvEntries(fallback);
  const out = [];

  for (const entry of source) {
    const id = normalizeBoardId(entry, 0);
    if (id > 0 && !out.includes(id)) {
      out.push(id);
    }
  }

  if (out.length) {
    return out;
  }

  for (const entry of fallbackIds) {
    const id = normalizeBoardId(entry, 0);
    if (id > 0 && !out.includes(id)) {
      out.push(id);
    }
  }

  return out;
}

export function hasMondayConnectorConfig(config) {
  return Boolean(config?.connectorUrl) || Boolean(config?.accessToken);
}

export function hasMondayBoardConfig(config) {
  return Array.isArray(config?.boardIds) && config.boardIds.length > 0;
}

export function normalizeCachedMondayBoardBase(entry) {
  const boardId = normalizeBoardId(entry?.boardId, 0);
  if (!boardId) {
    return null;
  }

  return {
    boardId,
    boardName: normalizeText(entry?.boardName, `Board ${boardId}`),
    boardUrl: normalizeText(entry?.boardUrl)
  };
}

export function normalizeColumnSelector(value, options = {}) {
  const { fallback = "", maxLength = 120, allowWildcard = false } = options;
  const text = normalizeText(value, fallback);
  if (allowWildcard && text === "*") {
    return "*";
  }
  return text.slice(0, maxLength);
}

export function parseColumnSelectorList(value, options = {}) {
  return csvEntries(value)
    .map((entry) => normalizeColumnSelector(entry, options))
    .filter(Boolean);
}

export function normalizeColumnSelectorList(value, options = {}) {
  const { fallback = "", unique = true } = options;
  const source = parseColumnSelectorList(value, options);
  const fallbackEntries = parseColumnSelectorList(fallback, options);
  const normalized = source.length ? source : fallbackEntries;

  if (!unique) {
    return normalized.join(", ");
  }

  const out = [];
  for (const entry of normalized) {
    if (!out.includes(entry)) {
      out.push(entry);
    }
  }
  return out.join(", ");
}
