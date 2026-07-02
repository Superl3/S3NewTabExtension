import { arrayOrEmpty } from "../core/utils/array.js";
import { normalizeErrorMessage } from "../core/utils/error.js";
import { normalizeIntegerInRange } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";
import {
  buildReviewCandidate,
  normalizeGithubLogin,
  parseTimestamp
} from "./shared/githubReviewInboxLogic.js";
import {
  buildIgnoredScopeKey,
  isIgnoredItem,
  setIgnoredItem
} from "./shared/ignoredItems.js";
import {
  hasScopedItem,
  readScopedItemSnapshot,
  setScopedItem,
  writeScopedItemSnapshot
} from "./shared/scopedItemStorage.js";
import {
  buildGitHubApiHeaders as buildApiHeaders,
  buildGitHubRepoApiUrl,
  buildGitHubRepoPullsPageUrl as buildRepoPullsPageUrl,
  formatGitHubRelativeTimestamp as formatRelativeTimestamp,
  formatGitHubSyncedLabel as formatSyncedLabel,
  GITHUB_API_BASE,
  githubTokenFingerprint as tokenFingerprint,
  matchesGitHubCacheTokenFingerprint,
  normalizeGitHubCachedItemBase as normalizeCachedItemBase,
  normalizeGitHubCachedItems as normalizeCachedItems,
  normalizeGitHubCacheNumber as normalizeCacheNumber,
  normalizeGitHubCacheTimestamp as normalizeCacheTimestamp,
  normalizeGitHubMaxItems as normalizeMaxItems,
  normalizeGitHubRefreshMinutes as normalizeRefreshMinutes,
  normalizeGitHubRepository as normalizeRepository,
  normalizeGitHubReviewerNames as normalizeReviewerNames,
  parseGitHubError,
  parseGitHubJsonResponse
} from "./shared/githubApi.js";

const REVIEW_INBOX_ERROR_FALLBACK = "GitHub review inbox is not available. Check repository and login settings.";
const REVIEW_INBOX_TAB_NEEDS_REVIEW = "needsReview";
const REVIEW_INBOX_TAB_OPENED = "opened";
const REVIEW_INBOX_SWIPE_START_THRESHOLD_PX = 18;
const REVIEW_INBOX_SWIPE_IGNORE_THRESHOLD_RATIO = 0.42;
const REVIEW_INBOX_SWIPE_IGNORE_ANIM_MS = 190;
const REVIEW_INBOX_SWIPE_RESET_ANIM_MS = 170;
const REVIEW_INBOX_SWIPE_VERTICAL_TOLERANCE_RATIO = 0.75;
const REVIEW_INBOX_READ_ITEMS_STORAGE_KEY = "s3:github-review-inbox-read-items:v1";
const REVIEW_INBOX_DETAIL_PAGE_QUERY = { per_page: 100 };

const REVIEW_INBOX_TABS = [
  { id: REVIEW_INBOX_TAB_NEEDS_REVIEW, label: "requested" },
  { id: REVIEW_INBOX_TAB_OPENED, label: "opened" }
];

function normalizeAgingDays(value, fallback) {
  const text = normalizeText(value);
  if (!text) {
    return normalizeIntegerInRange(fallback, fallback, 1, 90);
  }
  return normalizeIntegerInRange(text, fallback, 1, 90);
}

function normalizeReviewInboxTab(value) {
  return value === REVIEW_INBOX_TAB_OPENED
    ? REVIEW_INBOX_TAB_OPENED
    : REVIEW_INBOX_TAB_NEEDS_REVIEW;
}

function splitReviewItemsByTab(items, githubLogin) {
  const needsReview = [];
  const opened = [];
  const normalizedLogin = normalizeGithubLogin(githubLogin);

  for (const item of arrayOrEmpty(items)) {
    if (normalizeGithubLogin(item?.author) === normalizedLogin) {
      opened.push(item);
    } else {
      needsReview.push(item);
    }
  }

  return { needsReview, opened };
}

function sortReviewItemsByCreatedAt(items) {
  return arrayOrEmpty(items).slice().sort((left, right) => {
    const leftCreatedAt = normalizeCacheTimestamp(left?.createdAt);
    const rightCreatedAt = normalizeCacheTimestamp(right?.createdAt);
    if (leftCreatedAt !== rightCreatedAt) {
      if (!leftCreatedAt) {
        return 1;
      }
      if (!rightCreatedAt) {
        return -1;
      }
      return leftCreatedAt - rightCreatedAt;
    }

    return normalizeCacheNumber(left?.number) - normalizeCacheNumber(right?.number);
  });
}

function resolveAgingThresholds(config) {
  const warnDays = normalizeAgingDays(config?.agingWarnDays, 3);
  const requestedDangerDays = normalizeAgingDays(config?.agingDangerDays, 5);
  return {
    warnDays,
    dangerDays: Math.max(warnDays + 1, requestedDangerDays)
  };
}

function computeReviewInboxAgeSeverity(createdAt, config, nowMs = Date.now()) {
  const createdTimestamp = normalizeCacheTimestamp(createdAt);
  if (!createdTimestamp) {
    return "";
  }

  const thresholds = resolveAgingThresholds(config);
  const ageDays = Math.max(0, nowMs - createdTimestamp) / 86400000;
  if (ageDays > thresholds.dangerDays) {
    return "danger";
  }
  if (ageDays > thresholds.warnDays) {
    return "warn";
  }
  return "";
}

function shouldStartReviewInboxSwipe(dx, dy, thresholdPx = REVIEW_INBOX_SWIPE_START_THRESHOLD_PX) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return false;
  }
  if (dx < thresholdPx) {
    return false;
  }
  return Math.abs(dy) <= Math.abs(dx) * REVIEW_INBOX_SWIPE_VERTICAL_TOLERANCE_RATIO;
}

