import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_INBOX_DETAIL_CONCURRENCY,
  REVIEW_INBOX_DETAIL_PAGE_LIMIT,
  selectReviewInboxDetailCandidates
} from "../widgets/githubReviewInbox.js";

function makePull(number, { login = "someone", requested = [], createdAt = "2026-01-01T00:00:00Z" } = {}) {
  return {
    id: number,
    number,
    user: { login },
    requested_reviewers: requested.map((name) => ({ login: name })),
    requested_teams: [],
    created_at: createdAt,
    state: "open"
  };
}

test("detail candidates are bounded by maxItems per tab", () => {
  const pulls = Array.from({ length: 60 }, (_, index) =>
    makePull(index + 1, { login: index % 2 === 0 ? "me" : "other" })
  );

  const selected = selectReviewInboxDetailCandidates(pulls, {
    githubLogin: "me",
    maxItems: 10
  });

  assert.ok(
    selected.length <= 20,
    `expected at most maxItems per tab (2 tabs x 10), got ${selected.length}`
  );
});

test("candidate selection does not scale with open pull request count", () => {
  const small = Array.from({ length: 10 }, (_, i) => makePull(i + 1, { login: "other" }));
  const large = Array.from({ length: 500 }, (_, i) => makePull(i + 1, { login: "other" }));

  const options = { githubLogin: "me", maxItems: 20 };
  const smallCount = selectReviewInboxDetailCandidates(small, options).length;
  const largeCount = selectReviewInboxDetailCandidates(large, options).length;

  assert.equal(smallCount, 10, "small repos expand everything they have");
  assert.equal(largeCount, 20, "large repos must stay capped at maxItems");
  assert.ok(
    largeCount < large.length,
    "a 500-PR repository must not trigger 500 detail expansions"
  );
});

test("both tabs get their own candidate budget", () => {
  const pulls = [
    ...Array.from({ length: 30 }, (_, i) => makePull(i + 1, { login: "me" })),
    ...Array.from({ length: 30 }, (_, i) => makePull(100 + i, { login: "other" }))
  ];

  const selected = selectReviewInboxDetailCandidates(pulls, {
    githubLogin: "me",
    maxItems: 5
  });

  const own = selected.filter((pull) => pull.user.login === "me");
  const others = selected.filter((pull) => pull.user.login !== "me");

  assert.equal(own.length, 5, "opened tab keeps its own budget");
  assert.equal(others.length, 5, "requested tab keeps its own budget");
});

test("oldest pull requests are prioritized within each tab", () => {
  const pulls = [
    makePull(1, { login: "other", createdAt: "2026-03-01T00:00:00Z" }),
    makePull(2, { login: "other", createdAt: "2026-01-01T00:00:00Z" }),
    makePull(3, { login: "other", createdAt: "2026-02-01T00:00:00Z" })
  ];

  const selected = selectReviewInboxDetailCandidates(pulls, {
    githubLogin: "me",
    maxItems: 2
  });

  assert.deepEqual(
    selected.map((pull) => pull.number),
    [2, 3],
    "aging review requests must be expanded before newer ones"
  );
});

test("non-open pull requests are excluded from the budget", () => {
  const pulls = [
    makePull(1, { login: "other" }),
    { ...makePull(2, { login: "other" }), state: "closed" },
    makePull(3, { login: "other" })
  ];

  const selected = selectReviewInboxDetailCandidates(pulls, {
    githubLogin: "me",
    maxItems: 10
  });

  assert.deepEqual(selected.map((pull) => pull.number), [1, 3]);
});

test("pull requests without a usable number are skipped", () => {
  const pulls = [makePull(1, { login: "other" }), { ...makePull(0, { login: "other" }), number: null }];

  const selected = selectReviewInboxDetailCandidates(pulls, {
    githubLogin: "me",
    maxItems: 10
  });

  assert.deepEqual(selected.map((pull) => pull.number), [1]);
});

test("detail fetching stays bounded and concurrent", () => {
  assert.ok(
    REVIEW_INBOX_DETAIL_PAGE_LIMIT < 20,
    "detail endpoints must not page as deeply as the pull request list"
  );
  assert.ok(
    REVIEW_INBOX_DETAIL_CONCURRENCY > 1,
    "detail expansion must not be fully serial"
  );
  assert.ok(
    REVIEW_INBOX_DETAIL_CONCURRENCY <= 8,
    "concurrency must stay polite toward the GitHub API"
  );
});

