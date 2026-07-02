import test from "node:test";
import assert from "node:assert/strict";

import {
  assertFlexScrapeApisAvailable,
  executeFlexScriptInTab
} from "../widgets/shared/flexHomeScrape.js";
import {
  findFlexTabByPriority,
  selectPreferredFlexTab
} from "../widgets/shared/flexTabs.js";
import { createFlexWorktimeCache } from "../widgets/shared/flexWorktimeCache.js";
import {
  formatClockMinutes,
  normalizeFlexWidgetBaseConfig,
  resolveFlexWorktimeDetailUrl
} from "../widgets/shared/flexWorktimeRows.js";

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

function createScrapeChromeApi(overrides = {}) {
  return {
    runtime: {},
    scripting: {
      executeScript(_injection, callback) {
        callback([]);
      }
    },
    tabs: {
      query() {},
      get() {},
      create() {},
      update() {},
      remove() {},
      onUpdated: {
        addListener() {},
        removeListener() {}
      }
    },
    ...overrides
  };
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

test("Flex scrape API assertion preserves permission error messaging", () => {
  const previousChrome = globalThis.chrome;
  delete globalThis.chrome;
  try {
    assert.throws(
      () => assertFlexScrapeApisAvailable("missing flex permissions"),
      /missing flex permissions/
    );

    globalThis.chrome = createScrapeChromeApi();
    assert.doesNotThrow(() => assertFlexScrapeApisAvailable("missing flex permissions"));
  } finally {
    if (typeof previousChrome === "undefined") {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

test("Flex script executor preserves tab target, args, and runtime errors", async () => {
  const previousChrome = globalThis.chrome;
  let receivedInjection = null;
  globalThis.chrome = createScrapeChromeApi({
    runtime: {
      lastError: { message: "script blocked" }
    },
    scripting: {
      executeScript(injection, callback) {
        receivedInjection = injection;
        callback(undefined);
      }
    }
  });

  try {
    await assert.rejects(
      executeFlexScriptInTab(5, (value) => value, ["demo"], "custom flex script error"),
      /script blocked/
    );
    assert.equal(receivedInjection.target.tabId, 5);
    assert.equal(typeof receivedInjection.func, "function");
    assert.deepEqual(receivedInjection.args, ["demo"]);
  } finally {
    if (typeof previousChrome === "undefined") {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

test("Flex tab selector prefers target pages before login fallback", () => {
  const targetUrl = new URL("https://flex.team/home");
  const selected = selectPreferredFlexTab(
    [
      { id: 1, url: "https://flex.team/auth/login" },
      { id: 2, url: "https://flex.team/home" }
    ],
    targetUrl,
    (tabUrl) => tabUrl === "https://flex.team/home"
  );

  assert.equal(selected.id, 2);
  assert.equal(
    selectPreferredFlexTab(
      [{ id: 3, url: "https://flex.team/auth/login" }],
      targetUrl,
      () => false
    ).id,
    3
  );
});

test("Flex tab finder checks active, current, then all tabs", async () => {
  const targetUrl = new URL("https://flex.team/home");
  const queries = [];
  const found = await findFlexTabByPriority(
    targetUrl,
    (tabUrl) => tabUrl === "https://flex.team/home/team",
    {
      queryTabs(query) {
        queries.push(query);
        if (queries.length === 1) {
          return Promise.resolve([]);
        }
        if (queries.length === 2) {
          return Promise.resolve([{ id: 4, url: "https://example.com/" }]);
        }
        return Promise.resolve([{ id: 5, url: "https://flex.team/home/team" }]);
      }
    }
  );

  assert.equal(found.id, 5);
  assert.deepEqual(queries, [
    { active: true, currentWindow: true },
    { currentWindow: true },
    {}
  ]);
});

test("Flex base config normalizer preserves shared widget defaults", () => {
  assert.deepEqual(
    normalizeFlexWidgetBaseConfig(
      {
        flexHomeUrl: "",
        openFlexTabIfMissing: false,
        refreshMinutes: 0,
        detailUrlTemplate: "  https://example.com/{date}  ",
        openInNewTab: false
      },
      {
        defaultFlexHomeUrl: "https://flex.team/home",
        defaultRefreshMinutes: 1
      }
    ),
    {
      flexHomeUrl: "https://flex.team/home",
      openFlexTabIfMissing: false,
      refreshMinutes: 1,
      detailUrlTemplate: "https://example.com/{date}",
      openInNewTab: false
    }
  );
});

test("Flex shared clock formatter preserves bounded minute semantics", () => {
  assert.equal(formatClockMinutes(61.9), "01:01");
  assert.equal(formatClockMinutes("bad"), "00:00");
  assert.equal(formatClockMinutes(-4), "00:00");
  assert.equal(formatClockMinutes(1500), "23:59");
});

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