function buildReviewInboxIgnoreScopeKey(config, tabId) {
  return buildIgnoredScopeKey([
    "githubReviewInbox",
    normalizeRepository(config?.repository),
    normalizeGithubLogin(config?.githubLogin),
    normalizeReviewInboxTab(tabId)
  ]);
}

function buildReviewInboxItemKey(item) {
  return normalizeText(item?.number);
}

function buildReviewInboxOpenPullsLabel() {
  return "Open repository pull requests";
}

function buildReviewInboxTabLabel(tabId, count = 0) {
  const normalizedTabId = normalizeReviewInboxTab(tabId);
  const tab = REVIEW_INBOX_TABS.find((candidate) => candidate.id === normalizedTabId);
  const normalizedCount = Math.max(0, Math.round(normalizeCacheNumber(count)));
  return `${tab?.label || "requested"} (${normalizedCount})`;
}

function buildReviewInboxIgnoredToggleIconHref(showIgnored = false) {
  return showIgnored ? "#i-eye" : "#i-eye-off";
}

function readReviewInboxReadSnapshot(storage = undefined) {
  return readScopedItemSnapshot(REVIEW_INBOX_READ_ITEMS_STORAGE_KEY, storage);
}

function writeReviewInboxReadSnapshot(snapshot, storage = undefined) {
  return writeScopedItemSnapshot(REVIEW_INBOX_READ_ITEMS_STORAGE_KEY, snapshot, storage);
}

function buildReviewInboxReadScopeKey(config) {
  return buildIgnoredScopeKey([
    "githubReviewInboxRead",
    normalizeRepository(config?.repository),
    normalizeGithubLogin(config?.githubLogin)
  ]);
}

function readReviewInboxLatestAttentionAt(item) {
  return normalizeCacheTimestamp(item?.latestAttentionAt ?? item?.latestCodeUpdateAt);
}

function buildReviewInboxReadItemKey(item) {
  const number = normalizeText(item?.number);
  if (!number) {
    return "";
  }

  return [
    number,
    readReviewInboxLatestAttentionAt(item),
    normalizeCacheTimestamp(item?.latestParticipationAt),
    normalizeText(item?.reason),
    item?.reviewRequested === true ? "requested" : "not-requested"
  ].join("|");
}

function isReviewInboxItemRead(config, item, storage = undefined) {
  const scopeKey = buildReviewInboxReadScopeKey(config);
  const itemKey = buildReviewInboxReadItemKey(item);
  if (!scopeKey || !itemKey) {
    return false;
  }
  return hasScopedItem(REVIEW_INBOX_READ_ITEMS_STORAGE_KEY, scopeKey, itemKey, storage);
}

function setReviewInboxItemRead(config, item, read = true, storage = undefined) {
  const scopeKey = buildReviewInboxReadScopeKey(config);
  const itemKey = buildReviewInboxReadItemKey(item);
  if (!scopeKey || !itemKey) {
    return false;
  }
  return setScopedItem(REVIEW_INBOX_READ_ITEMS_STORAGE_KEY, scopeKey, itemKey, read, storage);
}

function shouldAutoIgnoreReviewInboxItem(item, tabId) {
  return (
    normalizeReviewInboxTab(tabId) === REVIEW_INBOX_TAB_NEEDS_REVIEW &&
    item?.reviewRequested !== true &&
    normalizeCacheTimestamp(item?.latestParticipationAt) <= 0
  );
}

function decorateReviewItemsForTab(items, config, tabId, showIgnored = false) {
  const scopeKey = buildReviewInboxIgnoreScopeKey(config, tabId);
  const readScopeKey = buildReviewInboxReadScopeKey(config);
  const readKeys = new Set(readReviewInboxReadSnapshot()[readScopeKey] || []);
  const decoratedItems = [];
  let ignoredCount = 0;

  for (const item of arrayOrEmpty(items)) {
    const autoIgnored = shouldAutoIgnoreReviewInboxItem(item, tabId);
    const manuallyIgnored = isIgnoredItem(scopeKey, buildReviewInboxItemKey(item));
    const ignored = autoIgnored || manuallyIgnored;
    if (ignored) {
      ignoredCount += 1;
      if (!showIgnored) {
        continue;
      }
    }
    decoratedItems.push({
      ...item,
      ignored,
      autoIgnored,
      manuallyIgnored,
      read: readKeys.has(buildReviewInboxReadItemKey(item))
    });
  }

  return {
    items: decoratedItems,
    ignoredCount,
    scopeKey
  };
}

function countUnreadReviewItems(...tabDataList) {
  return tabDataList.reduce((total, tabData) => {
    const items = arrayOrEmpty(tabData?.items);
    return total + items.filter((item) => !item.ignored && !item.read).length;
  }, 0);
}

async function fetchJson(url, headers) {
  const response = await fetch(url, {
    headers,
    cache: "no-store"
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(parseGitHubError(bodyText, response.status));
  }

  return parseGitHubJsonResponse(bodyText, null);
}

function findNextPageUrl(linkHeader) {
  const text = normalizeText(linkHeader);
  if (!text) {
    return "";
  }

  const segments = text.split(",");
  for (const segment of segments) {
    const match = segment.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/i);
    if (match?.[2] === "next") {
      return normalizeText(match[1]);
    }
  }

  return "";
}

