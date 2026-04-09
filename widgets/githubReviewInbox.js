import {
  buildReviewCandidate,
  normalizeGithubLogin,
  parseTimestamp
} from "./shared/githubReviewInboxLogic.js";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_WEB_BASE = "https://github.com";
const REVIEW_INBOX_TAB_NEEDS_REVIEW = "needsReview";
const REVIEW_INBOX_TAB_OPENED = "opened";

const REVIEW_INBOX_TABS = [
  { id: REVIEW_INBOX_TAB_NEEDS_REVIEW, label: "PRs I need to review" },
  { id: REVIEW_INBOX_TAB_OPENED, label: "PRs I opened" }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return normalizeText(error, "Unknown error");
  }
  if (typeof error.message === "string") {
    return normalizeText(error.message, "Unknown error");
  }
  return "Unknown error";
}

function normalizeMaxItems(value, fallback = 20) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 50);
  }
  return clamp(Math.round(num), 1, 50);
}

function normalizeRefreshMinutes(value, fallback = 5) {
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

function normalizeReviewInboxTab(value) {
  return value === REVIEW_INBOX_TAB_OPENED
    ? REVIEW_INBOX_TAB_OPENED
    : REVIEW_INBOX_TAB_NEEDS_REVIEW;
}

function splitReviewItemsByTab(items, githubLogin) {
  const needsReview = [];
  const opened = [];
  const normalizedLogin = normalizeGithubLogin(githubLogin);

  for (const item of Array.isArray(items) ? items : []) {
    if (normalizeGithubLogin(item?.author) === normalizedLogin) {
      opened.push(item);
    } else {
      needsReview.push(item);
    }
  }

  return { needsReview, opened };
}

function tokenFingerprint(token) {
  const text = normalizeText(token);
  let checksum = 0;
  for (let idx = 0; idx < text.length; idx += 1) {
    checksum = (checksum + text.charCodeAt(idx) * (idx + 1)) % 1000000007;
  }
  return `${text.length}:${checksum}`;
}

function formatRelativeTimestamp(parsedTimestamp) {
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

function formatSyncedLabel(timestampMs) {
  const ts = Number(timestampMs);
  if (!Number.isFinite(ts) || ts <= 0) {
    return "";
  }
  return new Date(ts).toLocaleTimeString();
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

function buildApiHeaders(accessToken) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const token = normalizeText(accessToken);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
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

  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    throw new Error("GitHub response parse failed.");
  }
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

    let payload;
    try {
      payload = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      throw new Error("GitHub response parse failed.");
    }

    const list = Array.isArray(payload) ? payload : [];
    items.push(...list);

    const linkHeader = response.headers?.get?.("link") || response.headers?.get?.("Link") || "";
    nextUrl = findNextPageUrl(linkHeader);
    if (!nextUrl && list.length < 100) {
      break;
    }
  }

  return items;
}

function buildRepoPullsPageUrl(repository) {
  const normalized = normalizeRepository(repository);
  if (!normalized) {
    return GITHUB_WEB_BASE;
  }
  return `${GITHUB_WEB_BASE}/${normalized}/pulls`;
}

function buildOpenPullsApiUrl(repository) {
  const { owner, repo } = repositoryParts(repository);
  if (!owner || !repo) {
    return "";
  }
  const params = new URLSearchParams({
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: "100"
  });
  return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${params.toString()}`;
}

function buildIssueCommentsApiUrl(repository, number) {
  const { owner, repo } = repositoryParts(repository);
  return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments?per_page=100`;
}

function buildReviewsApiUrl(repository, number) {
  const { owner, repo } = repositoryParts(repository);
  return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/reviews?per_page=100`;
}

function buildReviewCommentsApiUrl(repository, number) {
  const { owner, repo } = repositoryParts(repository);
  return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/comments?per_page=100`;
}

