import { normalizeErrorMessage } from "../core/utils/error.js";
import { parseJsonOrNull } from "../core/utils/json.js";
import { isPlainObject } from "../core/utils/object.js";
import { normalizeText } from "../core/utils/text.js";
import { hasScriptingApi } from "../core/platform/chrome-scripting.js";
import {
  createTab,
  getTabIfExists,
  hasTabsApi,
  queryTabs,
  removeTab,
  updateTab,
  waitForTabReady
} from "../core/platform/chrome-tabs.js";
import {
  createFlexAuthRequiredError,
  FLEX_AUTH_FLOW_PENDING_MESSAGE,
  isFlexAuthRequiredError
} from "./shared/flexAuth.js";
import { extractFlexHomeWorktimeFromTab } from "./shared/flexHomeScrape.js";
import {
  isLikelyOngoingFlexAuthFlowUrl,
  isMatchingFlexHomeTabUrl,
  isMatchingFlexLoginTabUrl,
  parseFlexHomeTargetUrl
} from "./shared/flexUrls.js";
import {
  formatFlexSourceError,
  formatSyncedLabel,
  normalizeCachedWorktimeRow as normalizeCachedRow,
  normalizeFlexHomeScrapeRow,
  normalizeFlexHomeUrl,
  normalizeFlexRefreshMinutes as normalizeRefreshMinutes,
  normalizeTabId,
  resolveFlexWorktimeDetailUrl as resolveDetailUrl,
  toCachedWorktimeRow as toCachedRow,
  toLocalDateKey
} from "./shared/flexWorktimeRows.js";
import { pruneCacheIndex, touchCacheIndex } from "./shared/localStorageCacheIndex.js";

const FLEX_WORKTIME_CACHE_PREFIX = "s3newtab:flex-worktime-cache:v1";
const FLEX_WORKTIME_CACHE_MAX_ENTRIES = 24;
const FLEX_WORKTIME_CACHE_INDEX_KEY = `${FLEX_WORKTIME_CACHE_PREFIX}:__index__`;
const FLEX_WORKTIME_CACHE_INDEX_OPTIONS = {
  prefix: `${FLEX_WORKTIME_CACHE_PREFIX}:`,
  indexKey: FLEX_WORKTIME_CACHE_INDEX_KEY
};
const FLEX_HOME_TAB_LOAD_TIMEOUT_MS = 20000;
const DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES = 1;
const DEFAULT_FLEX_HOME_URL = "https://flex.team/home";

function formatSourceError(config, error) {
  return formatFlexSourceError("Flex Home scrape", error);
}

function configSignature(config) {
  return [
    normalizeText(config.flexHomeUrl),
    config.openFlexTabIfMissing ? 1 : 0,
    normalizeText(config.detailUrlTemplate),
    config.openInNewTab ? 1 : 0
  ].join("|");
}

function requestSignature(config, queryDate) {
  return `${configSignature(config)}|${normalizeText(queryDate)}`;
}

function flexWorktimeCacheStorageKey(config, queryDate) {
  const encodedSignature = encodeURIComponent(configSignature(config));
  const encodedDate = encodeURIComponent(normalizeText(queryDate));
  return `${FLEX_WORKTIME_CACHE_PREFIX}:${encodedSignature}:${encodedDate}`;
}

function readCachedSnapshot(config, queryDate) {
  if (typeof localStorage === "undefined") {
    return null;
  }

  const key = flexWorktimeCacheStorageKey(config, queryDate);
  let raw = "";
  try {
    raw = localStorage.getItem(key) || "";
  } catch {
    return null;
  }

  const parsed = parseJsonOrNull(raw);
  if (!isPlainObject(parsed)) {
    return null;
  }

  const fetchedAt = Number(parsed.fetchedAt);
  const rows = Array.isArray(parsed.rows)
    ? parsed.rows.map(normalizeCachedRow).filter(Boolean)
    : [];

  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) {
    return null;
  }

  return {
    fetchedAt: Math.round(fetchedAt),
    rows
  };
}