async function fetchPagedJson(baseUrl, headers, maxPages = 20) {
  const items = [];
  let nextUrl = normalizeText(baseUrl);

  for (let page = 1; page <= maxPages && nextUrl; page += 1) {
    const response = await fetch(nextUrl, {
      headers,
      cache: "no-store"
    });
    const bodyText = await response.text();

    if (!response.ok) {
      throw new Error(parseGitHubError(bodyText, response.status));
    }

    const payload = parseGitHubJsonResponse(bodyText, null);

    const list = arrayOrEmpty(payload);
    items.push(...list);

    const linkHeader = response.headers?.get?.("link") || response.headers?.get?.("Link") || "";
    nextUrl = findNextPageUrl(linkHeader);
    if (!nextUrl && list.length < 100) {
      break;
    }
  }

  return items;
}

function buildOpenPullsApiUrl(repository) {
  return buildGitHubRepoApiUrl(repository, ["pulls"], {
    state: "open",
    sort: "created",
    direction: "asc",
    per_page: 100
  });
}

function normalizeCachedItem(entry) {
  const base = normalizeCachedItemBase(entry);
  if (!base) {
    return null;
  }

  return {
    ...base,
    createdAt: normalizeCacheTimestamp(entry?.createdAt),
    reason: normalizeText(entry?.reason),
    reasonLabel: normalizeText(entry?.reasonLabel),
    latestAttentionAt: readReviewInboxLatestAttentionAt(entry),
    latestParticipationAt: normalizeCacheTimestamp(entry?.latestParticipationAt),
    latestApprovalAt: normalizeCacheTimestamp(entry?.latestApprovalAt),
    warning: normalizeText(entry?.warning)
  };
}

function buildCacheReviewItems(items) {
  return normalizeCachedItems(items, normalizeCachedItem);
}

function normalizedConfig(config) {
  const rawRepository = normalizeText(config?.repository);
  const agingThresholds = resolveAgingThresholds(config);
  return {
    rawRepository,
    repository: normalizeRepository(rawRepository),
    githubLogin: normalizeGithubLogin(config?.githubLogin),
    accessToken: normalizeText(config?.accessToken),
    maxItems: normalizeMaxItems(config?.maxItems, 20),
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, 5),
    agingWarnDays: agingThresholds.warnDays,
    agingDangerDays: agingThresholds.dangerDays,
    openInNewTab: config?.openInNewTab !== false
  };
}

function configSignature(config) {
  return [
    config.repository,
    config.githubLogin,
    tokenFingerprint(config.accessToken),
    config.maxItems,
    config.refreshMinutes,
    config.agingWarnDays,
    config.agingDangerDays,
    config.openInNewTab ? 1 : 0
  ].join("|");
}

function readCachedSnapshot(rawConfig, cfg) {
  if (!cfg.repository || !cfg.githubLogin) {
    return null;
  }

  if (normalizeRepository(rawConfig?.cacheRepository) !== cfg.repository) {
    return null;
  }
  if (normalizeGithubLogin(rawConfig?.cacheGithubLogin) !== cfg.githubLogin) {
    return null;
  }
  if (!matchesGitHubCacheTokenFingerprint(rawConfig?.cacheTokenFingerprint, cfg.accessToken)) {
    return null;
  }

  const cachedItems = normalizeCachedItems(rawConfig?.cacheReviewItems, normalizeCachedItem);
  const cacheAt = normalizeCacheTimestamp(rawConfig?.cacheAt);
  const tokenUserWarning = normalizeText(rawConfig?.cacheTokenUserWarning);
  if (!cachedItems.length && !cacheAt && !tokenUserWarning) {
    return null;
  }

  return {
    reviewItems: sortReviewItemsByCreatedAt(cachedItems),
    cacheAt,
    tokenUserWarning
  };
}

function isReviewInboxSnapshotUnchanged(rawConfig, cfg, items, tokenUserWarning) {
  const currentCacheItems = normalizeCachedItems(rawConfig?.cacheReviewItems, normalizeCachedItem);

  return (
    normalizeRepository(rawConfig?.cacheRepository) === cfg.repository &&
    normalizeGithubLogin(rawConfig?.cacheGithubLogin) === cfg.githubLogin &&
    matchesGitHubCacheTokenFingerprint(rawConfig?.cacheTokenFingerprint, cfg.accessToken) &&
    normalizeText(rawConfig?.cacheTokenUserWarning) === normalizeText(tokenUserWarning) &&
    JSON.stringify(currentCacheItems) === JSON.stringify(buildCacheReviewItems(items))
  );
}

async function fetchAuthenticatedViewerLogin(headers) {
  const viewer = await fetchJson(`${GITHUB_API_BASE}/user`, headers);
  return normalizeGithubLogin(viewer?.login);
}