function buildCommitsApiUrl(repository, number) {
  const { owner, repo } = repositoryParts(repository);
  return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/commits?per_page=100`;
}

function normalizeCachedItem(entry) {
  const id = normalizeText(entry?.id);
  if (!id) {
    return null;
  }

  return {
    id,
    number: Number(entry?.number) || 0,
    title: normalizeText(entry?.title, "(No title)"),
    htmlUrl: normalizeText(entry?.htmlUrl),
    author: normalizeText(entry?.author, "unknown"),
    draft: entry?.draft === true,
    reviewRequested: entry?.reviewRequested === true,
    reviewerNames: normalizeText(entry?.reviewerNames),
    teamCount: Math.max(0, Math.floor(Number(entry?.teamCount) || 0)),
    reason: normalizeText(entry?.reason),
    reasonLabel: normalizeText(entry?.reasonLabel),
    latestCodeUpdateAt: Math.max(0, Number(entry?.latestCodeUpdateAt) || 0),
    latestParticipationAt: Math.max(0, Number(entry?.latestParticipationAt) || 0),
    latestApprovalAt: Math.max(0, Number(entry?.latestApprovalAt) || 0),
    warning: normalizeText(entry?.warning)
  };
}

function toCachedItem(entry) {
  const normalized = normalizeCachedItem(entry);
  if (!normalized) {
    return null;
  }
  return { ...normalized };
}

function buildCacheReviewItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(toCachedItem)
    .filter(Boolean);
}

function normalizedConfig(config) {
  const rawRepository = normalizeText(config?.repository);
  return {
    rawRepository,
    repository: normalizeRepository(rawRepository),
    githubLogin: normalizeGithubLogin(config?.githubLogin),
    accessToken: normalizeText(config?.accessToken),
    maxItems: normalizeMaxItems(config?.maxItems, 20),
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, 5),
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
  if (normalizeText(rawConfig?.cacheTokenFingerprint) !== tokenFingerprint(cfg.accessToken)) {
    return null;
  }

  const cachedItems = Array.isArray(rawConfig?.cacheReviewItems)
    ? rawConfig.cacheReviewItems.map(normalizeCachedItem).filter(Boolean)
    : [];
  const cacheAt = Math.max(0, Number(rawConfig?.cacheAt) || 0);
  const tokenUserWarning = normalizeText(rawConfig?.cacheTokenUserWarning);
  if (!cachedItems.length && !cacheAt && !tokenUserWarning) {
    return null;
  }

  return {
    reviewItems: cachedItems.slice().sort((a, b) => b.latestCodeUpdateAt - a.latestCodeUpdateAt),
    cacheAt,
    tokenUserWarning
  };
}

function isReviewInboxSnapshotUnchanged(rawConfig, cfg, items, tokenUserWarning) {
  const currentCacheItems = Array.isArray(rawConfig?.cacheReviewItems)
    ? rawConfig.cacheReviewItems.map(toCachedItem).filter(Boolean)
    : [];

  return (
    normalizeRepository(rawConfig?.cacheRepository) === cfg.repository &&
    normalizeGithubLogin(rawConfig?.cacheGithubLogin) === cfg.githubLogin &&
    normalizeText(rawConfig?.cacheTokenFingerprint) === tokenFingerprint(cfg.accessToken) &&
    normalizeText(rawConfig?.cacheTokenUserWarning) === normalizeText(tokenUserWarning) &&
    JSON.stringify(currentCacheItems) === JSON.stringify(buildCacheReviewItems(items))
  );
}

function normalizeReviewerNames(reviewers) {
  if (!Array.isArray(reviewers)) {
    return "";
  }
  return reviewers
    .map((reviewer) => normalizeText(reviewer?.login))
    .filter(Boolean)
    .join(", ");
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
    const pullNumber = Number(pull?.number) || 0;
    if (!pullNumber) {
      continue;
    }

    const [reviews, issueComments, reviewComments, commits] = await Promise.all([
      fetchPagedJson(buildReviewsApiUrl(config.repository, pullNumber), headers, 20),
      fetchPagedJson(buildIssueCommentsApiUrl(config.repository, pullNumber), headers, 20),
      fetchPagedJson(buildReviewCommentsApiUrl(config.repository, pullNumber), headers, 20),
      fetchPagedJson(buildCommitsApiUrl(config.repository, pullNumber), headers, 20)
    ]);

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

    const reviewerNames = normalizeReviewerNames(pull?.requested_reviewers);
    const teamCount = Array.isArray(pull?.requested_teams) ? pull.requested_teams.length : 0;
    reviewItems.push({
      id: String(pull?.id || pull?.number || Math.random()),
      number: pullNumber,
      title: normalizeText(pull?.title, "(No title)"),
      htmlUrl: normalizeText(pull?.html_url),
      author: normalizeText(pull?.user?.login, "unknown"),
      draft: pull?.draft === true,
      reviewRequested:
        (Array.isArray(pull?.requested_reviewers)
          ? pull.requested_reviewers.some(
              (reviewer) => normalizeGithubLogin(reviewer?.login) === config.githubLogin
            )
          : false) || teamCount > 0,
      reviewerNames,
      teamCount,
      reason: candidate.reason,
      reasonLabel: candidate.reasonLabel,
      latestCodeUpdateAt: candidate.latestCodeUpdateAt,
      latestParticipationAt: candidate.latestParticipationAt,
      latestApprovalAt: candidate.latestApprovalAt,
      warning: tokenUserWarning
    });
  }

  reviewItems.sort((a, b) => b.latestCodeUpdateAt - a.latestCodeUpdateAt);
  return {
    reviewItems,
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

    const status = document.createElement("p");
    status.className = "github-pr-widget-status github-review-inbox-status";

    shell.append(warning, tabs, list, status);
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
        status.textContent = "Set repository URL.";
        return;
      }
      if (!cfg.repository) {
        status.textContent = "Repository URL is invalid.";
        return;
      }
      if (!cfg.githubLogin) {
        status.textContent = "Set GitHub login.";
        return;
      }
      const synced = formatSyncedLabel(lastSyncedAt);
      status.textContent = `${cfg.repository} · ${splitItems.needsReview.length} review · ${splitItems.opened.length} opened${synced ? ` · Synced ${synced}` : ""}`;
    }

    function renderTabs() {
      const cfg = normalizedConfig(getConfig());
      const splitItems = splitReviewItemsByTab(reviewItems, cfg.githubLogin);
      const counts = {
        [REVIEW_INBOX_TAB_NEEDS_REVIEW]: splitItems.needsReview.length,
        [REVIEW_INBOX_TAB_OPENED]: splitItems.opened.length
      };

      for (const tab of REVIEW_INBOX_TABS) {
        const button = tabButtons.get(tab.id);
        if (!button) {
          continue;
        }
        const isActive = normalizeReviewInboxTab(selectedTab) === tab.id;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.textContent = `${tab.label} (${counts[tab.id] || 0})`;
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
      const splitItems = splitReviewItemsByTab(reviewItems, cfg.githubLogin);
      const visibleItems = (
        normalizeReviewInboxTab(selectedTab) === REVIEW_INBOX_TAB_OPENED
          ? splitItems.opened
          : splitItems.needsReview
      ).slice(0, cfg.maxItems);

      if (!visibleItems.length) {
        const empty = document.createElement("li");
        empty.className = "github-pr-empty github-review-inbox-empty";
        if (loading) {
          empty.textContent = normalizeReviewInboxTab(selectedTab) === REVIEW_INBOX_TAB_OPENED
            ? "Loading pull requests you opened..."
            : "Loading pull requests that need your review...";
        } else if (!cfg.rawRepository) {
          empty.textContent = "Set repository URL in widget settings first.";
        } else if (!cfg.repository) {
          empty.textContent = "Repository URL is malformed.";
        } else if (!cfg.githubLogin) {
          empty.textContent = "Set GitHub login in widget settings first.";
        } else if (errorMessage) {
          empty.textContent = normalizeReviewInboxTab(selectedTab) === REVIEW_INBOX_TAB_OPENED
            ? "Your pull request inbox is not available."
            : "Review inbox is not available.";
        } else {
          empty.textContent = normalizeReviewInboxTab(selectedTab) === REVIEW_INBOX_TAB_OPENED
            ? "No pull requests you opened currently need attention."
            : "No pull requests currently need your review.";
        }
        list.append(empty);
        return;
      }

      for (const item of visibleItems) {
        const row = document.createElement("li");
        row.className = `github-pr-item github-review-inbox-item${item.draft ? " is-draft" : ""}${item.reviewRequested ? " is-review-requested" : ""}`;

        const link = document.createElement("a");
        link.className = "github-pr-link github-review-inbox-link";
        link.href = item.htmlUrl || buildRepoPullsPageUrl(cfg.repository);
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
        title.textContent = item.title;

        const updated = document.createElement("span");
        updated.className = "github-pr-updated github-review-inbox-updated";
        updated.textContent = formatRelativeTimestamp(item.latestCodeUpdateAt);

        top.append(title, updated);

        const meta = document.createElement("p");
        meta.className = "github-pr-meta github-review-inbox-meta";
        const participationText = item.latestParticipationAt
          ? ` · You last responded ${formatRelativeTimestamp(item.latestParticipationAt)}`
          : "";
        meta.textContent = `#${item.number} by ${item.author}${participationText}`;

        const badges = document.createElement("div");
        badges.className = "github-pr-badges github-review-inbox-badges";
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

        link.append(top, meta, badges);
        row.append(link);
        list.append(row);
      }
    }

    function render() {
      renderWarning();
      renderTabs();
      renderStatus();
      renderList();
    }

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
        errorMessage = normalizeErrorMessage(error);
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
  fetchReviewInboxItems,
  fetchPagedJson,
  findNextPageUrl,
  isReviewInboxSnapshotUnchanged,
  normalizeRepository,
  normalizeReviewInboxTab,
  normalizedConfig,
  parseTimestamp,
  splitReviewItemsByTab
};
