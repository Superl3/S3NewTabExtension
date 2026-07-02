import { normalizeErrorMessage } from "../core/utils/error.js";
import { clamp } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_WEB_BASE = "https://github.com";
const GITHUB_PR_ERROR_FALLBACK = "GitHub pull requests are not available. Check the repository setting and try again.";

function normalizeMaxItems(value, fallback = 20) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 50);
  }
  return clamp(Math.round(num), 1, 50);
}

function normalizeRefreshMinutes(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 120);
  }
  return clamp(Math.round(num), 1, 120);
}

function isRepoSegment(value) {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function normalizeRepository(value, fallback = "") {
  let text = normalizeText(value, fallback)
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/^\/+|\/+$/g, "");

  if (!text) {
    return "";
  }

  if (text.endsWith(".git")) {
    text = text.slice(0, -4);
  }

  const parts = text.split("/").filter(Boolean);
  if (parts.length < 2) {
    return "";
  }

  const owner = normalizeText(parts[0]);
  const repo = normalizeText(parts[1]);
  if (!owner || !repo || !isRepoSegment(owner) || !isRepoSegment(repo)) {
    return "";
  }

  return `${owner}/${repo}`;
}

function repositoryParts(repository) {
  const normalized = normalizeRepository(repository);
  if (!normalized) {
    return { owner: "", repo: "" };
  }
  const [owner, repo] = normalized.split("/");
  return { owner, repo };
}

function tokenFingerprint(token) {
  const text = normalizeText(token);
  let checksum = 0;
  for (let idx = 0; idx < text.length; idx += 1) {
    checksum = (checksum + text.charCodeAt(idx) * (idx + 1)) % 1000000007;
  }
  return `${text.length}:${checksum}`;
}

function formatUpdatedLabelFromTimestamp(parsedTimestamp) {
  const parsed = Number(parsedTimestamp);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "";
  }

  const elapsedMs = Date.now() - parsed;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return new Date(parsed).toLocaleString();
  }

  const minutes = Math.floor(elapsedMs / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(parsed).toLocaleDateString();
}

function normalizeCachedPullItem(entry) {
  const id = normalizeText(entry?.id);
  if (!id) {
    return null;
  }

  const updatedAt = Number(entry?.updatedAt);
  const normalizedUpdatedAt = Number.isFinite(updatedAt) ? updatedAt : 0;

  return {
    id,
    number: Number(entry?.number) || 0,
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
    teamCount: Math.max(0, Math.floor(Number(entry?.teamCount) || 0))
  };
}

function toCachedPullItem(entry) {
  const normalized = normalizeCachedPullItem(entry);
  if (!normalized) {
    return null;
  }

  return {
    id: normalized.id,
    number: normalized.number,
    title: normalized.title,
    htmlUrl: normalized.htmlUrl,
    author: normalized.author,
    draft: normalized.draft,
    updatedAt: normalized.updatedAt,
    headRef: normalized.headRef,
    baseRef: normalized.baseRef,
    reviewRequested: normalized.reviewRequested,
    reviewerNames: normalized.reviewerNames,
    teamCount: normalized.teamCount
  };
}