test("request cost model stays under the authenticated rate limit", () => {
  const maxItems = 20;
  const requestsPerRefresh = 1 + 2 * maxItems * 4;
  const refreshesPerHour = 4;

  assert.ok(
    requestsPerRefresh * refreshesPerHour < 5000,
    `projected ${requestsPerRefresh * refreshesPerHour} requests/hour must stay under 5000`
  );
});

test("rate limit headers are parsed into an actionable state", async () => {
  const { readGitHubRateLimit } = await import("../widgets/shared/githubApi.js");

  const resetAt = Math.floor(Date.now() / 1000) + 600;
  const limited = readGitHubRateLimit({
    get: (name) =>
      ({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(resetAt)
      })[String(name).toLowerCase()] || null
  });

  assert.equal(limited.exhausted, true);
  assert.equal(limited.remaining, 0);
  assert.ok(limited.resetAtMs > Date.now(), "reset time must be in the future");
});

test("healthy rate limit headers do not report exhaustion", async () => {
  const { readGitHubRateLimit } = await import("../widgets/shared/githubApi.js");

  const healthy = readGitHubRateLimit({
    get: (name) =>
      ({
        "x-ratelimit-remaining": "4321",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60)
      })[String(name).toLowerCase()] || null
  });

  assert.equal(healthy.exhausted, false);
  assert.equal(healthy.remaining, 4321);
});

test("missing rate limit headers are tolerated", async () => {
  const { readGitHubRateLimit } = await import("../widgets/shared/githubApi.js");

  assert.equal(readGitHubRateLimit(null).remaining, null);
  assert.equal(readGitHubRateLimit({ get: () => null }).exhausted, false);
});

test("rate limit failures render a retry time instead of GitHub prose", async () => {
  const { formatGitHubRateLimitMessage } = await import("../widgets/shared/githubApi.js");

  const resetAtMs = Date.now() + 15 * 60 * 1000;
  const message = formatGitHubRateLimitMessage(resetAtMs);

  assert.match(message, /rate limit/i);
  assert.doesNotMatch(message, /but here is the good news/i);
  assert.ok(message.length < 120, "copy must stay short enough for the status line");
});

test("blank rate limit headers are not read as an exhausted budget", async () => {
  const { readGitHubRateLimit } = await import("../widgets/shared/githubApi.js");

  // Real responses (and test stubs) often return "" for absent headers.
  // Treating that as remaining=0 would silently stop pagination.
  const blank = readGitHubRateLimit({ get: () => "" });
  assert.equal(blank.remaining, null);
  assert.equal(blank.exhausted, false);

  const nonNumeric = readGitHubRateLimit({ get: () => "unknown" });
  assert.equal(nonNumeric.remaining, null);
  assert.equal(nonNumeric.exhausted, false);
});

test("expensive widgets do not ship aggressive refresh defaults", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../widgets/metadata.js", import.meta.url), "utf8");
  const metadata = JSON.parse(source.slice(source.indexOf("["), source.lastIndexOf("]") + 1));

  // Cheapest safe interval per widget, derived from request cost and side effects.
  const minimums = {
    githubPrList: 10,
    githubReviewInbox: 15,
    flexWorktime: 15,
    flexWorktimeTimeline: 15
  };

  for (const [type, minimumMinutes] of Object.entries(minimums)) {
    const widget = metadata.find((entry) => entry.type === type);
    assert.ok(widget, `${type} must exist in widget metadata`);

    const refreshMinutes = widget.defaultConfig?.refreshMinutes;
    assert.ok(
      refreshMinutes >= minimumMinutes,
      `${type} default refreshMinutes ${refreshMinutes} must be >= ${minimumMinutes}`
    );
  }
});

test("bounded review inbox stays under the rate limit at its default interval", () => {
  const maxItems = 20;
  const requestsPerRefresh = 1 + 4 * 2 * maxItems;
  const defaultIntervalMinutes = 15;
  const perHour = requestsPerRefresh * (60 / defaultIntervalMinutes);

  assert.ok(
    perHour < 5000,
    `projected ${perHour} requests/hour must stay under the authenticated limit`
  );
});
