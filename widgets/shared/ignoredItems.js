import {
  buildScopedItemScopeKey,
  getScopedItemKeys,
  hasScopedItem,
  readScopedItemSnapshot,
  setScopedItem,
  writeScopedItemSnapshot
} from "./scopedItemStorage.js";

const IGNORED_ITEMS_STORAGE_KEY = "s3:ignored-items:v1";

export function buildIgnoredScopeKey(parts = []) {
  return buildScopedItemScopeKey(parts);
}

export function readIgnoredItemsSnapshot(storage = undefined) {
  return readScopedItemSnapshot(IGNORED_ITEMS_STORAGE_KEY, storage);
}

export function getIgnoredItemKeys(scopeKey, storage = undefined) {
  return getScopedItemKeys(IGNORED_ITEMS_STORAGE_KEY, scopeKey, storage);
}

export function isIgnoredItem(scopeKey, itemKey, storage = undefined) {
  return hasScopedItem(IGNORED_ITEMS_STORAGE_KEY, scopeKey, itemKey, storage);
}

export function writeIgnoredItemsSnapshot(snapshot, storage = undefined) {
  return writeScopedItemSnapshot(IGNORED_ITEMS_STORAGE_KEY, snapshot, storage);
}

export function setIgnoredItem(scopeKey, itemKey, ignored = true, storage = undefined) {
  return setScopedItem(IGNORED_ITEMS_STORAGE_KEY, scopeKey, itemKey, ignored, storage);
}

export { IGNORED_ITEMS_STORAGE_KEY };
