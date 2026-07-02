import test from "node:test";
import assert from "node:assert/strict";

import { createFlexWorktimeCache } from "../widgets/shared/flexWorktimeCache.js";
import { resolveFlexWorktimeDetailUrl } from "../widgets/shared/flexWorktimeRows.js";

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

function createCache(storage) {
  return createFlexWorktimeCache({
    cachePrefix: "test:flex-cache:v1",
    maxEntries: 1,
    storage,
    configSignature: (config) => `${config.flexHomeUrl}|${config.openFlexTabIfMissing ? 1 : 0}`,
    normalizeCachedRow: (entry) => entry && entry.keep ? { id: String(entry.id), keep: true } : null,
    toCachedRow: (row) => row && row.id ? { id: row.id, keep: true } : null
  });
}

test("Flex worktime detail URL helper resolves placeholders safely", () => {
  const entry = {
    placeholders: {
      id: "member 1",
      duration: "8h 10m"
    },
    rawEntry: {
      nested: {
        value: "raw value"
      }
    }
  };

  assert.equal(
    resolveFlexWorktimeDetailUrl(
      {
        detailUrlTemplate: "https://example.com/work?date={date}&id={id}&raw={entry.nested.value}&missing={missing}"
      },
      "2026-07-02",
      entry
    ),
    "https://example.com/work?date=2026-07-02&id=member%201&raw=raw%20value&missing="
  );

  assert.equal(
    resolveFlexWorktimeDetailUrl({ detailUrlTemplate: "javascript:alert({id})" }, "2026-07-02", entry),
    ""
  );
  assert.equal(resolveFlexWorktimeDetailUrl({ detailUrlTemplate: "" }, "2026-07-02", entry), "");
});

test("Flex worktime cache factory preserves storage and index semantics", () => {
  const storage = new FakeStorage();
  const cache = createCache(storage);
  const config = {
    flexHomeUrl: "https://flex.team/home",
    openFlexTabIfMissing: true
  };

  assert.equal(cache.requestSignature(config, "2026-07-02"), "https://flex.team/home|1|2026-07-02");

  const firstKey = cache.cacheStorageKey(config, "2026-07-02");
  assert.equal(firstKey, "test:flex-cache:v1:https%3A%2F%2Fflex.team%2Fhome%7C1:2026-07-02");

  cache.writeCachedSnapshot(config, "2026-07-02", [{ id: "first" }], 123.6);
  assert.deepEqual(cache.readCachedSnapshot(config, "2026-07-02"), {
    fetchedAt: 124,
    rows: [{ id: "first", keep: true }]
  });

  const secondConfig = {
    flexHomeUrl: "https://flex.team/other",
    openFlexTabIfMissing: false
  };
  cache.writeCachedSnapshot(secondConfig, "2026-07-03", [{ id: "second" }], 200);

  assert.equal(storage.getItem(firstKey), null);
  assert.deepEqual(cache.readCachedSnapshot(secondConfig, "2026-07-03")?.rows, [
    { id: "second", keep: true }
  ]);
});
