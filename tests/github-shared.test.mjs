import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGitHubApiHeaders,
  buildGitHubRepoApiUrl,
  buildGitHubRepoPullsPageUrl,
  formatGitHubRelativeTimestamp,
  githubRepositoryParts,
  githubTokenFingerprint,
  normalizeGitHubMaxItems,
  normalizeGitHubRefreshMinutes,
  normalizeGitHubRepository,
  normalizeGitHubReviewerNames,
  parseGitHubError
} from "../widgets/shared/githubApi.js";

test("GitHub shared helpers normalize repositories and settings", () => {
  assert.equal(normalizeGitHubRepository(" https://github.com/Owner/Repo.git "), "Owner/Repo");
  assert.equal(normalizeGitHubRepository("github.com/Owner/Repo/pulls"), "Owner/Repo");
  assert.equal(normalizeGitHubRepository("owner"), "");
  assert.deepEqual(githubRepositoryParts("owner/repo"), { owner: "owner", repo: "repo" });
  assert.equal(normalizeGitHubMaxItems("999", 20), 50);
  assert.equal(normalizeGitHubRefreshMinutes("0", 5), 1);
});

test("GitHub shared helpers preserve API formatting semantics", () => {
  const headers = buildGitHubApiHeaders(" token ");
  assert.equal(headers.Accept, "application/vnd.github+json");
  assert.equal(headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.equal(headers.Authorization, "Bearer token");
  assert.equal(
    buildGitHubRepoApiUrl("owner/repo", ["pulls"], { state: "open", per_page: 100 }),
    "https://api.github.com/repos/owner/repo/pulls?state=open&per_page=100"
  );
  assert.equal(
    buildGitHubRepoApiUrl("owner/repo", ["issues", 123, "comments"], { per_page: 100 }),
    "https://api.github.com/repos/owner/repo/issues/123/comments?per_page=100"
  );
  assert.equal(buildGitHubRepoApiUrl("owner", ["pulls"]), "");
  assert.equal(buildGitHubRepoPullsPageUrl("owner/repo"), "https://github.com/owner/repo/pulls");
  assert.equal(parseGitHubError('{"message":"rate limited"}', 403), "rate limited");
  assert.equal(parseGitHubError("", 500), "GitHub request failed: HTTP 500");
  assert.equal(normalizeGitHubReviewerNames([{ login: "alice" }, { login: " bob " }, {}]), "alice, bob");
  assert.equal(githubTokenFingerprint("abc"), "3:590");
});

test("GitHub shared relative timestamp formatter matches widget labels", () => {
  const originalNow = Date.now;
  Date.now = () => Date.UTC(2026, 3, 2, 12, 0, 0);
  try {
    assert.equal(formatGitHubRelativeTimestamp(Date.UTC(2026, 3, 2, 11, 55, 0)), "5m ago");
    assert.equal(formatGitHubRelativeTimestamp(Date.UTC(2026, 3, 2, 10, 0, 0)), "2h ago");
    assert.equal(formatGitHubRelativeTimestamp(Date.UTC(2026, 2, 31, 12, 0, 0)), "2d ago");
  } finally {
    Date.now = originalNow;
  }
});
