import { arrayOrEmpty } from "../core/utils/array.js";
import { normalizeErrorMessage } from "../core/utils/error.js";
import { normalizeText } from "../core/utils/text.js";
import {
  buildGitHubApiHeaders,
  buildGitHubRepoApiUrl,
  buildGitHubRepoPullsPageUrl as buildRepoPullsPageUrl,
  formatGitHubRelativeTimestamp as formatUpdatedLabelFromTimestamp,
  formatGitHubSyncedLabel as formatSyncedLabel,
  matchesGitHubCacheTokenFingerprint,
  normalizeGitHubCacheCount as normalizeCacheCount,
  normalizeGitHubCacheNumber as normalizeCacheNumber,
  normalizeGitHubCacheTimestamp as normalizeCacheTimestamp,
  githubTokenFingerprint as tokenFingerprint,
  normalizeGitHubMaxItems as normalizeMaxItems,
  normalizeGitHubRefreshMinutes as normalizeRefreshMinutes,
  normalizeGitHubRepository as normalizeRepository,
  normalizeGitHubReviewerNames as normalizeReviewerNames,
  parseGitHubError,
  parseGitHubJsonResponse
} from "./shared/githubApi.js";

const GITHUB_PR_ERROR_FALLBACK = "GitHub pull requests are not available. Check the repository setting and try again.";

function normalizeCachedPullItem(entry) {
  const id = normalizeText(entry?.id);
  if (!id) {
    return null;
  }

  const normalizedUpdatedAt = normalizeCacheTimestamp(entry?.updatedAt);

  return {
    id,
    number: normalizeCacheNumber(entry?.number),
    title: normalizeText(entry?.title, "(No title)"),
    htmlUrl: normalizeText(entry?.htmlUrl),
    author: normalizeText(entry?.author, "unknown"),
    draft: entry?.draft === true,
    updatedAt: normalizedUpdatedAt,
    updatedLabel:
      normalizeText(entry?.updatedLabel) ||
      formatUpdatedLabelFromTimestamp(normalizedUpdatedAt),
    headRef: normalizeText(entry?.headRef),
    baseRef: normalizeText(entry?.baseRef),
    reviewRequested: entry?.reviewRequested === true,
    reviewerNames: normalizeText(entry?.reviewerNames),
    teamCount: normalizeCacheCount(entry?.teamCount)
  };
}

function toCachedPullItem(entry) {
  const normalized = normalizeCachedPullItem(entry);
  if (!normalized) {
    return null;
  }

  const { updatedLabel, ...cachedItem } = normalized;
  return cachedItem;
}

function sortPullItemsByUpdatedAt(items) {
  return arrayOrEmpty(items).slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

function readCachedSnapshot(rawConfig, cfg) {
  if (!cfg.repository) {
    return null;
  }

  const cachedRepository = normalizeRepository(rawConfig?.cacheRepository);
  if (!cachedRepository || cachedRepository !== cfg.repository) {
    return null;
  }

  if (!matchesGitHubCacheTokenFingerprint(rawConfig?.cacheTokenFingerprint, cfg.accessToken, true)) {
    return null;
  }

  const cachedPullItems = arrayOrEmpty(rawConfig?.cachePullItems)
    .map(normalizeCachedPullItem)
    .filter(Boolean);
  const cacheAt = normalizeCacheTimestamp(rawConfig?.cacheAt);
  if (!cachedPullItems.length && !cacheAt) {
    return null;
  }

  return {
    pullItems: sortPullItemsByUpdatedAt(cachedPullItems).slice(0, cfg.maxItems),
    cacheAt
  };
}

function normalizedConfig(config) {
  return {
    repository: normalizeRepository(config?.repository),
    accessToken: normalizeText(config?.accessToken),
    maxItems: normalizeMaxItems(config?.maxItems, 20),
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, 1),
    openInNewTab: config?.openInNewTab !== false,
    showBranchInfo: config?.showBranchInfo !== false,
    showReviewerInfo: config?.showReviewerInfo !== false
  };
}

function configSignature(config) {
  return [
    config.repository,
    tokenFingerprint(config.accessToken),
    config.maxItems,
    config.refreshMinutes,
    config.openInNewTab ? 1 : 0,
    config.showBranchInfo ? 1 : 0,
    config.showReviewerInfo ? 1 : 0
  ].join("|");
}

