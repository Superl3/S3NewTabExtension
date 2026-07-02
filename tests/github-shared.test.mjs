import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGitHubApiHeaders,
  buildGitHubRepoApiUrl,
  buildGitHubRepoPullsPageUrl,
  formatGitHubRelativeTimestamp,
  githubRepositoryParts,
  githubTokenFingerprint,
  matchesGitHubCacheTokenFingerprint,
  normalizeGitHubCachedItemBase,
  normalizeGitHubCachedItems,
  normalizeGitHubCacheCount,
  normalizeGitHubCacheNumber,
  normalizeGitHubCacheTimestamp,
  normalizeGitHubMaxItems,
  normalizeGitHubRefreshMinutes,
  normalizeGitHubRepository,
  normalizeGitHubReviewerNames,
  parseGitHubError,
  parseGitHubJsonResponse,
  parseGitHubTimestamp
} from "../widgets/shared/githubApi.js";

test("GitHub shared helpers normalize repositories and settings", () => {
  assert.equal(normalizeGitHubRepository(" https://github.com/Owner/Repo.git "), "Owner/Repo");
  assert.equal(normalizeGitHubRepository("github.com/Owner/Repo/pulls"), "Owner/Repo");
  assert.equal(normalizeGitHubRepository("owner"), "");
  assert.deepEqual(githubRepositoryParts("owner/repo"), { owner: "owner", repo: "repo" });
  assert.equal(normalizeGitHubMaxItems("999", 20), 50);
  assert.equal(normalizeGitHubRefreshMinutes("0", 5), 1);
  assert.equal(normalizeGitHubCacheNumber("12.5"), 12.5);
  assert.equal(normalizeGitHubCacheNumber("bad", 7), 7);
  assert.equal(normalizeGitHubCacheTimestamp("12.5"), 12.5);
  assert.equal(normalizeGitHubCacheTimestamp("-1"), 0);
  assert.equal(parseGitHubTimestamp("2026-04-02T12:34:00Z"), Date.parse("2026-04-02T12:34:00Z"));
  assert.equal(parseGitHubTimestamp("not a date"), 0);
  assert.equal(normalizeGitHubCacheCount("4.8"), 4);
  assert.equal(normalizeGitHubCacheCount("-1"), 0);
});

test("GitHub shared helpers normalize cached item base fields", () => {
  assert.deepEqual(
    normalizeGitHubCachedItemBase({
      id: 123,
      number: "45",
      title: "",
      htmlUrl: " https://github.com/owner/repo/pull/45 ",
      author: "",
      draft: true,
      reviewRequested: true,
      reviewerNames: " alice ",
      teamCount: "2.7"
    }),
    {
      id: "123",
      number: 45,
      title: "(No title)",
      htmlUrl: "https://github.com/owner/repo/pull/45",
      author: "unknown",
      draft: true,
      reviewRequested: true,
      reviewerNames: "alice",
      teamCount: 2
    }
  );
  assert.equal(normalizeGitHubCachedItemBase({ title: "missing id" }), null);
  assert.deepEqual(
    normalizeGitHubCachedItems(
      [{ id: "a", number: "1" }, { title: "missing id" }, { id: "b", number: "2" }],
      normalizeGitHubCachedItemBase
    ).map((item) => item.id),
    ["a", "b"]
  );
  assert.deepEqual(normalizeGitHubCachedItems([{ id: "a" }], null), []);
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
  assert.equal(normalizeGitHubReviewerNames(null), "");
  assert.equal(githubTokenFingerprint("abc"), "3:590");
  assert.equal(matchesGitHubCacheTokenFingerprint("3:590", "abc"), true);
  assert.equal(matchesGitHubCacheTokenFingerprint("3:590", "abcd"), false);
  assert.equal(matchesGitHubCacheTokenFingerprint("", ""), false);
  assert.equal(matchesGitHubCacheTokenFingerprint("", "", true), true);
  assert.equal(matchesGitHubCacheTokenFingerprint("", "abc", true), false);
});

test("GitHub shared helpers parse response JSON without widget-local parsing", () => {
  const fallback = [];
  assert.deepEqual(parseGitHubJsonResponse("[{\"id\":1}]", fallback), [{ id: 1 }]);
  assert.equal(parseGitHubJsonResponse("null", fallback), null);
  assert.equal(parseGitHubJsonResponse("", fallback), fallback);
  assert.throws(() => parseGitHubJsonResponse("not-json", fallback), /GitHub response parse failed/);
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
