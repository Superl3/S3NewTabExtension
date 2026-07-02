import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchFlexHomeScrapeRows,
  flexWorktimeWidget
} from "../widgets/flexWorktime.js";
import {
  fetchFlexHomeScrapeRows as fetchTimelineFlexHomeScrapeRows,
  fetchFlexWorkRecordRows,
  fetchFlexWorkRecordTimeline,
  flexWorktimeTimelineWidget
} from "../widgets/flexWorktimeTimeline.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.className = "";
    this.disabled = false;
    this.parentNode = null;
    this._textContent = "";
    this.classList = {
      add: (...tokens) => {
        const existing = new Set(String(this.className || "").split(/\s+/).filter(Boolean));
        for (const token of tokens) {
          existing.add(token);
        }
        this.className = Array.from(existing).join(" ");
      }
    };
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
    this.children = [];
  }

  get textContent() {
    return `${this._textContent}${this.children.map((child) => child.textContent).join("")}`;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!node) {
        continue;
      }
      node.parentNode = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this._textContent = "";
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

function createFakeDocument() {
  const listeners = new Map();
  return {
    visibilityState: "visible",
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    }
  };
}

function createDeferredChromeHarness() {
  let nextTabId = 80;
  const pendingScripts = [];
  const tabsById = new Map();
  const chrome = {
    runtime: {},
    tabs: {
      query(queryInfo, callback) {
        callback([]);
      },
      get(tabId, callback) {
        callback(tabsById.get(tabId));
      },
      create(createProperties, callback) {
        const tab = {
          id: nextTabId += 1,
          status: "complete",
          ...createProperties
        };
        tabsById.set(tab.id, tab);
        callback(tab);
      },
      update(tabId, updateProperties, callback) {
        const tab = {
          ...(tabsById.get(tabId) || { id: tabId, status: "complete" }),
          ...updateProperties
        };
        tabsById.set(tabId, tab);
        callback(tab);
      },
      remove(tabId, callback) {
        tabsById.delete(tabId);
        callback();
      },
      onUpdated: {
        addListener() {},
        removeListener() {}
      }
    },
    scripting: {
      executeScript(injection, callback) {
        pendingScripts.push({ injection, callback });
      }
    }
  };

  return {
    chrome,
    pendingScripts,
    resolveNextScript(result) {
      const pending = pendingScripts.shift();
      assert.ok(pending, "expected a pending script execution");
      pending.callback([{ frameId: 0, result }]);
    }
  };
}

async function flushAsync() {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}

function createChromeHarness(scriptResults = null) {
  let updatedListener = null;
  let nextTabId = 40;
  const tabsById = new Map();
  const calls = {
    query: [],
    create: [],
    get: [],
    update: [],
    remove: [],
    executeScript: []
  };

  const chrome = {
    runtime: {},
    tabs: {
      query(queryInfo, callback) {
        calls.query.push(queryInfo);
        callback([]);
      },
      get(tabId, callback) {
        calls.get.push(tabId);
        callback(tabsById.get(tabId));
      },
      create(createProperties, callback) {
        calls.create.push(createProperties);
        const tab = {
          id: nextTabId += 1,
          status: "complete",
          ...createProperties
        };
        tabsById.set(tab.id, tab);
        callback(tab);
      },
      update(tabId, updateProperties, callback) {
        calls.update.push({ tabId, updateProperties });
        const nextTab = {
          ...(tabsById.get(tabId) || { id: tabId }),
          ...updateProperties
        };
        tabsById.set(tabId, nextTab);
        callback(nextTab);
      },
      remove(tabId, callback) {
        calls.remove.push(tabId);
        tabsById.delete(tabId);
        callback();
      },
      onUpdated: {
        addListener(listener) {
          updatedListener = listener;
        },
        removeListener(listener) {
          if (updatedListener === listener) {
            updatedListener = null;
          }
        }
      }
    },
    scripting: {
      executeScript(injection, callback) {
        calls.executeScript.push(injection);
        const nextResult = Array.isArray(scriptResults) && scriptResults.length > 0
          ? scriptResults.shift()
          : {
            ok: true,
            status: "근무중",
            duration: "8시간 12분",
            line: "근무중 8시간 12분",
            title: "Flex Home",
            url: "https://flex.team/home",
            extractedAt: 1712012345678
          };
        callback([
          {
            frameId: 0,
            result: nextResult
          }
        ]);
      }
    }
  };

  return {
    chrome,
    calls,
    hasUpdatedListener() {
      return typeof updatedListener === "function";
    }
  };
}