async function fetchPullRequests(config) {
  const pullsUrl = buildGitHubRepoApiUrl(config.repository, ["pulls"], {
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: normalizeMaxItems(config.maxItems, 20)
  });
  if (!pullsUrl) {
    throw new Error("Repository is required (owner/repo).");
  }

  const headers = buildGitHubApiHeaders(config.accessToken);

  const response = await fetch(pullsUrl, {
    headers,
    cache: "no-store"
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(parseGitHubError(bodyText, response.status));
  }

  const payload = parseGitHubJsonResponse(bodyText, []);

  const list = arrayOrEmpty(payload);

  const mapped = list.map((item) => {
    const reviewerNames = normalizeReviewerNames(item?.requested_reviewers);
    const teamCount = arrayOrEmpty(item?.requested_teams).length;
    const reviewRequested = Boolean(reviewerNames) || teamCount > 0;
    const updatedAtRaw = normalizeText(item?.updated_at);
    const updatedAt = Date.parse(updatedAtRaw);

    return {
      id: String(item?.id || item?.number || Math.random()),
      number: normalizeCacheNumber(item?.number),
      title: normalizeText(item?.title, "(No title)"),
      htmlUrl: normalizeText(item?.html_url),
      author: normalizeText(item?.user?.login, "unknown"),
      draft: item?.draft === true,
      updatedAt: normalizeCacheTimestamp(updatedAt),
      updatedLabel: formatUpdatedLabelFromTimestamp(updatedAt),
      headRef: normalizeText(item?.head?.ref),
      baseRef: normalizeText(item?.base?.ref),
      reviewRequested,
      reviewerNames,
      teamCount
    };
  });

  return sortPullItemsByUpdatedAt(mapped);
}

export const githubPrListWidget = {
  type: "githubPrList",
  title: "GitHub PRs",
  defaultConfig: {
    repository: "",
    accessToken: "",
    maxItems: 20,
    refreshMinutes: 1,
    openInNewTab: true,
    showBranchInfo: true,
    showReviewerInfo: true,
    cacheRepository: "",
    cacheTokenFingerprint: "",
    cacheAt: 0,
    cachePullItems: []
  },
  defaultLayout: {
    x: 560,
    y: 560,
    w: 540,
    h: 340
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [
    {
      key: "repository",
      label: "Repository",
      type: "text",
      placeholder: "owner/repo",
      helpText: "Enter owner/repo or a full GitHub repository URL."
    },
    {
      key: "accessToken",
      label: "Access token (optional)",
      type: "password",
      placeholder: "GitHub token",
      helpText: "Needed for private repos and higher API limits."
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
    { key: "showBranchInfo", label: "Show branch refs", type: "checkbox" },
    { key: "showReviewerInfo", label: "Show requested reviewers", type: "checkbox" },
    { key: "openInNewTab", label: "Open links in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, patchConfig, isEditMode, openSettings }) {
    container.classList.add("github-pr-widget");

    const shell = document.createElement("div");
    shell.className = "github-pr-widget-shell";

    const status = document.createElement("p");
    status.className = "github-pr-widget-status";

    const list = document.createElement("ul");
    list.className = "github-pr-list";

    shell.append(list, status);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let pullItems = [];
    let lastSignature = "";
    let lastSyncedAt = 0;
    let requestSerial = 0;
    let timer = null;

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function applyCachedSnapshotIfPresent(rawConfig, cfg) {
      const cached = readCachedSnapshot(rawConfig, cfg);
      if (!cached) {
        return false;
      }

      pullItems = cached.pullItems;
      lastSyncedAt = cached.cacheAt;
      return true;
    }

    function clearCachedState() {
      pullItems = [];
      lastSyncedAt = 0;
    }

    function persistSnapshot(cfg) {
      if (typeof patchConfig !== "function") {
        return;
      }

      const cachePullItems = pullItems
        .map(toCachedPullItem)
        .filter(Boolean)
        .slice(0, normalizeMaxItems(cfg.maxItems, 20));

      const currentCfg = getConfig();
      const currentCachePullItems = arrayOrEmpty(currentCfg?.cachePullItems)
        .map(toCachedPullItem)
        .filter(Boolean);
      const expectedTokenHash = tokenFingerprint(cfg.accessToken);

      const unchanged =
        normalizeRepository(currentCfg?.cacheRepository) === cfg.repository &&
        matchesGitHubCacheTokenFingerprint(currentCfg?.cacheTokenFingerprint, cfg.accessToken) &&
        JSON.stringify(currentCachePullItems) === JSON.stringify(cachePullItems);

      if (unchanged) {
        return;
      }

      patchConfig({
        cacheRepository: cfg.repository,
        cacheTokenFingerprint: expectedTokenHash,
        cacheAt: Date.now(),
        cachePullItems
      }, { mutationKind: "system" });
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      const cfg = normalizedConfig(getConfig());
      const delayMs = normalizeRefreshMinutes(cfg.refreshMinutes, 1) * 60000;
      timer = setTimeout(() => {
        void loadPullRequests();
      }, delayMs);
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

    function renderStatus() {
      const cfg = normalizedConfig(getConfig());
      status.classList.toggle("is-error", Boolean(errorMessage));

      if (loading) {
        status.textContent = "Refreshing pull requests...";
      } else if (errorMessage) {
        status.textContent = errorMessage;
      } else if (!cfg.repository) {
        status.textContent = "Add repository (owner/repo) in settings.";
      } else {
        const synced = formatSyncedLabel(lastSyncedAt);
        status.textContent = `${cfg.repository} \u00b7 ${pullItems.length} open${synced ? ` \u00b7 Synced ${synced}` : ""}`;
      }
    }

    function appendBadge(row, text, className = "") {
      const badge = document.createElement("span");
      badge.className = `github-pr-badge${className ? ` ${className}` : ""}`;
      badge.textContent = text;
      row.append(badge);
    }

    function renderList() {
      list.replaceChildren();
      const cfg = normalizedConfig(getConfig());

      if (!pullItems.length) {
        const empty = document.createElement("li");
        empty.className = "github-pr-empty";
        if (loading) {
          empty.textContent = "Loading pull requests...";
        } else if (!cfg.repository) {
          empty.textContent = "Add a repository in widget settings to load pull requests.";
        } else if (errorMessage) {
          empty.textContent = "Pull requests are not available. Check the repository setting and try again.";
        } else {
          empty.textContent = "No open pull requests.";
        }
        list.append(empty);
        return;
      }

      for (const pull of pullItems) {
        const row = document.createElement("li");
        row.className = `github-pr-item${pull.reviewRequested ? " is-review-requested" : ""}${pull.draft ? " is-draft" : ""}`;

        const link = document.createElement("a");
        link.className = "github-pr-link";
        link.href = pull.htmlUrl || buildRepoPullsPageUrl(cfg.repository);
        link.target = cfg.openInNewTab ? "_blank" : "_self";
        link.rel = "noreferrer";

        link.addEventListener("click", (event) => {
          if (!isEditMode?.()) {
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
        title.textContent = pull.title;

        const updated = document.createElement("span");
        updated.className = "github-pr-updated";
        updated.textContent =
          formatUpdatedLabelFromTimestamp(normalizeCacheTimestamp(pull.updatedAt)) ||
          normalizeText(pull.updatedLabel);

        top.append(title, updated);

        const meta = document.createElement("p");
        meta.className = "github-pr-meta";
        meta.textContent = `#${pull.number} by ${pull.author}`;

        const badges = document.createElement("div");
        badges.className = "github-pr-badges";

        if (pull.draft) {
          appendBadge(badges, "Draft", "is-draft");
        }

        if (pull.reviewRequested) {
          appendBadge(badges, "Review requested", "is-review");
          if (cfg.showReviewerInfo && pull.reviewerNames) {
            appendBadge(badges, pull.reviewerNames, "is-reviewers");
          }
          if (cfg.showReviewerInfo && !pull.reviewerNames && pull.teamCount > 0) {
            appendBadge(badges, `Teams: ${pull.teamCount}`, "is-reviewers");
          }
        }

        if (cfg.showBranchInfo && pull.headRef && pull.baseRef) {
          appendBadge(badges, `${pull.headRef} -> ${pull.baseRef}`, "is-branch");
        }

        link.append(top, meta);
        if (badges.childNodes.length) {
          link.append(badges);
        }

        row.append(link);
        list.append(row);
      }
    }

    function render() {
      renderStatus();
      renderList();
    }

    async function loadPullRequests() {
      const requestId = ++requestSerial;
      loading = true;
      errorMessage = "";
      render();

      try {
        const cfg = normalizedConfig(getConfig());
        if (!cfg.repository) {
          clearCachedState();
          lastSignature = configSignature(cfg);
          return;
        }
        const pulls = await fetchPullRequests(cfg);

        if (requestId !== requestSerial) {
          return;
        }

        pullItems = pulls.slice(0, cfg.maxItems);
        lastSignature = configSignature(cfg);
        lastSyncedAt = Date.now();
        persistSnapshot(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }
        errorMessage = normalizeErrorMessage(error, GITHUB_PR_ERROR_FALLBACK);
      } finally {
        if (requestId !== requestSerial) {
          return;
        }
        loading = false;
        render();
        scheduleRefresh();
      }
    }

    const initialRawCfg = getConfig();
    const initialCfg = normalizedConfig(initialRawCfg);
    lastSignature = configSignature(initialCfg);
    if (!applyCachedSnapshotIfPresent(initialRawCfg, initialCfg)) {
      clearCachedState();
    }
    render();
    void loadPullRequests();

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
          void loadPullRequests();
          return;
        }
        scheduleRefresh();
      },
      manualRefresh() {
        return loadPullRequests();
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
