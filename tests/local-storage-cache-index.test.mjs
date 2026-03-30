import test from "node:test";
import assert from "node:assert/strict";

import {
  pruneCacheIndex,
  readCacheIndex,
  touchCacheIndex
} from "../widgets/shared/localStorageCacheIndex.js";

class FakeStorage {
  constructor() {
    this.map = new Map();
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return Array.from(this.map.keys())[index] || null;
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(String(key));
  }
}

const options = {
  prefix: "cache:",
  indexKey: "cache:__index__"
};

test("touchCacheIndex keeps newest entries and removes older keys", () => {
  const storage = new FakeStorage();
  storage.setItem("cache:a", JSON.stringify({ fetchedAt: 10 }));
  storage.setItem("cache:b", JSON.stringify({ fetchedAt: 20 }));
  storage.setItem("cache:c", JSON.stringify({ fetchedAt: 30 }));

  touchCacheIndex(storage, { ...options, key: "cache:a", fetchedAt: 40, maxEntries: 2 });

  const index = readCacheIndex(storage, options);
  assert.deepEqual(
    index.map((entry) => entry.key),
    ["cache:a", "cache:c"]
  );
  assert.equal(storage.getItem("cache:b"), null);
});

test("readCacheIndex falls back to storage scan when index is missing", () => {
  const storage = new FakeStorage();
  storage.setItem("cache:one", JSON.stringify({ fetchedAt: 100 }));
  storage.setItem("cache:two", JSON.stringify({ fetchedAt: 200 }));

  const index = readCacheIndex(storage, options);
  assert.deepEqual(
    index.map((entry) => entry.key),
    ["cache:two", "cache:one"]
  );
});

test("pruneCacheIndex trims index and removes stale keys", () => {
  const storage = new FakeStorage();
  storage.setItem("cache:new", JSON.stringify({ fetchedAt: 300 }));
  storage.setItem("cache:old", JSON.stringify({ fetchedAt: 100 }));
  storage.setItem("cache:mid", JSON.stringify({ fetchedAt: 200 }));
  storage.setItem(
    "cache:__index__",
    JSON.stringify([
      { key: "cache:new", fetchedAt: 300 },
      { key: "cache:mid", fetchedAt: 200 },
      { key: "cache:old", fetchedAt: 100 }
    ])
  );

  pruneCacheIndex(storage, { ...options, maxEntries: 1 });

  const index = readCacheIndex(storage, options);
  assert.deepEqual(index.map((entry) => entry.key), ["cache:new"]);
  assert.equal(storage.getItem("cache:mid"), null);
  assert.equal(storage.getItem("cache:old"), null);
});