async function fetchReviewInboxItems(config) {
  const pullsUrl = buildOpenPullsApiUrl(config.repository);
  if (!pullsUrl) {
    throw new Error(config.rawRepository ? "Repository URL is invalid." : "Repository is required.");
  }
  if (!config.githubLogin) {
    throw new Error("GitHub login is required.");
  }

  const headers = buildApiHeaders(config.accessToken);
  let tokenUserWarning = "";
  if (config.accessToken) {
    const viewerLogin = await fetchAuthenticatedViewerLogin(headers);
    if (viewerLogin && viewerLogin !== config.githubLogin) {
      tokenUserWarning = `Token is authenticated as @${viewerLogin}, not @${config.githubLogin}.`;
    }
  }

  const pulls = await fetchPagedJson(pullsUrl, headers, 20);
  const openPulls = pulls.filter((pull) => normalizeText(pull?.state, "open") === "open");

  const reviewItems = [];
  for (const pull of openPulls) {
    const pullNumber = normalizeCacheNumber(pull?.number);
    if (!pullNumber) {
      continue;
    }

    const reviewDetailUrls = [
      ["pulls", pullNumber, "reviews"],
      ["issues", pullNumber, "comments"],
      ["pulls", pullNumber, "comments"],
      ["pulls", pullNumber, "commits"]
    ].map((pathParts) => buildGitHubRepoApiUrl(config.repository, pathParts, REVIEW_INBOX_DETAIL_PAGE_QUERY));
    const [reviews, issueComments, reviewComments, commits] = await Promise.all(
      reviewDetailUrls.map((url) => fetchPagedJson(url, headers, 20))
    );

    const candidate = buildReviewCandidate({
      pullRequest: pull,
      githubLogin: config.githubLogin,
      reviews,
      issueComments,
      reviewComments,
      commits
    });

    if (!candidate.included) {
      continue;
    }

    const requestedReviewers = arrayOrEmpty(pull?.requested_reviewers);
    const requestedTeams = arrayOrEmpty(pull?.requested_teams);
    const reviewerNames = normalizeReviewerNames(requestedReviewers);
    const teamCount = requestedTeams.length;
    reviewItems.push({
      id: String(pull?.id || pull?.number || Math.random()),
      number: pullNumber,
      title: normalizeText(pull?.title, "(No title)"),
      htmlUrl: normalizeText(pull?.html_url),
      author: normalizeText(pull?.user?.login, "unknown"),
      createdAt: parseTimestamp(pull?.created_at),
      draft: pull?.draft === true,
      reviewRequested:
        requestedReviewers.some((reviewer) => normalizeGithubLogin(reviewer?.login) === config.githubLogin) ||
        teamCount > 0,
      reviewerNames,
      teamCount,
      reason: candidate.reason,
      reasonLabel: candidate.reasonLabel,
      latestAttentionAt: candidate.latestAttentionAt,
      latestParticipationAt: candidate.latestParticipationAt,
      latestApprovalAt: candidate.latestApprovalAt,
      warning: tokenUserWarning
    });
  }

  const sortedItems = sortReviewItemsByCreatedAt(reviewItems);
  return {
    reviewItems: sortedItems,
    tokenUserWarning
  };
}

