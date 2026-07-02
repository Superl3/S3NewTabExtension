import { arrayOrEmpty } from "../../core/utils/array.js";
import { parseJsonOrNull } from "../../core/utils/json.js";
import { toFiniteNumber, toPositiveInteger } from "../../core/utils/number.js";
import { isPlainObject } from "../../core/utils/object.js";
import { normalizeText } from "../../core/utils/text.js";
import { pruneCacheIndex, touchCacheIndex } from "./localStorageCacheIndex.js";

function resolveStorageArea(fallbackStorage = null) {
  if (fallbackStorage) {
    return fallbackStorage;
  }
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function createFlexWorktimeCache(options = {}) {
  const cachePrefix = normalizeText(options.cachePrefix);
  const defaultMaxEntries = toPositiveInteger(options.maxEntries, 1);
  const configSignature = typeof options.configSignature === "function"
    ? options.configSignature
    : () => "";
  const normalizeCachedRow = typeof options.normalizeCachedRow === "function"
    ? options.normalizeCachedRow
    : (entry) => entry;
  const toCachedRow = typeof options.toCachedRow === "function"
    ? options.toCachedRow
    : (row) => row;
  const indexOptions = {
    prefix: `${cachePrefix}:`,
    indexKey: `${cachePrefix}:__index__`
  };

  function cacheStorageKey(config, queryDate) {
    const encodedSignature = encodeURIComponent(configSignature(config));
    const encodedDate = encodeURIComponent(normalizeText(queryDate));
    return `${cachePrefix}:${encodedSignature}:${encodedDate}`;
  }

  function requestSignature(config, queryDate) {
    return `${configSignature(config)}|${normalizeText(queryDate)}`;
  }

  function readCachedSnapshot(config, queryDate) {
    const storage = resolveStorageArea(options.storage);
    if (!storage) {
      return null;
    }

    let raw = "";
    try {
      raw = storage.getItem(cacheStorageKey(config, queryDate)) || "";
    } catch {
      return null;
    }

    const parsed = parseJsonOrNull(raw);
    if (!isPlainObject(parsed)) {
      return null;
    }

    const fetchedAt = Number(parsed.fetchedAt);
    const rows = arrayOrEmpty(parsed.rows)
      .map(normalizeCachedRow)
      .filter(Boolean);

    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) {
      return null;
    }

    return {
      fetchedAt: Math.round(fetchedAt),
      rows
    };
  }

  function pruneCacheEntries(maxEntries = defaultMaxEntries) {
    const storage = resolveStorageArea(options.storage);
    if (!storage) {
      return;
    }

    pruneCacheIndex(storage, {
      ...indexOptions,
      maxEntries
    });
  }

  function writeCachedSnapshot(config, queryDate, rows, fetchedAt = Date.now()) {
    const storage = resolveStorageArea(options.storage);
    if (!storage) {
      return;
    }

    const key = cacheStorageKey(config, queryDate);
    const payload = {
      fetchedAt: Math.max(1, Math.round(toFiniteNumber(fetchedAt, Date.now()))),
      rows: arrayOrEmpty(rows).map(toCachedRow).filter(Boolean)
    };

    try {
      storage.setItem(key, JSON.stringify(payload));
      touchCacheIndex(storage, {
        ...indexOptions,
        key,
        fetchedAt: payload.fetchedAt,
        maxEntries: defaultMaxEntries
      });
    } catch {
      // noop
    }
  }

  return {
    cacheStorageKey,
    requestSignature,
    readCachedSnapshot,
    pruneCacheEntries,
    writeCachedSnapshot
  };
}
