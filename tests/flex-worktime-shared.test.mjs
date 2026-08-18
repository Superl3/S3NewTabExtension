import test from "node:test";
import assert from "node:assert/strict";

import {
  assertFlexScrapeApisAvailable,
  executeFlexScriptInTab
} from "../widgets/shared/flexHomeScrape.js";
import {
  activateFlexAuthFlowTabIfNeeded,
  findFlexTabByPriority,
  selectPreferredFlexTab
} from "../widgets/shared/flexTabs.js";
import {
  openFlexDetailHref,
  openFlexEntryDetail
} from "../widgets/shared/flexNavigation.js";
import { createFlexWorktimeCache } from "../widgets/shared/flexWorktimeCache.js";
import {
  FLEX_HOME_TAB_LOAD_TIMEOUT_MS,
  FLEX_WORKTIME_CACHE_MAX_ENTRIES,
  FLEX_WORKTIME_DEFAULT_HOME_URL,
  FLEX_WORKTIME_DEFAULT_REFRESH_MINUTES,
  buildFlexWidgetConfigSignature,
  buildFlexWorktimeRowId,
  formatClockMinutes,
  formatDurationMinutes,
  formatFlexHomeScrapeError,
  formatFlexWorkRecordScrapeError,
  normalizeFlexWidgetBaseConfig,
  resolveFlexSyncState,
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

function createCache(storage, options = {}) {
  return createFlexWorktimeCache({
    cachePrefix: "test:flex-cache:v1",
    maxEntries: options.maxEntries ?? 1,
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

test("Flex auth flow tab activator handles pending auth tabs", async () => {
  const activatedTabs = [];
  const updateTab = async (tabId, update) => {
    activatedTabs.push([tabId, update]);
  };

  assert.equal(
    await activateFlexAuthFlowTabIfNeeded({
      tabId: 7,
      error: { code: "FLEX_AUTH_REQUIRED" },
      targetTab: { url: "https://flex.team/home" },
      targetUrl: new URL("https://flex.team/home"),
      updateTab
    }),
    true
  );
  assert.deepEqual(activatedTabs, [[7, { active: true }]]);

  assert.equal(
    await activateFlexAuthFlowTabIfNeeded({
      tabId: 8,
      error: new Error("still loading"),
      currentTab: { url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=demo" },
      targetUrl: new URL("https://flex.team/home"),
      updateTab: async () => {
        throw new Error("tab update failed");
      }
    }),
    true
  );

  assert.equal(
    await activateFlexAuthFlowTabIfNeeded({
      tabId: 9,
      error: new Error("page crashed"),
      currentTab: { url: "https://example.com/" },
      targetUrl: new URL("https://flex.team/home"),
      updateTab
    }),
    false
  );
  assert.deepEqual(activatedTabs, [[7, { active: true }]]);
});

test("Flex base config normalizer preserves shared widget defaults", () => {
  assert.equal(FLEX_WORKTIME_DEFAULT_HOME_URL, "https://flex.team/home");
  // Flex worktime data changes hourly and each refresh may open a background tab.
  assert.equal(FLEX_WORKTIME_DEFAULT_REFRESH_MINUTES, 15);
  assert.equal(FLEX_HOME_TAB_LOAD_TIMEOUT_MS, 20000);
  assert.equal(FLEX_WORKTIME_CACHE_MAX_ENTRIES, 24);

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

test("Flex config signature helper preserves shared prefix and explicit suffix order", () => {
  assert.equal(
    buildFlexWidgetConfigSignature(
      {
        flexHomeUrl: " https://flex.team/home ",
        openFlexTabIfMissing: false
      },
      ["custom", "2026-04-10", "", 1]
    ),
    "https://flex.team/home|0|custom|2026-04-10||1"
  );
});

test("Flex row id helper preserves prefix and query-date formatting", () => {
  assert.equal(buildFlexWorktimeRowId("flex-home", "2026-04-10"), "flex-home-2026-04-10");
  assert.equal(buildFlexWorktimeRowId("flex-work-record", " 2026-04-11 "), "flex-work-record-2026-04-11");
});

test("Flex shared clock formatter preserves bounded minute semantics", () => {
  assert.equal(formatClockMinutes(61.9), "01:01");
  assert.equal(formatClockMinutes("bad"), "00:00");
  assert.equal(formatClockMinutes(-4), "00:00");
  assert.equal(formatClockMinutes(1500), "23:59");
});

test("Flex shared duration formatter preserves numeric fallback semantics", () => {
  assert.equal(formatDurationMinutes(61.9), "1h 2m");
  assert.equal(formatDurationMinutes("bad"), "0m");
  assert.equal(formatDurationMinutes(-4), "0m");
});

test("Flex shared source error formatters preserve widget prefixes", () => {
  assert.equal(
    formatFlexHomeScrapeError(null, new Error("missing tab")),
    "Flex Home scrape: missing tab"
  );
  assert.equal(
    formatFlexWorkRecordScrapeError(null, "blocked"),
    "Flex Work Record scrape: blocked"
  );
  assert.equal(
    formatFlexHomeScrapeError(null, "Flex Home scrape: already prefixed"),
    "Flex Home scrape: already prefixed"
  );
});

test("Flex shared sync state preserves loading, error, success, and idle labels", () => {
  assert.deepEqual(resolveFlexSyncState({ loading: true, rowCount: 0 }), {
    label: "Loading...",
    tone: "loading",
    tooltip: "Loading worktime data."
  });
  assert.deepEqual(resolveFlexSyncState({ loading: true, rowCount: 2 }), {
    label: "Syncing...",
    tone: "loading",
    tooltip: "Refreshing cached worktime data."
  });
  assert.deepEqual(resolveFlexSyncState({ errorMessage: "network failed" }), {
    label: "Sync failed",
    tone: "error",
    tooltip: "network failed"
  });
  assert.equal(resolveFlexSyncState({ lastSyncedAt: 1 }).tone, "success");
  assert.deepEqual(resolveFlexSyncState(), {
    label: "Not synced",
    tone: "idle",
    tooltip: "No sync history yet."
  });
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

test("Flex worktime navigation helper opens detail links consistently", () => {
  const opened = [];
  const targetWindow = {
    location: { href: "" },
    open(href, target, features) {
      opened.push({ href, target, features });
    }
  };

  assert.equal(openFlexDetailHref("", { openInNewTab: true }, targetWindow), false);
  assert.equal(openFlexDetailHref("https://example.com/detail", { openInNewTab: true }, targetWindow), true);
  assert.deepEqual(opened, [
    {
      href: "https://example.com/detail",
      target: "_blank",
      features: "noopener,noreferrer"
    }
  ]);

  assert.equal(openFlexDetailHref("https://example.com/current", { openInNewTab: false }, targetWindow), true);
  assert.equal(targetWindow.location.href, "https://example.com/current");
});

test("Flex worktime entry navigation helper preserves query date fallback", () => {
  const opened = [];
  const targetWindow = {
    location: { href: "" },
    open(href, target, features) {
      opened.push({ href, target, features });
    }
  };
  const config = { openInNewTab: true };
  const entry = { id: "row-1" };
  const resolveDetailUrl = (receivedConfig, queryDate, receivedEntry) => {
    assert.equal(receivedConfig, config);
    assert.equal(receivedEntry, entry);
    return `https://example.com/work?date=${queryDate}`;
  };

  assert.equal(
    openFlexEntryDetail({
      entry,
      config,
      fallbackQueryDate: "2026-07-02",
      resolveQueryDate() {
        throw new Error("invalid date");
      },
      resolveDetailUrl,
      targetWindow
    }),
    true
  );
  assert.equal(opened[0].href, "https://example.com/work?date=2026-07-02");

  assert.equal(
    openFlexEntryDetail({
      entry,
      config,
      resolveQueryDate() {
        throw new Error("invalid date");
      },
      resolveDetailUrl,
      targetWindow
    }),
    false
  );
});

test("Flex worktime cache factory preserves storage and index semantics", () => {
  const storage = new FakeStorage();
  const cache = createCache(storage, { maxEntries: 1.8 });
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