function pruneCacheEntries(maxEntries = FLEX_WORKTIME_CACHE_MAX_ENTRIES) {
  if (typeof localStorage === "undefined") {
    return;
  }

  pruneCacheIndex(localStorage, {
    ...FLEX_WORKTIME_CACHE_INDEX_OPTIONS,
    maxEntries
  });
}

function writeCachedSnapshot(config, queryDate, rows, fetchedAt = Date.now()) {
  if (typeof localStorage === "undefined") {
    return;
  }

  const key = flexWorktimeCacheStorageKey(config, queryDate);
  const payload = {
    fetchedAt: Math.max(1, Math.round(Number(fetchedAt) || Date.now())),
    rows: Array.isArray(rows) ? rows.map(toCachedRow).filter(Boolean) : []
  };

  try {
    localStorage.setItem(key, JSON.stringify(payload));
    touchCacheIndex(localStorage, {
      ...FLEX_WORKTIME_CACHE_INDEX_OPTIONS,
      key,
      fetchedAt: payload.fetchedAt,
      maxEntries: FLEX_WORKTIME_CACHE_MAX_ENTRIES
    });
  } catch {
    // noop
  }
}

function resolveQueryDateForSource(config) {
  return toLocalDateKey(new Date());
}

function normalizedConfig(config) {
  return {
    flexHomeUrl: normalizeFlexHomeUrl(config?.flexHomeUrl, DEFAULT_FLEX_HOME_URL),
    openFlexTabIfMissing: config?.openFlexTabIfMissing !== false,
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES),
    detailUrlTemplate: normalizeText(config?.detailUrlTemplate),
    openInNewTab: config?.openInNewTab !== false
  };
}

function ensureFlexHomeScrapeApis() {
  if (!hasTabsApi() || !hasScriptingApi()) {
    throw new Error('Flex Home scrape mode requires "tabs" and "scripting" extension permissions.');
  }
}

function getReusableScrapeTabId(scrapeFlowState) {
  if (!isPlainObject(scrapeFlowState)) {
    return null;
  }
  return normalizeTabId(scrapeFlowState.reusableTabId);
}

function setReusableScrapeTabId(scrapeFlowState, tabId) {
  if (!isPlainObject(scrapeFlowState)) {
    return;
  }
  scrapeFlowState.reusableTabId = normalizeTabId(tabId);
}

function findPreferredFlexTab(tabs, targetUrl) {
  const homeMatch = tabs.find((tab) => isMatchingFlexHomeTabUrl(tab?.url, targetUrl));
  if (homeMatch) {
    return homeMatch;
  }

  return tabs.find((tab) => isMatchingFlexLoginTabUrl(tab?.url, targetUrl)) || null;
}

async function findFlexHomeTab(targetUrl) {
  const activeCurrentWindow = await queryTabs({ active: true, currentWindow: true });
  const activeMatch = findPreferredFlexTab(activeCurrentWindow, targetUrl);
  if (activeMatch) {
    return activeMatch;
  }

  const currentWindowTabs = await queryTabs({ currentWindow: true });
  const currentMatch = findPreferredFlexTab(currentWindowTabs, targetUrl);
  if (currentMatch) {
    return currentMatch;
  }

  const allTabs = await queryTabs({});
  return findPreferredFlexTab(allTabs, targetUrl);
}