export const githubReviewInboxWidget = {
  type: "githubReviewInbox",
  title: "GitHub Review Inbox",
  defaultConfig: {
    repository: "",
    githubLogin: "",
    accessToken: "",
    maxItems: 20,
    refreshMinutes: 5,
    agingWarnDays: 3,
    agingDangerDays: 5,
    openInNewTab: true,
    cacheRepository: "",
    cacheGithubLogin: "",
    cacheTokenFingerprint: "",
    cacheAt: 0,
    cacheTokenUserWarning: "",
    cacheReviewItems: []
  },
  defaultLayout: {
    x: 720,
    y: 560,
    w: 540,
    h: 360
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [
    {
      key: "repository",
      label: "Repository URL",
      type: "text",
      placeholder: "https://github.com/owner/repo",
      helpText: "Enter owner/repo or a full GitHub repository URL."
    },
    {
      key: "githubLogin",
      label: "GitHub login",
      type: "text",
      placeholder: "your-github-id",
      helpText: "The GitHub user whose review queue should be evaluated."
    },
    {
      key: "accessToken",
      label: "PAT / token",
      type: "password",
      placeholder: "GitHub personal access token",
      helpText: "Recommended first. Needed for private repos and more reliable API access."
    },
    {
      key: "maxItems",
      label: "PRs to show",
      type: "number",
      min: 1,
      max: 50,
      step: 1
    },
    {
      key: "refreshMinutes",
      label: "Refresh every (minutes)",
      type: "number",
      min: 1,
      max: 120,
      step: 1
    },
    {
      key: "agingWarnDays",
      label: "Warn after (days)",
      type: "number",
      min: 1,
      max: 90,
      step: 1
    },
    {
      key: "agingDangerDays",
      label: "Danger after (days)",
      type: "number",
      min: 2,
      max: 90,
      step: 1
    },
    { key: "openInNewTab", label: "Open links in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, patchConfig, isEditMode, openSettings }) {
    container.classList.add("github-pr-widget", "github-review-inbox-widget");

    const shell = document.createElement("div");
    shell.className = "github-pr-widget-shell github-review-inbox-shell";

    const warning = document.createElement("p");
    warning.className = "github-review-inbox-warning";

    const tabs = document.createElement("div");
    tabs.className = "github-review-inbox-tabs";

    const tabBar = document.createElement("div");
    tabBar.className = "github-review-inbox-tab-bar";

    const actions = document.createElement("div");
    actions.className = "github-review-inbox-actions";

    const openPullsButton = document.createElement("button");
    openPullsButton.type = "button";
    openPullsButton.className = "icon-btn github-review-inbox-open-pr";
    openPullsButton.title = buildReviewInboxOpenPullsLabel();
    openPullsButton.setAttribute("aria-label", openPullsButton.title);
    openPullsButton.innerHTML = '<svg class="icon"><use href="#i-open"></use></svg>';
    openPullsButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openRepositoryPage();
    });

    const ignoredToggle = document.createElement("button");
    ignoredToggle.type = "button";
    ignoredToggle.className = "github-review-inbox-ignored-toggle";
    ignoredToggle.hidden = true;
    ignoredToggle.setAttribute("aria-label", "Show ignored pull requests");
    ignoredToggle.title = "Show ignored pull requests";

    const ignoredToggleIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ignoredToggleIcon.setAttribute("class", "icon github-review-inbox-ignored-toggle-icon");
    ignoredToggleIcon.setAttribute("viewBox", "0 0 24 24");
    ignoredToggleIcon.setAttribute("aria-hidden", "true");
    ignoredToggleIcon.innerHTML = `<use href="${buildReviewInboxIgnoredToggleIconHref(false)}"></use>`;
    ignoredToggle.append(ignoredToggleIcon);

    ignoredToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showIgnored = !showIgnored;
      render();
    });

    const tabButtons = new Map();
    for (const tab of REVIEW_INBOX_TABS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "github-review-inbox-tab";
      button.dataset.tab = tab.id;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const nextTab = normalizeReviewInboxTab(tab.id);
        if (nextTab === selectedTab) {
          return;
        }
        selectedTab = nextTab;
        render();
      });
      tabButtons.set(tab.id, button);
      tabs.append(button);
    }

    const list = document.createElement("ul");
    list.className = "github-pr-list github-review-inbox-list";

    const footer = document.createElement("footer");
    footer.className = "github-review-inbox-footer";

    const status = document.createElement("p");
    status.className = "github-pr-widget-status github-review-inbox-status";

    actions.append(openPullsButton, ignoredToggle);
    tabBar.append(tabs, actions);
    footer.append(status);

    shell.append(warning, tabBar, list, footer);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let reviewItems = [];
    let lastSyncedAt = 0;
    let lastSignature = "";
    let requestSerial = 0;
    let timer = null;
    let tokenUserWarning = "";
    let selectedTab = REVIEW_INBOX_TAB_NEEDS_REVIEW;
    let showIgnored = false;
    let activeSwipe = null;
    let suppressClickUntilMs = 0;

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function clearCachedState() {
      reviewItems = [];
      lastSyncedAt = 0;
      tokenUserWarning = "";
    }

    function applyCachedSnapshotIfPresent(rawConfig, cfg) {
      const cached = readCachedSnapshot(rawConfig, cfg);
      if (!cached) {
        return false;
      }
      reviewItems = cached.reviewItems.slice();
      lastSyncedAt = cached.cacheAt;
      tokenUserWarning = cached.tokenUserWarning;
      return true;
    }

    function persistSnapshot(cfg) {
      if (typeof patchConfig !== "function") {
        return;
      }

      const currentCfg = getConfig();
      if (isReviewInboxSnapshotUnchanged(currentCfg, cfg, reviewItems, tokenUserWarning)) {
        return;
      }

      patchConfig({
        cacheRepository: cfg.repository,
        cacheGithubLogin: cfg.githubLogin,
        cacheTokenFingerprint: tokenFingerprint(cfg.accessToken),
        cacheAt: Date.now(),
        cacheTokenUserWarning: tokenUserWarning,
        cacheReviewItems: buildCacheReviewItems(reviewItems)
      }, { mutationKind: "system" });
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      const cfg = normalizedConfig(getConfig());
      timer = setTimeout(() => {
        void loadReviewInbox();
      }, normalizeRefreshMinutes(cfg.refreshMinutes, 5) * 60000);
    }

    function openRepositoryPage() {
      const cfg = normalizedConfig(getConfig());
      const href = buildRepoPullsPageUrl(cfg.repository);
      if (cfg.openInNewTab) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = href;
      }
    }

    function renderWarning() {
      warning.hidden = !tokenUserWarning;
      warning.textContent = tokenUserWarning;
    }

    function renderStatus() {
      const cfg = normalizedConfig(getConfig());
      const splitItems = splitReviewItemsByTab(reviewItems, cfg.githubLogin);
      const needsReviewData = decorateReviewItemsForTab(splitItems.needsReview, cfg, REVIEW_INBOX_TAB_NEEDS_REVIEW, showIgnored);
      const openedData = decorateReviewItemsForTab(splitItems.opened, cfg, REVIEW_INBOX_TAB_OPENED, showIgnored);
      const hiddenIgnoredCount = showIgnored ? 0 : needsReviewData.ignoredCount + openedData.ignoredCount;
      const unreadCount = countUnreadReviewItems(needsReviewData, openedData);
      status.classList.toggle("is-error", Boolean(errorMessage));
      if (loading) {
        status.textContent = "Refreshing review inbox...";
        return;
      }
      if (errorMessage) {
        status.textContent = errorMessage;
        return;
      }
      if (!cfg.rawRepository) {
        status.textContent = "Add repository URL in settings.";
        return;
      }
      if (!cfg.repository) {
        status.textContent = "Repository URL is invalid.";
        return;
      }
      if (!cfg.githubLogin) {
        status.textContent = "Add GitHub login in settings.";
        return;
      }
      const synced = formatSyncedLabel(lastSyncedAt);
      const statusParts = [
        cfg.repository,
        `${needsReviewData.items.length} requested`,
        `${openedData.items.length} opened`
      ];
      if (unreadCount) {
        statusParts.push(`${unreadCount} new`);
      }
      if (hiddenIgnoredCount) {
        statusParts.push(`${hiddenIgnoredCount} ignored PRs`);
      }
      if (synced) {
        statusParts.push(`synced ${synced}`);
      }
      status.textContent = statusParts.join(" / ");
    }

    function renderTabs() {
      const cfg = normalizedConfig(getConfig());
      const splitItems = splitReviewItemsByTab(reviewItems, cfg.githubLogin);
      const counts = {
        [REVIEW_INBOX_TAB_NEEDS_REVIEW]: decorateReviewItemsForTab(
          splitItems.needsReview,
          cfg,
          REVIEW_INBOX_TAB_NEEDS_REVIEW,
          showIgnored
        ).items.length,
        [REVIEW_INBOX_TAB_OPENED]: decorateReviewItemsForTab(
          splitItems.opened,
          cfg,
          REVIEW_INBOX_TAB_OPENED,
          showIgnored
        ).items.length
      };

      for (const tab of REVIEW_INBOX_TABS) {
        const button = tabButtons.get(tab.id);
        if (!button) {
          continue;
        }
        const isActive = normalizeReviewInboxTab(selectedTab) === tab.id;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.textContent = buildReviewInboxTabLabel(tab.id, counts[tab.id] || 0);
      }
    }

    function renderIgnoredToggle() {
      const cfg = normalizedConfig(getConfig());
      const splitItems = splitReviewItemsByTab(reviewItems, cfg.githubLogin);
      const totalIgnored = decorateReviewItemsForTab(
        splitItems.needsReview,
        cfg,
        REVIEW_INBOX_TAB_NEEDS_REVIEW,
        false
      ).ignoredCount + decorateReviewItemsForTab(
        splitItems.opened,
        cfg,
        REVIEW_INBOX_TAB_OPENED,
        false
      ).ignoredCount;

      if (totalIgnored <= 0) {
        showIgnored = false;
        ignoredToggle.hidden = true;
        ignoredToggle.title = "Show ignored pull requests";
        ignoredToggle.setAttribute("aria-label", "Show ignored pull requests");
        ignoredToggle.dataset.count = "0";
        ignoredToggle.classList.remove("active");
        ignoredToggleIcon.innerHTML = `<use href="${buildReviewInboxIgnoredToggleIconHref(false)}"></use>`;
        return;
      }

      ignoredToggle.hidden = false;
      ignoredToggle.title = showIgnored
        ? "Hide ignored pull requests"
        : `Show ignored pull requests (${totalIgnored})`;
      ignoredToggle.setAttribute("aria-label", ignoredToggle.title);
      ignoredToggle.dataset.count = String(totalIgnored);
      ignoredToggle.classList.toggle("active", showIgnored);
      ignoredToggleIcon.innerHTML = `<use href="${buildReviewInboxIgnoredToggleIconHref(showIgnored)}"></use>`;
    }

    function appendBadge(row, text, className = "") {
      const badge = document.createElement("span");
      badge.className = `github-pr-badge${className ? ` ${className}` : ""}`;
      badge.textContent = text;
      row.append(badge);
    }

    function getTabData(config, tabId) {
      const splitItems = splitReviewItemsByTab(reviewItems, config.githubLogin);
      return normalizeReviewInboxTab(tabId) === REVIEW_INBOX_TAB_OPENED
        ? decorateReviewItemsForTab(splitItems.opened, config, REVIEW_INBOX_TAB_OPENED, showIgnored)
        : decorateReviewItemsForTab(splitItems.needsReview, config, REVIEW_INBOX_TAB_NEEDS_REVIEW, showIgnored);
    }

    function setIgnoredState(tabId, item, ignored) {
      const cfg = normalizedConfig(getConfig());
      const scopeKey = buildReviewInboxIgnoreScopeKey(cfg, tabId);
      const changed = setIgnoredItem(scopeKey, buildReviewInboxItemKey(item), ignored);
      if (changed) {
        render();
      }
    }

    function setReadState(item) {
      const cfg = normalizedConfig(getConfig());
      const changed = setReviewInboxItemRead(cfg, item, true);
      if (!changed) {
        return;
      }
      item.read = true;
      setTimeout(() => {
        render();
      }, 0);
    }

    function resetSwipeVisual(row, swipeContent) {
      row.style.setProperty("--github-review-inbox-swipe-x", "0px");
      row.style.setProperty("--github-review-inbox-swipe-progress", "0");
      row.classList.remove("is-swiping", "is-swipe-ignoring");
      row.classList.add("is-swipe-returning");
      swipeContent.style.transform = "";
      setTimeout(() => {
        row.classList.remove("is-swipe-returning");
      }, REVIEW_INBOX_SWIPE_RESET_ANIM_MS);
    }

    function applySwipeVisual(row, swipeContent, x, threshold) {
      const width = Math.max(1, row.clientWidth);
      const clampedX = Math.max(0, Math.min(x, width * 1.05));
      const progress = threshold > 0 ? Math.min(1, clampedX / threshold) : 0;
      row.style.setProperty("--github-review-inbox-swipe-x", `${clampedX}px`);
      row.style.setProperty("--github-review-inbox-swipe-progress", progress.toFixed(3));
      row.classList.add("is-swiping");
      swipeContent.style.transform = `translateX(${clampedX}px)`;
    }

    function clearActiveSwipe() {
      activeSwipe = null;
    }

    function getSwipeIgnoreThreshold(row) {
      return Math.max(1, row.clientWidth * REVIEW_INBOX_SWIPE_IGNORE_THRESHOLD_RATIO);
    }

    function isPointerPressed(event) {
      if (!(event instanceof PointerEvent)) {
        return false;
      }
      if (event.pointerType === "mouse") {
        return (event.buttons & 1) === 1;
      }
      return event.buttons !== 0 || event.pressure > 0;
    }

    function endSwipe(event, isCancel) {
      if (!activeSwipe || event.pointerId !== activeSwipe.pointerId) {
        return;
      }

      const swipe = activeSwipe;
      const { row, swipeContent, item, tabId } = swipe;
      if (row.hasPointerCapture(event.pointerId)) {
        row.releasePointerCapture(event.pointerId);
      }

      if (isCancel) {
        if (swipe.dragging) {
          resetSwipeVisual(row, swipeContent);
        }
        clearActiveSwipe();
        return;
      }

      if (!swipe.dragging) {
        clearActiveSwipe();
        return;
      }

      if (swipe.currentX >= swipe.threshold) {
        suppressClickUntilMs = Date.now() + 240;
        row.classList.remove("is-swiping", "is-swipe-returning");
        row.classList.add("is-swipe-ignoring");
        const ignoreX = Math.max(row.clientWidth + 24, swipe.currentX);
        row.style.setProperty("--github-review-inbox-swipe-x", `${ignoreX}px`);
        swipeContent.style.transform = `translateX(${ignoreX}px)`;
        setTimeout(() => {
          setIgnoredState(tabId, item, true);
        }, REVIEW_INBOX_SWIPE_IGNORE_ANIM_MS);
      } else {
        resetSwipeVisual(row, swipeContent);
      }

      clearActiveSwipe();
    }

    function renderList() {
      list.replaceChildren();
      const cfg = normalizedConfig(getConfig());
      const tabId = normalizeReviewInboxTab(selectedTab);
      const tabData = getTabData(cfg, tabId);
      const visibleItems = tabData.items.slice(0, cfg.maxItems);
      list.classList.toggle("is-empty", visibleItems.length === 0);

      if (!visibleItems.length) {
        const empty = document.createElement("li");
        empty.className = "github-pr-empty github-review-inbox-empty";
        if (loading) {
          empty.textContent = normalizeReviewInboxTab(selectedTab) === REVIEW_INBOX_TAB_OPENED
            ? "Loading pull requests you opened..."
            : "Loading pull requests that need your review...";
        } else if (!cfg.rawRepository) {
          empty.textContent = "Add a repository URL in widget settings to load review requests.";
        } else if (!cfg.repository) {
          empty.textContent = "Repository URL is malformed.";
        } else if (!cfg.githubLogin) {
          empty.textContent = "Add your GitHub login in widget settings to match review requests.";
        } else if (errorMessage) {
          empty.textContent = normalizeReviewInboxTab(selectedTab) === REVIEW_INBOX_TAB_OPENED
            ? "Your pull request inbox is not available. Check the repository and login settings."
            : "Review inbox is not available. Check the repository and login settings.";
        } else {
          empty.textContent = normalizeReviewInboxTab(selectedTab) === REVIEW_INBOX_TAB_OPENED
            ? "No pull requests you opened currently need attention."
            : "No pull requests currently need your review.";
        }
        list.append(empty);
        return;
      }

      for (const item of visibleItems) {
        const ageSeverity = computeReviewInboxAgeSeverity(item.createdAt, cfg);
        const row = document.createElement("li");
        row.className = `github-pr-item github-review-inbox-item${item.draft ? " is-draft" : ""}${item.reviewRequested ? " is-review-requested" : ""}${item.ignored ? " is-ignored" : ""}${item.read ? " is-read" : " is-unread"}${ageSeverity ? ` is-age-${ageSeverity}` : ""}`;

        const swipeBackground = document.createElement("div");
        swipeBackground.className = "github-review-inbox-swipe-background";
        swipeBackground.textContent = item.ignored ? "Ignored" : "Ignore";

        const swipeContent = document.createElement("div");
        swipeContent.className = "github-review-inbox-swipe-content";

        const link = document.createElement("a");
        link.className = "github-pr-link github-review-inbox-link";
        link.href = item.htmlUrl || buildRepoPullsPageUrl(cfg.repository);
        link.target = cfg.openInNewTab ? "_blank" : "_self";
        link.rel = "noreferrer";
        link.addEventListener("click", (event) => {
          if (event.defaultPrevented) {
            return;
          }
          if (!isEditMode?.()) {
            setReadState(item);
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          openSettings?.();
        });

        const top = document.createElement("div");
        top.className = "github-pr-top";

        const title = document.createElement("span");
        title.className = "github-pr-title";
        title.textContent = item.title;

        const updated = document.createElement("span");
        updated.className = "github-pr-updated github-review-inbox-updated";
        updated.textContent = formatRelativeTimestamp(item.latestAttentionAt);

        top.append(title, updated);

        const meta = document.createElement("p");
        meta.className = "github-pr-meta github-review-inbox-meta";
        const openedText = item.createdAt ? ` · Opened ${formatRelativeTimestamp(item.createdAt)}` : "";
        const participationText = item.latestParticipationAt
          ? ` · You last responded ${formatRelativeTimestamp(item.latestParticipationAt)}`
          : "";
        meta.textContent = `#${item.number} by ${item.author}${openedText}${participationText}`;

        const badges = document.createElement("div");
        badges.className = "github-pr-badges github-review-inbox-badges";
        if (!item.ignored && !item.read) {
          appendBadge(badges, "New", "is-new");
        }
        appendBadge(badges, item.reasonLabel, "is-reason");

        if (item.reviewRequested) {
          appendBadge(badges, "Review requested", "is-review");
          if (item.reviewerNames) {
            appendBadge(badges, item.reviewerNames, "is-reviewers");
          } else if (item.teamCount > 0) {
            appendBadge(badges, `Teams: ${item.teamCount}`, "is-reviewers");
          }
        }

        if (item.draft) {
          appendBadge(badges, "Draft", "is-draft");
        }

        if (item.ignored) {
          appendBadge(badges, item.autoIgnored ? "Auto ignored" : "Ignored", "is-ignored");
        }

        link.append(top, meta, badges);

        swipeContent.append(link);

        if (item.ignored && !item.autoIgnored) {
          const ignoredActions = document.createElement("div");
          ignoredActions.className = "github-review-inbox-ignored-actions";

          const unignoreButton = document.createElement("button");
          unignoreButton.type = "button";
          unignoreButton.className = "github-review-inbox-unignore";
          unignoreButton.textContent = "Unignore";
          unignoreButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setIgnoredState(tabId, item, false);
          });
          ignoredActions.append(unignoreButton);
          swipeContent.append(ignoredActions);
        } else {
          row.addEventListener("pointerdown", (event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
              return;
            }
            if (event.pointerType === "mouse" && event.button !== 0) {
              return;
            }
            if (target.closest("button, input, select, textarea")) {
              return;
            }

            row.classList.remove("is-swipe-returning", "is-swipe-ignoring", "is-swiping");
            row.style.setProperty("--github-review-inbox-swipe-x", "0px");
            row.style.setProperty("--github-review-inbox-swipe-progress", "0");
            swipeContent.style.transform = "";
            activeSwipe = {
              pointerId: event.pointerId,
              row,
              swipeContent,
              item,
              tabId,
              startX: event.clientX,
              startY: event.clientY,
              currentX: 0,
              dragging: false,
              threshold: getSwipeIgnoreThreshold(row)
            };
          });
        }

        row.append(swipeBackground, swipeContent);
        list.append(row);
      }
    }

    function render() {
      renderWarning();
      renderTabs();
      renderIgnoredToggle();
      renderStatus();
      renderList();
    }

    list.addEventListener("pointermove", (event) => {
      if (!activeSwipe || event.pointerId !== activeSwipe.pointerId) {
        return;
      }

      if (!isPointerPressed(event)) {
        if (activeSwipe.row.hasPointerCapture(activeSwipe.pointerId)) {
          activeSwipe.row.releasePointerCapture(activeSwipe.pointerId);
        }
        if (activeSwipe.dragging) {
          resetSwipeVisual(activeSwipe.row, activeSwipe.swipeContent);
        }
        clearActiveSwipe();
        return;
      }

      const dx = event.clientX - activeSwipe.startX;
      const dy = event.clientY - activeSwipe.startY;

      if (!activeSwipe.dragging) {
        if (Math.abs(dx) < REVIEW_INBOX_SWIPE_START_THRESHOLD_PX && Math.abs(dy) < REVIEW_INBOX_SWIPE_START_THRESHOLD_PX) {
          return;
        }
        if (!shouldStartReviewInboxSwipe(dx, dy)) {
          if (activeSwipe.row.hasPointerCapture(event.pointerId)) {
            activeSwipe.row.releasePointerCapture(event.pointerId);
          }
          clearActiveSwipe();
          return;
        }
        activeSwipe.dragging = true;
        activeSwipe.row.setPointerCapture(event.pointerId);
      }

      event.preventDefault();
      activeSwipe.currentX = Math.max(0, dx);
      applySwipeVisual(activeSwipe.row, activeSwipe.swipeContent, activeSwipe.currentX, activeSwipe.threshold);
    });

    list.addEventListener("pointerup", (event) => {
      endSwipe(event, false);
    });

    list.addEventListener("pointercancel", (event) => {
      endSwipe(event, true);
    });

    list.addEventListener(
      "click",
      (event) => {
        if (Date.now() >= suppressClickUntilMs) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    async function loadReviewInbox() {
      const requestId = ++requestSerial;
      loading = true;
      errorMessage = "";
      render();

      try {
        const cfg = normalizedConfig(getConfig());
        if (!cfg.rawRepository || !cfg.githubLogin) {
          clearCachedState();
          lastSignature = configSignature(cfg);
          return;
        }
        if (!cfg.repository) {
          throw new Error("Repository URL is invalid.");
        }

        tokenUserWarning = "";
        const result = await fetchReviewInboxItems(cfg);
        if (requestId !== requestSerial) {
          return;
        }

        reviewItems = result.reviewItems;
        tokenUserWarning = result.tokenUserWarning;
        lastSyncedAt = Date.now();
        lastSignature = configSignature(cfg);
        persistSnapshot(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }
        errorMessage = normalizeErrorMessage(error, REVIEW_INBOX_ERROR_FALLBACK);
      } finally {
        if (requestId !== requestSerial) {
          return;
        }
        loading = false;
        render();
        scheduleRefresh();
      }
    }

    const initialRawConfig = getConfig();
    const initialConfig = normalizedConfig(initialRawConfig);
    lastSignature = configSignature(initialConfig);
    if (!applyCachedSnapshotIfPresent(initialRawConfig, initialConfig)) {
      clearCachedState();
    }
    render();
    void loadReviewInbox();

    return {
      refresh() {
        const cfg = normalizedConfig(getConfig());
        const signature = configSignature(cfg);
        render();
        if (!loading && signature !== lastSignature) {
          lastSignature = signature;
          if (!applyCachedSnapshotIfPresent(getConfig(), cfg)) {
            clearCachedState();
          }
          render();
          void loadReviewInbox();
          return;
        }
        scheduleRefresh();
      },
      manualRefresh() {
        return loadReviewInbox();
      },
      openRepository() {
        openRepositoryPage();
      },
      destroy() {
        requestSerial += 1;
        clearRefreshTimer();
      }
    };
  }
};

export {
  buildOpenPullsApiUrl,
  buildRepoPullsPageUrl,
  buildCacheReviewItems,
  buildReviewInboxIgnoredToggleIconHref,
  buildReviewInboxOpenPullsLabel,
  buildReviewInboxTabLabel,
  buildReviewInboxReadItemKey,
  buildReviewInboxReadScopeKey,
  computeReviewInboxAgeSeverity,
  fetchReviewInboxItems,
  fetchPagedJson,
  findNextPageUrl,
  isReviewInboxItemRead,
  isReviewInboxSnapshotUnchanged,
  normalizeAgingDays,
  normalizeRepository,
  normalizeReviewInboxTab,
  normalizedConfig,
  parseTimestamp,
  readReviewInboxReadSnapshot,
  REVIEW_INBOX_READ_ITEMS_STORAGE_KEY,
  resolveAgingThresholds,
  setReviewInboxItemRead,
  shouldAutoIgnoreReviewInboxItem,
  shouldStartReviewInboxSwipe,
  sortReviewItemsByCreatedAt,
  splitReviewItemsByTab,
  writeReviewInboxReadSnapshot
};
