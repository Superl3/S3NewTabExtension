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

function normalizeScopedItemSnapshot(snapshot) {
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

export function buildScopedItemScopeKey(parts = []) {
  const values = Array.isArray(parts) ? parts : [parts];
  return values.map((value) => normalizeText(value)).filter(Boolean).join("::");
}

export function readScopedItemSnapshot(storageKey, storage = undefined) {
  const normalizedStorageKey = normalizeText(storageKey);
  const targetStorage = resolveStorage(storage);
  if (!normalizedStorageKey || !targetStorage) {
    return {};
  }
  try {
    return normalizeScopedItemSnapshot(parseJsonSafely(targetStorage.getItem(normalizedStorageKey) || ""));
  } catch {
    return {};
  }
}

export function getScopedItemKeys(storageKey, scopeKey, storage = undefined) {
  const normalizedScopeKey = normalizeText(scopeKey);
  if (!normalizedScopeKey) {
    return new Set();
  }
  return new Set(readScopedItemSnapshot(storageKey, storage)[normalizedScopeKey] || []);
}

export function hasScopedItem(storageKey, scopeKey, itemKey, storage = undefined) {
  const normalizedItemKey = normalizeText(itemKey);
  if (!normalizedItemKey) {
    return false;
  }
  return getScopedItemKeys(storageKey, scopeKey, storage).has(normalizedItemKey);
}

export function writeScopedItemSnapshot(storageKey, snapshot, storage = undefined) {
  const normalizedStorageKey = normalizeText(storageKey);
  const targetStorage = resolveStorage(storage);
  if (!normalizedStorageKey || !targetStorage) {
    return false;
  }
  const normalized = normalizeScopedItemSnapshot(snapshot);
  try {
    targetStorage.setItem(normalizedStorageKey, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function setScopedItem(storageKey, scopeKey, itemKey, enabled = true, storage = undefined) {
  const normalizedScopeKey = normalizeText(scopeKey);
  const normalizedItemKey = normalizeText(itemKey);
  if (!normalizedScopeKey || !normalizedItemKey) {
    return false;
  }

  const snapshot = readScopedItemSnapshot(storageKey, storage);
  const currentValues = new Set(snapshot[normalizedScopeKey] || []);
  const hasItem = currentValues.has(normalizedItemKey);
  if (enabled && hasItem) {
    return false;
  }
  if (!enabled && !hasItem) {
    return false;
  }

  if (enabled) {
    currentValues.add(normalizedItemKey);
  } else {
    currentValues.delete(normalizedItemKey);
  }

  if (currentValues.size) {
    snapshot[normalizedScopeKey] = Array.from(currentValues).sort();
  } else {
    delete snapshot[normalizedScopeKey];
  }

  return writeScopedItemSnapshot(storageKey, snapshot, storage);
}