export async function fetchFlexHomeScrapeRows(config, queryDate, scrapeFlowState = null) {
  ensureFlexHomeScrapeApis();
  const targetUrl = parseFlexHomeTargetUrl(config.flexHomeUrl);

  let targetTab = null;
  let temporaryTabManaged = false;
  let keepTemporaryTabOpen = false;

  const reusableTabId = getReusableScrapeTabId(scrapeFlowState);
  if (reusableTabId !== null) {
    targetTab = await getTabIfExists(reusableTabId);
    if (targetTab) {
      temporaryTabManaged = true;
    } else {
      setReusableScrapeTabId(scrapeFlowState, null);
    }
  }

  if (!targetTab) {
    targetTab = await findFlexHomeTab(targetUrl);
  }

  if (!targetTab) {
    if (!config.openFlexTabIfMissing) {
      throw new Error(
        `No Flex Home tab found for ${targetUrl.toString()}. Open it first or enable "Open Flex tab if missing".`
      );
    }

    targetTab = await createTab({
      url: targetUrl.toString(),
      active: false
    });
    temporaryTabManaged = true;
  }

  const tabId = normalizeTabId(targetTab?.id);
  if (tabId === null) {
    setReusableScrapeTabId(scrapeFlowState, null);
    throw new Error("Unable to access Flex Home tab.");
  }

  if (temporaryTabManaged) {
    setReusableScrapeTabId(scrapeFlowState, tabId);
  }

  try {
    await waitForTabReady(tabId, { timeoutMs: FLEX_HOME_TAB_LOAD_TIMEOUT_MS });
    const extracted = await extractFlexHomeWorktimeFromTab(tabId);
    return [normalizeFlexHomeScrapeRow(extracted, queryDate, targetUrl.toString())];
  } catch (error) {
    if (temporaryTabManaged) {
      const currentTab = await getTabIfExists(tabId);
      const currentTabUrl = normalizeText(currentTab?.url, normalizeText(targetTab?.url));
      const authFlowLikely =
        isFlexAuthRequiredError(error) ||
        isLikelyOngoingFlexAuthFlowUrl(currentTabUrl, targetUrl);

      if (authFlowLikely) {
        keepTemporaryTabOpen = true;
        setReusableScrapeTabId(scrapeFlowState, tabId);
        try {
          await updateTab(tabId, { active: true });
        } catch {
          // noop
        }
        throw createFlexAuthRequiredError(FLEX_AUTH_FLOW_PENDING_MESSAGE);
      }
    }
    throw error;
  } finally {
    if (temporaryTabManaged && !keepTemporaryTabOpen) {
      try {
        await removeTab(tabId);
      } catch {
        // noop
      }
      setReusableScrapeTabId(scrapeFlowState, null);
    }
  }
}

async function fetchRowsBySource(config, queryDate, scrapeFlowState = null) {
  return fetchFlexHomeScrapeRows(config, queryDate, scrapeFlowState);
}

