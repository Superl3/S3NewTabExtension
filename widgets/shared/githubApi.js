import { parseJsonOrFallback } from "../../core/utils/json.js";
import { normalizeIntegerInRange, toFiniteNumber, toInteger } from "../../core/utils/number.js";
import { normalizeText } from "../../core/utils/text.js";

export const GITHUB_API_BASE = "https://api.github.com";
export const GITHUB_WEB_BASE = "https://github.com";
const GITHUB_JSON_PARSE_FAILED = Symbol("github-json-parse-failed");

function isRepoSegment(value) {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

export function normalizeGitHubMaxItems(value, fallback = 20) {
  return normalizeIntegerInRange(value, fallback, 1, 50);
}

export function normalizeGitHubRefreshMinutes(value, fallback = 5) {
  return normalizeIntegerInRange(value, fallback, 1, 120);
}

export function normalizeGitHubCacheNumber(value, fallback = 0) {
  return toFiniteNumber(value, fallback);
}

export function normalizeGitHubCacheCount(value, fallback = 0) {
  return Math.max(0, toInteger(value, fallback));
}

export function normalizeGitHubRepository(value, fallback = "") {
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

export function githubRepositoryParts(repository) {
  const normalized = normalizeGitHubRepository(repository);
  if (!normalized) {
    return { owner: "", repo: "" };
  }
  const [owner, repo] = normalized.split("/");
  return { owner, repo };
}

export function githubTokenFingerprint(token) {
  const text = normalizeText(token);
  let checksum = 0;
  for (let idx = 0; idx < text.length; idx += 1) {
    checksum = (checksum + text.charCodeAt(idx) * (idx + 1)) % 1000000007;
  }
  return `${text.length}:${checksum}`;
}

export function formatGitHubRelativeTimestamp(parsedTimestamp) {
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

export function formatGitHubSyncedLabel(timestampMs) {
  const ts = Number(timestampMs);
  if (!Number.isFinite(ts) || ts <= 0) {
    return "";
  }
  return new Date(ts).toLocaleTimeString();
}

export function parseGitHubError(text, status) {
  const fallback = normalizeText(text, `GitHub request failed: HTTP ${status}`);
  const parsed = parseJsonOrFallback(text, null);
  const message = normalizeText(parsed?.message);
  if (message) {
    return message;
  }
  return fallback;
}

export function parseGitHubJsonResponse(text, fallback = null) {
  if (!normalizeText(text)) {
    return fallback;
  }

  const parsed = parseJsonOrFallback(text, GITHUB_JSON_PARSE_FAILED);
  if (parsed === GITHUB_JSON_PARSE_FAILED) {
    throw new Error("GitHub response parse failed.");
  }
  return parsed;
}

export function buildGitHubApiHeaders(accessToken) {
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

export function buildGitHubRepoApiUrl(repository, pathParts = [], query = {}) {
  const { owner, repo } = githubRepositoryParts(repository);
  if (!owner || !repo) {
    return "";
  }

  const path = [owner, repo, ...pathParts]
    .map((part) => encodeURIComponent(String(part)))
    .join("/");
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }

  const queryString = params.toString();
  return `${GITHUB_API_BASE}/repos/${path}${queryString ? `?${queryString}` : ""}`;
}

export function buildGitHubRepoPullsPageUrl(repository) {
  const normalized = normalizeGitHubRepository(repository);
  if (!normalized) {
    return GITHUB_WEB_BASE;
  }
  return `${GITHUB_WEB_BASE}/${normalized}/pulls`;
}

export function normalizeGitHubReviewerNames(reviewers) {
  if (!Array.isArray(reviewers)) {
    return "";
  }
  return reviewers
    .map((reviewer) => normalizeText(reviewer?.login))
    .filter(Boolean)
    .join(", ");
}
