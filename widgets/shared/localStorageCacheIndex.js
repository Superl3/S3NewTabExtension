import { parseJsonOrNull } from "../../core/utils/json.js";
import { toInteger, toPositiveInteger } from "../../core/utils/number.js";
import { normalizeText } from "../../core/utils/text.js";

function normalizeFetchedAt(value) {
  return Math.max(0, toInteger(value, 0));
}

function normalizeIndexEntry(entry, options) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const key = normalizeText(entry.key);
  if (!key || !key.startsWith(options.prefix) || key === options.indexKey) {
    return null;
  }

  return {
    key,
    fetchedAt: normalizeFetchedAt(entry.fetchedAt)
  };
}

export function scanCacheEntries(storage, options) {
  const entries = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(options.prefix) || key === options.indexKey) {
      continue;
    }
    const parsed = parseJsonOrNull(storage.getItem(key) || "");
    entries.push({
      key,
      fetchedAt: normalizeFetchedAt(parsed?.fetchedAt)
    });
  }
  entries.sort((left, right) => right.fetchedAt - left.fetchedAt);
  return entries;
}

export function readCacheIndex(storage, options) {
  const parsed = parseJsonOrNull(storage.getItem(options.indexKey) || "");
  if (!Array.isArray(parsed)) {
    return scanCacheEntries(storage, options);
  }
  return parsed
    .map((entry) => normalizeIndexEntry(entry, options))
    .filter(Boolean)
    .sort((left, right) => right.fetchedAt - left.fetchedAt);
}

export function writeCacheIndex(storage, options, entries) {
  storage.setItem(options.indexKey, JSON.stringify(entries));
}

export function touchCacheIndex(storage, options) {
  const maxEntries = toPositiveInteger(options.maxEntries, 1);
  const key = normalizeText(options.key);
  if (!key) {
    return;
  }

  const entries = readCacheIndex(storage, options).filter((entry) => entry.key !== key);
  entries.push({
    key,
    fetchedAt: normalizeFetchedAt(options.fetchedAt)
  });
  entries.sort((left, right) => right.fetchedAt - left.fetchedAt);

  const trimmed = entries.slice(0, maxEntries);
  for (const entry of entries.slice(maxEntries)) {
    try {
      storage.removeItem(entry.key);
    } catch {
      // noop
    }
  }

  writeCacheIndex(storage, options, trimmed);
}

export function pruneCacheIndex(storage, options) {
  const maxEntries = toPositiveInteger(options.maxEntries, 1);
  const entries = readCacheIndex(storage, options);
  if (entries.length <= maxEntries) {
    writeCacheIndex(storage, options, entries);
    return;
  }

  const kept = entries.slice(0, maxEntries);
  for (const entry of entries.slice(maxEntries)) {
    try {
      storage.removeItem(entry.key);
    } catch {
      // noop
    }
  }
  writeCacheIndex(storage, options, kept);
}