export const flexWorktimeWidget = {
  type: "flexWorktime",
  title: "Flex Worktime",
  defaultConfig: {
    flexHomeUrl: "https://flex.team/home",
    openFlexTabIfMissing: true,
    refreshMinutes: DEFAULT_FLEX_WORKTIME_REFRESH_MINUTES,
    detailUrlTemplate: "",
    openInNewTab: true
  },
  defaultLayout: {
    x: 660,
    y: 220,
    w: 300,
    h: 150
  },
  defaultGridSize: {
    w: 2,
    h: 1
  },
  settingsSchema: [
    {
      key: "flexHomeUrl",
      label: "Flex Home URL",
      type: "text",
      placeholder: "https://flex.team/home",
      helpText: "Reads the visible summary text from your logged-in flex.team/home tab."
    },
    {
      key: "openFlexTabIfMissing",
      label: "Open Flex tab if missing",
      type: "checkbox",
      helpText: "If enabled, the widget opens Flex Home in a background tab, scrapes, then closes it."
    },
    {
      key: "refreshMinutes",
      label: "Refresh every (minutes)",
      type: "number",
      min: 1,
      max: 720,
      step: 1
    },
    {
      key: "detailUrlTemplate",
      label: "Detail URL template (optional)",
      type: "text",
      placeholder: "https://example.com/worktime?date={date}&id={id}"
    },
    { key: "openInNewTab", label: "Open detail in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, isEditMode, openSettings }) {
    container.classList.add("flex-worktime-widget", "flex-worktime-compact");

    const shell = document.createElement("div");
    shell.className = "flex-worktime-shell";
    shell.tabIndex = 0;
    shell.setAttribute("aria-label", "Flex Worktime");

    const toolbar = document.createElement("div");
    toolbar.className = "flex-worktime-toolbar";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "icon-btn flex-worktime-refresh-btn";
    refreshBtn.title = "Refresh flex worktime";
    refreshBtn.setAttribute("aria-label", "Refresh flex worktime");
    refreshBtn.innerHTML = '<svg class="icon"><use href="#i-reset"></use></svg>';

    toolbar.append(refreshBtn);

    const list = document.createElement("ul");
    list.className = "flex-worktime-list";

    shell.append(toolbar, list);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let rows = [];
    let lastSyncedAt = 0;
    let lastRequestSig = "";
    let lastQueryDate = "";
    let timer = null;
    let refreshPausedWhileHidden = false;
    let requestSerial = 0;
    const scrapeFlowState = { reusableTabId: null };

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        refreshPausedWhileHidden = true;
        clearRefreshTimer();
        return;
      }

      if (refreshPausedWhileHidden) {
        refreshPausedWhileHidden = false;
        void loadWorktime();
        return;
      }

      scheduleRefresh();
    }

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      if (document.visibilityState === "hidden") {
        refreshPausedWhileHidden = true;
        return;
      }

      refreshPausedWhileHidden = false;
      const cfg = normalizedConfig(getConfig());
      const delayMs = cfg.refreshMinutes * 60000;
      timer = setTimeout(() => {
        void loadWorktime();
      }, delayMs);
    }

    function applyCachedSnapshotIfPresent(config, queryDate) {
      const cached = readCachedSnapshot(config, queryDate);
      if (!cached) {
        return false;
      }

      rows = cached.rows;
      lastSyncedAt = cached.fetchedAt;
      return true;
    }

    function openResolvedDetailHref(href, config) {
      if (!href) {
        return false;
      }

      if (config.openInNewTab) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = href;
      }
      return true;
    }

    function openDetailInternal(entry) {
      const cfg = normalizedConfig(getConfig());
      let queryDate = lastQueryDate;
      try {
        queryDate = resolveQueryDateForSource(cfg);
      } catch {
        if (!queryDate) {
          return false;
        }
      }

      const href = resolveDetailUrl(cfg, queryDate, entry);
      return openResolvedDetailHref(href, cfg);
    }

    function resolveSyncState() {
      if (loading) {
        return {
          label: rows.length ? "Syncing..." : "Loading...",
          tone: "loading",
          tooltip: rows.length ? "Refreshing cached worktime data." : "Loading worktime data."
        };
      }

      if (errorMessage) {
        return {
          label: "Sync failed",
          tone: "error",
          tooltip: errorMessage
        };
      }

      const synced = formatSyncedLabel(lastSyncedAt);
      if (synced) {
        return {
          label: `Synced ${synced}`,
          tone: "success",
          tooltip: `Last synced at ${synced}`
        };
      }

      return {
        label: "Not synced",
        tone: "idle",
        tooltip: "No sync history yet."
      };
    }

    function renderList(config, queryDate) {
      list.replaceChildren();

      const primaryRow = rows.length > 0 ? rows[0] : null;
      const detailHref = primaryRow ? resolveDetailUrl(config, queryDate, primaryRow) : "";
      const clickable = Boolean(detailHref);
      const syncState = resolveSyncState();
      container.setAttribute("data-sync-tone", syncState.tone);
      shell.title = syncState.tooltip;

      const rowItem = document.createElement("li");
      rowItem.className = "flex-worktime-row";

      const entry = clickable ? document.createElement("button") : document.createElement("div");
      if (clickable) {
        entry.type = "button";
      }
      entry.className = `flex-worktime-entry${clickable ? " is-clickable" : ""}`;

      if (clickable) {
        entry.title = "Open detail";
        entry.addEventListener("click", (event) => {
          if (isEditMode?.()) {
            event.preventDefault();
            event.stopPropagation();
            openSettings?.();
            return;
          }
          openResolvedDetailHref(detailHref, config);
        });
      }

      const duration = document.createElement("p");
      duration.className = "flex-worktime-duration";
      duration.textContent = normalizeText(primaryRow?.durationLabel, "--");
      duration.title = syncState.tooltip;

      entry.append(duration);
      rowItem.append(entry);
      list.append(rowItem);
    }

    function render() {


      const cfg = normalizedConfig(getConfig());

      let queryDate = lastQueryDate;
      try {
        queryDate = resolveQueryDateForSource(cfg);
      } catch {
        // keep previous queryDate
      }

      refreshBtn.disabled = loading;
      refreshBtn.title = loading ? "Refreshing..." : "Refresh flex worktime";
      renderList(cfg, queryDate);
    }

    async function loadWorktime() {
      if (document.visibilityState === "hidden") {
        refreshPausedWhileHidden = true;
        clearRefreshTimer();
        return;
      }

      const requestId = ++requestSerial;
      let cfg;
      let queryDate;
      let nextRequestSig;

      try {
        cfg = normalizedConfig(getConfig());
        queryDate = resolveQueryDateForSource(cfg);
        nextRequestSig = requestSignature(cfg, queryDate);
      } catch (error) {
        loading = false;
        errorMessage = cfg ? formatSourceError(cfg, error) : normalizeErrorMessage(error);
        render();
        scheduleRefresh();
        return;
      }

      loading = true;
      errorMessage = "";
      lastQueryDate = queryDate;
      lastRequestSig = nextRequestSig;
      render();

      try {
        const fetchedRows = await fetchRowsBySource(cfg, queryDate, scrapeFlowState);
        if (requestId !== requestSerial) {
          return;
        }

        rows = fetchedRows;
        lastSyncedAt = Date.now();
        writeCachedSnapshot(cfg, queryDate, rows, lastSyncedAt);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }
        errorMessage = formatSourceError(cfg, error);
      } finally {
        if (requestId !== requestSerial) {
          return;
        }
        loading = false;
        render();
        scheduleRefresh();
      }
    }

    refreshBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (loading) {
        return;
      }
      void loadWorktime();
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    let initialConfig;
    try {
      initialConfig = normalizedConfig(getConfig());
      const initialDate = resolveQueryDateForSource(initialConfig);
      lastQueryDate = initialDate;
      lastRequestSig = requestSignature(initialConfig, initialDate);
      applyCachedSnapshotIfPresent(initialConfig, initialDate);
    } catch (error) {
      errorMessage = initialConfig ? formatSourceError(initialConfig, error) : normalizeErrorMessage(error);
    }

    render();
    void loadWorktime();

    return {
      refresh() {
        const cfg = normalizedConfig(getConfig());
        let queryDate = "";

        try {
          queryDate = resolveQueryDateForSource(cfg);
        } catch (error) {
          requestSerial += 1;
          loading = false;
          errorMessage = formatSourceError(cfg, error);
          render();
          scheduleRefresh();
          return;
        }

        const nextSig = requestSignature(cfg, queryDate);
        render();

        if (nextSig !== lastRequestSig) {
          requestSerial += 1;
          loading = false;
          lastRequestSig = nextSig;
          lastQueryDate = queryDate;
          errorMessage = "";

          if (!applyCachedSnapshotIfPresent(cfg, queryDate)) {
            rows = [];
            lastSyncedAt = 0;
          }

          render();
          void loadWorktime();
          return;
        }

        scheduleRefresh();
      },
      manualRefresh() {
        return loadWorktime();
      },
      destroy() {
        requestSerial += 1;
        clearRefreshTimer();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        scrapeFlowState.reusableTabId = null;
      },
      openDetail(entry) {
        return openDetailInternal(entry);
      }
    };
  }
};