test("fetchFlexHomeScrapeRows uses platform wrappers for temporary Flex tab scraping", async () => {
  const harness = createChromeHarness();
  const originalChrome = globalThis.chrome;
  globalThis.chrome = harness.chrome;

  try {
    const scrapeFlowState = { reusableTabId: null };
    const rows = await fetchFlexHomeScrapeRows(
      {
        flexHomeUrl: "https://flex.team/home",
        openFlexTabIfMissing: true
      },
      "2026-04-02",
      scrapeFlowState
    );

    assert.equal(harness.calls.query.length, 3);
    assert.deepEqual(harness.calls.create, [{ url: "https://flex.team/home", active: false }]);
    assert.equal(harness.calls.executeScript.length, 1);
    assert.equal(harness.calls.remove.length, 1);
    assert.equal(harness.hasUpdatedListener(), false);
    assert.equal(scrapeFlowState.reusableTabId, null);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "근무중");
    assert.equal(rows[0].durationLabel, "8시간 12분");
    assert.equal(rows[0].rawEntry.sourceMode, "flexHomeScrape");
    assert.equal(rows[0].rawEntry.queryDate, "2026-04-02");
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("timeline fetchFlexHomeScrapeRows reuses the shared Flex Home scrape", async () => {
  const harness = createChromeHarness();
  const originalChrome = globalThis.chrome;
  globalThis.chrome = harness.chrome;

  try {
    const rows = await fetchTimelineFlexHomeScrapeRows(
      {
        flexHomeUrl: "https://flex.team/home",
        openFlexTabIfMissing: true
      },
      "2026-04-03",
      { reusableTabIds: {} }
    );

    assert.deepEqual(harness.calls.create, [{ url: "https://flex.team/home", active: false }]);
    assert.equal(harness.calls.executeScript.length, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rawEntry.sourceMode, "flexHomeScrape");
    assert.equal(rows[0].rawEntry.queryDate, "2026-04-03");
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("fetchFlexWorkRecordTimeline scrapes and parses today's tooltip timeline", async () => {
  const harness = createChromeHarness([
    {
      ok: true,
      tooltipText: "기록 시작 오전 10:50 기록 종료 기록 중 휴게 기록 오후 12:14 - 오후 5:10",
      title: "내 근무",
      url: "https://flex.team/time-tracking/my-work-record",
      extractedAt: 1712012345678
    }
  ]);
  const originalChrome = globalThis.chrome;
  globalThis.chrome = harness.chrome;

  try {
    const scrapeFlowState = { reusableTabId: null, reusableTabIds: {} };
    const snapshot = await fetchFlexWorkRecordTimeline(
      {
        flexHomeUrl: "https://flex.team/home",
        openFlexTabIfMissing: true
      },
      "2026-04-10",
      scrapeFlowState
    );

    assert.equal(harness.calls.query.length, 3);
    assert.deepEqual(harness.calls.create, [{ url: "https://flex.team/time-tracking/my-work-record", active: false }]);
    assert.equal(harness.calls.executeScript.length, 1);
    assert.equal(snapshot.timeline.date, "2026-04-10");
    assert.equal(snapshot.timeline.isOngoing, true);
    assert.deepEqual(
      snapshot.timeline.events.map((event) => ({ type: event.type, at: event.at })),
      [
        { type: "workStart", at: "10:50" },
        { type: "breakStart", at: "12:14" },
        { type: "breakEnd", at: "17:10" }
      ]
    );
    assert.equal(scrapeFlowState.reusableTabIds.workRecord, 41);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("fetchFlexWorkRecordRows derives summary row from work record timeline only", async () => {
  const harness = createChromeHarness([
    {
      ok: true,
      tooltipText: "기록 시작 오전 10:50 기록 종료 오후 6:47 휴게 기록 오후 12:14 - 오후 1:10",
      title: "내 근무",
      url: "https://flex.team/time-tracking/my-work-record",
      extractedAt: 1712012345678
    }
  ]);
  const originalChrome = globalThis.chrome;
  globalThis.chrome = harness.chrome;

  try {
    const rows = await fetchFlexWorkRecordRows(
      {
        flexHomeUrl: "https://flex.team/time-tracking/my-work-record",
        openFlexTabIfMissing: true
      },
      "2026-04-10",
      { reusableTabIds: {} }
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "퇴근");
    assert.equal(rows[0].durationLabel, "7h 1m");
    assert.equal(rows[0].inLabel, "10:50");
    assert.equal(rows[0].outLabel, "18:47");
    assert.equal(rows[0].rawEntry.sourceMode, "flexWorkRecordScrape");
    assert.ok(rows[0].rawEntry.timeline);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("fetchFlexWorkRecordRows falls back to visible page summary when timeline tooltip is unavailable", async () => {
  const harness = createChromeHarness([
    {
      ok: true,
      tooltipText: "",
      summary: {
        status: "근무중",
        duration: "5시간 23분",
        line: "근무중 5시간 23분"
      },
      title: "내 근무",
      url: "https://flex.team/time-tracking/my-work-record",
      extractedAt: 1712012345678
    }
  ]);
  const originalChrome = globalThis.chrome;
  globalThis.chrome = harness.chrome;

  try {
    const rows = await fetchFlexWorkRecordRows(
      {
        flexHomeUrl: "https://flex.team/time-tracking/my-work-record",
        openFlexTabIfMissing: true
      },
      "2026-04-14",
      { reusableTabIds: {} }
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "근무중");
    assert.equal(rows[0].durationLabel, "5시간 23분");
    assert.notEqual(rows[0].inLabel, "--");
    assert.equal(rows[0].outLabel, "--");
    assert.ok(rows[0].rawEntry.timeline);
    assert.equal(rows[0].rawEntry.timeline.inferred, true);
    assert.deepEqual(rows[0].rawEntry.summary, {
      status: "근무중",
      duration: "5시간 23분",
      line: "근무중 5시간 23분"
    });
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("flexWorktimeWidget ignores stale in-flight scrape after config refresh", async () => {
  const harness = createDeferredChromeHarness();
  const originalChrome = globalThis.chrome;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const document = createFakeDocument();
  const container = new FakeElement("div");
  let config = {
    flexHomeUrl: "https://flex.team/home",
    openFlexTabIfMissing: true,
    refreshMinutes: 5,
    detailUrlTemplate: "",
    openInNewTab: true
  };

  globalThis.chrome = harness.chrome;
  globalThis.document = document;
  globalThis.window = { open() {}, location: { href: "" } };
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};

  try {
    const controller = flexWorktimeWidget.create({
      container,
      getConfig: () => config,
      isEditMode: () => false,
      openSettings: () => {}
    });
    await flushAsync();
    assert.equal(harness.pendingScripts.length, 1);

    config = { ...config, detailUrlTemplate: "https://example.com/worktime?date={date}" };
    controller.refresh();
    await flushAsync();
    assert.equal(harness.pendingScripts.length, 2);

    harness.resolveNextScript({
      ok: true,
      status: "Old",
      duration: "1시간",
      line: "Old 1시간",
      title: "Flex Home",
      url: "https://flex.team/home",
      extractedAt: 1712012345678
    });
    await flushAsync();
    assert.equal(container.textContent.includes("1시간"), false);

    harness.resolveNextScript({
      ok: true,
      status: "New",
      duration: "2시간",
      line: "New 2시간",
      title: "Flex Home",
      url: "https://flex.team/home",
      extractedAt: 1712012345679
    });
    await flushAsync();
    assert.equal(container.textContent.includes("2시간"), true);
    controller.destroy();
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("flexWorktimeWidget renders only the work duration in compact view", async () => {
  const harness = createDeferredChromeHarness();
  const originalChrome = globalThis.chrome;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const container = new FakeElement("div");

  globalThis.chrome = harness.chrome;
  globalThis.document = createFakeDocument();
  globalThis.window = { open() {}, location: { href: "" } };
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};

  try {
    const controller = flexWorktimeWidget.create({
      container,
      getConfig: () => ({
        flexHomeUrl: "https://flex.team/home",
        openFlexTabIfMissing: true,
        refreshMinutes: 5,
        detailUrlTemplate: "",
        openInNewTab: true
      }),
      isEditMode: () => false,
      openSettings: () => {}
    });
    await flushAsync();

    harness.resolveNextScript({
      ok: true,
      status: "Working",
      duration: "3h 10m",
      line: "Working 3h 10m",
      title: "Flex Home",
      url: "https://flex.team/home",
      extractedAt: 1712012345680
    });
    await flushAsync();

    assert.equal(container.className.includes("flex-worktime-compact"), true);
    assert.equal(container.textContent, "3h 10m");
    assert.equal(container.attributes.get("data-sync-tone"), "success");
    controller.destroy();
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("flexWorktimeWidget schedules refresh using configured minutes", async () => {
  const harness = createDeferredChromeHarness();
  const originalChrome = globalThis.chrome;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const delays = [];

  globalThis.chrome = harness.chrome;
  globalThis.document = createFakeDocument();
  globalThis.window = { open() {}, location: { href: "" } };
  globalThis.setTimeout = (_callback, delayMs) => {
    delays.push(delayMs);
    return delays.length;
  };
  globalThis.clearTimeout = () => {};

  try {
    const controller = flexWorktimeWidget.create({
      container: new FakeElement("div"),
      getConfig: () => ({
        flexHomeUrl: "https://flex.team/home",
        openFlexTabIfMissing: true,
        refreshMinutes: 7,
        detailUrlTemplate: "",
        openInNewTab: true
      }),
      isEditMode: () => false,
      openSettings: () => {}
    });
    await flushAsync();
    harness.resolveNextScript({
      ok: true,
      status: "Working",
      duration: "3시간",
      line: "Working 3시간",
      title: "Flex Home",
      url: "https://flex.team/home",
      extractedAt: 1712012345680
    });
    await flushAsync();

    assert.equal(delays.includes(7 * 60000), true);
    controller.destroy();
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("flexWorktimeTimelineWidget ignores stale in-flight scrape after config refresh", async () => {
  const harness = createDeferredChromeHarness();
  const originalChrome = globalThis.chrome;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const container = new FakeElement("div");
  let config = {
    flexHomeUrl: "https://flex.team/home",
    openFlexTabIfMissing: true,
    dateMode: "custom",
    customDate: "2026-04-10",
    refreshMinutes: 5,
    detailUrlTemplate: "",
    openInNewTab: true
  };

  globalThis.chrome = harness.chrome;
  globalThis.document = createFakeDocument();
  globalThis.window = { open() {}, location: { href: "" } };
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};

  try {
    const controller = flexWorktimeTimelineWidget.create({
      container,
      getConfig: () => config,
      isEditMode: () => false,
      openSettings: () => {}
    });
    await flushAsync();
    assert.equal(harness.pendingScripts.length, 1);

    config = { ...config, customDate: "2026-04-11" };
    controller.refresh();
    await flushAsync();
    assert.equal(harness.pendingScripts.length, 2);

    harness.resolveNextScript({
      ok: true,
      tooltipText: "",
      summary: { status: "Old", duration: "1시간", line: "Old 1시간" },
      title: "Flex Work Record",
      url: "https://flex.team/time-tracking/my-work-record",
      extractedAt: 1712012345681
    });
    await flushAsync();
    assert.equal(container.textContent.includes("1시간"), false);

    harness.resolveNextScript({
      ok: true,
      tooltipText: "",
      summary: { status: "New", duration: "2시간", line: "New 2시간" },
      title: "Flex Work Record",
      url: "https://flex.team/time-tracking/my-work-record",
      extractedAt: 1712012345682
    });
    await flushAsync();
    assert.equal(container.textContent.includes("2시간"), true, container.textContent);
    controller.destroy();
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("flexWorktimeTimelineWidget invalid date refresh cancels in-flight scrape", async () => {
  const harness = createDeferredChromeHarness();
  const originalChrome = globalThis.chrome;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const container = new FakeElement("div");
  let config = {
    flexHomeUrl: "https://flex.team/home",
    openFlexTabIfMissing: true,
    dateMode: "custom",
    customDate: "2026-04-10",
    refreshMinutes: 5,
    detailUrlTemplate: "",
    openInNewTab: true
  };

  globalThis.chrome = harness.chrome;
  globalThis.document = createFakeDocument();
  globalThis.window = { open() {}, location: { href: "" } };
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};

  try {
    const controller = flexWorktimeTimelineWidget.create({
      container,
      getConfig: () => config,
      isEditMode: () => false,
      openSettings: () => {}
    });
    await flushAsync();
    assert.equal(harness.pendingScripts.length, 1);

    config = { ...config, customDate: "bad-date" };
    controller.refresh();
    await flushAsync();

    harness.resolveNextScript({
      ok: true,
      tooltipText: "",
      summary: { status: "Old", duration: "1시간", line: "Old 1시간" },
      title: "Flex Work Record",
      url: "https://flex.team/time-tracking/my-work-record",
      extractedAt: 1712012345683
    });
    await flushAsync();

    assert.equal(container.textContent.includes("1시간"), false);
    assert.equal(container.textContent.includes("Sync failed"), true);
    controller.destroy();
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