function readCachedSnapshot(rawConfig, cfg) {
  if (!cfg.repository) {
    return null;
  }

  const cachedRepository = normalizeRepository(rawConfig?.cacheRepository);
  if (!cachedRepository || cachedRepository !== cfg.repository) {
    return null;
  }

  const expectedTokenHash = tokenFingerprint(cfg.accessToken);
  const cachedTokenHash = normalizeText(rawConfig?.cacheTokenFingerprint);
  if (cachedTokenHash) {
    if (cachedTokenHash !== expectedTokenHash) {
      return null;
    }
  } else if (normalizeText(cfg.accessToken)) {
    return null;
  }

  const cachedPullItems = Array.isArray(rawConfig?.cachePullItems)
    ? rawConfig.cachePullItems.map(normalizeCachedPullItem).filter(Boolean)
    : [];
  const cacheAt = Math.max(0, Number(rawConfig?.cacheAt) || 0);
  if (!cachedPullItems.length && !cacheAt) {
    return null;
  }

  return {
    pullItems: cachedPullItems
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, cfg.maxItems),
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

function buildPullsUrl(config) {
  const { owner, repo } = repositoryParts(config.repository);
  if (!owner || !repo) {
    return "";
  }

  const params = new URLSearchParams();
  params.set("state", "open");
  params.set("sort", "updated");
  params.set("direction", "desc");
  params.set("per_page", String(normalizeMaxItems(config.maxItems, 20)));
  return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${params.toString()}`;
}

function buildRepoPullsPageUrl(repository) {
  const normalized = normalizeRepository(repository);
  if (!normalized) {
    return GITHUB_WEB_BASE;
  }
  return `${GITHUB_WEB_BASE}/${normalized}/pulls`;
}

function parseGitHubError(text, status) {
  const fallback = normalizeText(text, `GitHub request failed: HTTP ${status}`);
  try {
    const parsed = JSON.parse(text);
    const message = normalizeText(parsed?.message);
    if (message) {
      return message;
    }
  } catch {
  }
  return fallback;
}

function formatUpdatedLabel(rawDate) {
  const parsed = Date.parse(rawDate);
  return formatUpdatedLabelFromTimestamp(parsed);
}

function formatSyncedLabel(timestampMs) {
  const ts = Number(timestampMs);
  if (!Number.isFinite(ts) || ts <= 0) {
    return "";
  }
  return new Date(ts).toLocaleTimeString();
}

function normalizeReviewerNames(reviewers) {
  if (!Array.isArray(reviewers)) {
    return "";
  }
  const names = reviewers
    .map((reviewer) => normalizeText(reviewer?.login))
    .filter(Boolean);
  return names.join(", ");
}

async function fetchPullRequests(config) {
  const pullsUrl = buildPullsUrl(config);
  if (!pullsUrl) {
    throw new Error("Repository is required (owner/repo).");
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const token = normalizeText(config.accessToken);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(pullsUrl, {
    headers,
    cache: "no-store"
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(parseGitHubError(bodyText, response.status));
  }

  let payload;
  try {
    payload = bodyText ? JSON.parse(bodyText) : [];
  } catch {
    throw new Error("GitHub response parse failed.");
  }

  const list = Array.isArray(payload) ? payload : [];

  const mapped = list.map((item) => {
    const reviewerNames = normalizeReviewerNames(item?.requested_reviewers);
    const teamCount = Array.isArray(item?.requested_teams) ? item.requested_teams.length : 0;
    const reviewRequested = Boolean(reviewerNames) || teamCount > 0;
    const updatedAtRaw = normalizeText(item?.updated_at);
    const updatedAt = Date.parse(updatedAtRaw);

    return {
      id: String(item?.id || item?.number || Math.random()),
      number: Number(item?.number) || 0,
      title: normalizeText(item?.title, "(No title)"),
      htmlUrl: normalizeText(item?.html_url),
      author: normalizeText(item?.user?.login, "unknown"),
      draft: item?.draft === true,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      updatedLabel: formatUpdatedLabel(updatedAtRaw),
      headRef: normalizeText(item?.head?.ref),
      baseRef: normalizeText(item?.base?.ref),
      reviewRequested,
      reviewerNames,
      teamCount
    };
  });

  mapped.sort((a, b) => b.updatedAt - a.updatedAt);
  return mapped;
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
      const currentCachePullItems = Array.isArray(currentCfg?.cachePullItems)
        ? currentCfg.cachePullItems.map(toCachedPullItem).filter(Boolean)
        : [];
      const expectedTokenHash = tokenFingerprint(cfg.accessToken);

      const unchanged =
        normalizeRepository(currentCfg?.cacheRepository) === cfg.repository &&
        normalizeText(currentCfg?.cacheTokenFingerprint) === expectedTokenHash &&
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
          formatUpdatedLabelFromTimestamp(Number(pull.updatedAt)) ||
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
