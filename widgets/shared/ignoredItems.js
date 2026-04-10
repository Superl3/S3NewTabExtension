const IGNORED_ITEMS_STORAGE_KEY = "s3:ignored-items:v1";

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function resolveStorage(storage) {
  if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") {
    return storage;
  }
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

function parseJsonSafely(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeIgnoredSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return {};
  }

  const normalized = {};
  for (const [scopeKey, values] of Object.entries(snapshot)) {
    const normalizedScopeKey = normalizeText(scopeKey);
    if (!normalizedScopeKey || !Array.isArray(values)) {
      continue;
    }
    const normalizedValues = Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean))).sort();
    if (normalizedValues.length) {
      normalized[normalizedScopeKey] = normalizedValues;
    }
  }
  return normalized;
}

export function buildIgnoredScopeKey(parts = []) {
  const values = Array.isArray(parts) ? parts : [parts];
  return values.map((value) => normalizeText(value)).filter(Boolean).join("::");
}

export function readIgnoredItemsSnapshot(storage = undefined) {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return {};
  }
  try {
    return normalizeIgnoredSnapshot(parseJsonSafely(targetStorage.getItem(IGNORED_ITEMS_STORAGE_KEY) || ""));
  } catch {
    return {};
  }
}

export function getIgnoredItemKeys(scopeKey, storage = undefined) {
  const normalizedScopeKey = normalizeText(scopeKey);
  if (!normalizedScopeKey) {
    return new Set();
  }
  return new Set(readIgnoredItemsSnapshot(storage)[normalizedScopeKey] || []);
}

export function isIgnoredItem(scopeKey, itemKey, storage = undefined) {
  const normalizedItemKey = normalizeText(itemKey);
  if (!normalizedItemKey) {
    return false;
  }
  return getIgnoredItemKeys(scopeKey, storage).has(normalizedItemKey);
}

export function writeIgnoredItemsSnapshot(snapshot, storage = undefined) {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return false;
  }
  const normalized = normalizeIgnoredSnapshot(snapshot);
  try {
    targetStorage.setItem(IGNORED_ITEMS_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function setIgnoredItem(scopeKey, itemKey, ignored = true, storage = undefined) {
  const normalizedScopeKey = normalizeText(scopeKey);
  const normalizedItemKey = normalizeText(itemKey);
  if (!normalizedScopeKey || !normalizedItemKey) {
    return false;
  }

  const snapshot = readIgnoredItemsSnapshot(storage);
  const currentValues = new Set(snapshot[normalizedScopeKey] || []);
  const hasItem = currentValues.has(normalizedItemKey);
  if (ignored && hasItem) {
    return false;
  }
  if (!ignored && !hasItem) {
    return false;
  }

  if (ignored) {
    currentValues.add(normalizedItemKey);
  } else {
    currentValues.delete(normalizedItemKey);
  }

  if (currentValues.size) {
    snapshot[normalizedScopeKey] = Array.from(currentValues).sort();
  } else {
    delete snapshot[normalizedScopeKey];
  }

  return writeIgnoredItemsSnapshot(snapshot, storage);
}

export { IGNORED_ITEMS_STORAGE_KEY };
