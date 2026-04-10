import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIgnoredScopeKey,
  getIgnoredItemKeys,
  isIgnoredItem,
  readIgnoredItemsSnapshot,
  setIgnoredItem
} from "../widgets/shared/ignoredItems.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return Array.from(map.keys())[index] || null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    }
  };
}

test("buildIgnoredScopeKey composes normalized scope values", () => {
  assert.equal(
    buildIgnoredScopeKey([" githubReviewInbox ", "owner/repo", " bug95 ", "needsReview"]),
    "githubReviewInbox::owner/repo::bug95::needsReview"
  );
});

test("setIgnoredItem persists values by scope and isIgnoredItem reads them", () => {
  const storage = createMemoryStorage();
  const scopeKey = buildIgnoredScopeKey(["githubReviewInbox", "owner/repo", "bug95", "needsReview"]);

  assert.equal(setIgnoredItem(scopeKey, "101", true, storage), true);
  assert.equal(isIgnoredItem(scopeKey, "101", storage), true);
  assert.deepEqual(Array.from(getIgnoredItemKeys(scopeKey, storage)), ["101"]);
});

test("setIgnoredItem is idempotent and keeps scopes isolated", () => {
  const storage = createMemoryStorage();
  const reviewScope = buildIgnoredScopeKey(["githubReviewInbox", "owner/repo", "bug95", "needsReview"]);
  const openedScope = buildIgnoredScopeKey(["githubReviewInbox", "owner/repo", "bug95", "opened"]);

  assert.equal(setIgnoredItem(reviewScope, "101", true, storage), true);
  assert.equal(setIgnoredItem(reviewScope, "101", true, storage), false);
  assert.equal(isIgnoredItem(openedScope, "101", storage), false);
});

test("setIgnoredItem can remove ignored state and prunes empty scopes", () => {
  const storage = createMemoryStorage();
  const scopeKey = buildIgnoredScopeKey(["githubReviewInbox", "owner/repo", "bug95", "needsReview"]);

  setIgnoredItem(scopeKey, "101", true, storage);
  assert.equal(setIgnoredItem(scopeKey, "101", false, storage), true);
  assert.equal(isIgnoredItem(scopeKey, "101", storage), false);
  assert.deepEqual(readIgnoredItemsSnapshot(storage), {});
});
