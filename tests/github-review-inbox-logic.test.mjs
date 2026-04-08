import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReviewCandidate,
  classifyReviewNeed,
  collectLatestUserParticipation,
  deriveLatestCodeUpdateAt,
  deriveLatestOtherActivityAt,
  normalizeGithubLogin
} from "../widgets/shared/githubReviewInboxLogic.js";
import {
  fetchPagedJson,
  findNextPageUrl,
  githubReviewInboxWidget
} from "../widgets/githubReviewInbox.js";
import { widgetRegistry } from "../widgets/index.js";

test("normalizeGithubLogin trims @ and lowercases", () => {
  assert.equal(normalizeGithubLogin(" @Bug95 "), "bug95");
});

test("deriveLatestCodeUpdateAt prefers commit timestamps over noisy PR updated_at", () => {
  const latest = deriveLatestCodeUpdateAt(
    {
      updated_at: "2026-04-08T12:00:00Z",
      created_at: "2026-04-01T00:00:00Z"
    },
    [
      { commit: { author: { date: "2026-04-05T09:00:00Z" }, committer: { date: "2026-04-05T09:00:00Z" } } },
      { commit: { author: { date: "2026-04-06T10:00:00Z" }, committer: { date: "2026-04-06T10:00:00Z" } } }
    ]
  );

  assert.equal(latest, Date.parse("2026-04-06T10:00:00Z"));
});

test("collectLatestUserParticipation considers reviews issue comments and review comments", () => {
  const participation = collectLatestUserParticipation({
    githubLogin: "bug95",
    reviews: [{ user: { login: "bug95" }, state: "APPROVED", submitted_at: "2026-04-05T09:00:00Z" }],
    issueComments: [{ user: { login: "other" }, created_at: "2026-04-06T09:00:00Z" }],
    reviewComments: [{ user: { login: "Bug95" }, updated_at: "2026-04-07T11:00:00Z" }]
  });

  assert.equal(participation.hasParticipation, true);
  assert.equal(participation.latestApprovalAt, Date.parse("2026-04-05T09:00:00Z"));
  assert.equal(participation.latestParticipationAt, Date.parse("2026-04-07T11:00:00Z"));
});

test("classifyReviewNeed includes PRs with no prior participation", () => {
  assert.deepEqual(classifyReviewNeed({ hasParticipation: false, latestCodeUpdateAt: Date.now() }), {
    reason: "NO_REVIEW_YET",
    label: "No review yet",
    included: true
  });
});

test("classifyReviewNeed includes PRs updated after a non-approval review", () => {
  assert.deepEqual(
    classifyReviewNeed({
      hasParticipation: true,
      latestParticipationAt: Date.parse("2026-04-05T09:00:00Z"),
      latestApprovalAt: 0,
      latestCodeUpdateAt: Date.parse("2026-04-06T09:00:00Z")
    }),
    {
      reason: "UPDATED_AFTER_YOUR_REVIEW",
      label: "Updated after your review",
      included: true
    }
  );
});

test("classifyReviewNeed excludes approvals with no newer code", () => {
  assert.deepEqual(
    classifyReviewNeed({
      hasParticipation: true,
      latestParticipationAt: Date.parse("2026-04-05T09:00:00Z"),
      latestApprovalAt: Date.parse("2026-04-05T09:00:00Z"),
      latestCodeUpdateAt: Date.parse("2026-04-05T08:00:00Z")
    }),
    {
      reason: "APPROVED_NO_NEW_UPDATES",
      label: "Approved (up to date)",
      included: false
    }
  );
});

test("classifyReviewNeed re-includes approvals after new code updates", () => {
  assert.deepEqual(
    classifyReviewNeed({
      hasParticipation: true,
      latestParticipationAt: Date.parse("2026-04-05T09:00:00Z"),
      latestApprovalAt: Date.parse("2026-04-05T09:00:00Z"),
      latestCodeUpdateAt: Date.parse("2026-04-06T08:00:00Z")
    }),
    {
      reason: "APPROVED_THEN_UPDATED",
      label: "Approved, then updated",
      included: true
    }
  );
});

test("buildReviewCandidate excludes PRs when user responded after the latest code update", () => {
  const candidate = buildReviewCandidate({
    githubLogin: "bug95",
    pullRequest: { updated_at: "2026-04-08T12:00:00Z" },
    commits: [{ commit: { author: { date: "2026-04-06T10:00:00Z" }, committer: { date: "2026-04-06T10:00:00Z" } } }],
    reviews: [{ user: { login: "bug95" }, state: "APPROVED", submitted_at: "2026-04-05T09:00:00Z" }],
    issueComments: [{ user: { login: "bug95" }, created_at: "2026-04-07T09:00:00Z" }],
    reviewComments: []
  });

  assert.equal(candidate.included, false);
  assert.equal(candidate.reason, "REVIEWED_NO_NEW_UPDATES");
});

test("deriveLatestOtherActivityAt ignores self comments and self commits on own PRs", () => {
  const latest = deriveLatestOtherActivityAt({
    pullRequest: { updated_at: "2026-04-09T12:00:00Z" },
    githubLogin: "bug95",
    reviews: [{ user: { login: "bug95" }, submitted_at: "2026-04-05T09:00:00Z" }],
    issueComments: [{ user: { login: "bug95" }, created_at: "2026-04-06T09:00:00Z" }],
    reviewComments: [{ user: { login: "bug95" }, updated_at: "2026-04-07T11:00:00Z" }],
    commits: [
      {
        author: { login: "bug95" },
        committer: { login: "bug95" },
        commit: { author: { date: "2026-04-08T10:00:00Z" }, committer: { date: "2026-04-08T10:00:00Z" } }
      }
    ]
  });

  assert.equal(latest, 0);
});

test("buildReviewCandidate excludes own PRs when only self activity happened", () => {
  const candidate = buildReviewCandidate({
    githubLogin: "bug95",
    pullRequest: {
      user: { login: "bug95" },
      updated_at: "2026-04-09T12:00:00Z"
    },
    commits: [
      {
        author: { login: "bug95" },
        committer: { login: "bug95" },
        commit: { author: { date: "2026-04-08T10:00:00Z" }, committer: { date: "2026-04-08T10:00:00Z" } }
      }
    ],
    reviews: [{ user: { login: "bug95" }, state: "COMMENTED", submitted_at: "2026-04-08T11:00:00Z" }],
    issueComments: [{ user: { login: "bug95" }, created_at: "2026-04-09T09:00:00Z" }],
    reviewComments: []
  });

  assert.equal(candidate.included, false);
  assert.equal(candidate.reason, "REVIEWED_NO_NEW_UPDATES");
});

test("buildReviewCandidate includes own PRs when others act after user participation", () => {
  const candidate = buildReviewCandidate({
    githubLogin: "bug95",
    pullRequest: {
      user: { login: "bug95" },
      updated_at: "2026-04-09T12:00:00Z"
    },
    commits: [
      {
        author: { login: "reviewer1" },
        committer: { login: "reviewer1" },
        commit: { author: { date: "2026-04-09T10:00:00Z" }, committer: { date: "2026-04-09T10:00:00Z" } }
      }
    ],
    reviews: [{ user: { login: "bug95" }, state: "COMMENTED", submitted_at: "2026-04-08T11:00:00Z" }],
    issueComments: [],
    reviewComments: [{ user: { login: "reviewer2" }, updated_at: "2026-04-09T11:00:00Z" }]
  });

  assert.equal(candidate.included, true);
  assert.equal(candidate.reason, "UPDATED_AFTER_YOUR_REVIEW");
});

test("buildReviewCandidate includes own PRs with other-user activity even before any user response", () => {
  const candidate = buildReviewCandidate({
    githubLogin: "bug95",
    pullRequest: {
      user: { login: "bug95" }
    },
    commits: [],
    reviews: [{ user: { login: "reviewer1" }, state: "COMMENTED", submitted_at: "2026-04-09T08:00:00Z" }],
    issueComments: [],
    reviewComments: []
  });

  assert.equal(candidate.included, true);
  assert.equal(candidate.reason, "OTHER_ACTIVITY_ON_YOUR_PR");
});

test("github review inbox widget is registered with required settings", () => {
  assert.equal(widgetRegistry.githubReviewInbox, githubReviewInboxWidget);
  const keys = githubReviewInboxWidget.settingsSchema.map((field) => field.key);
  assert.deepEqual(keys.slice(0, 5), [
    "repository",
    "githubLogin",
    "accessToken",
    "maxItems",
    "refreshMinutes"
  ]);
  assert.equal(githubReviewInboxWidget.title, "GitHub Review Inbox");
});

test("findNextPageUrl extracts rel next URL from GitHub link header", () => {
  const linkHeader = [
    '<https://api.github.com/repositories/1/pulls/2/reviews?per_page=100&page=2>; rel="next"',
    '<https://api.github.com/repositories/1/pulls/2/reviews?per_page=100&page=4>; rel="last"'
  ].join(", ");

  assert.equal(
    findNextPageUrl(linkHeader),
    "https://api.github.com/repositories/1/pulls/2/reviews?per_page=100&page=2"
  );
});

test("fetchPagedJson follows pagination links across multiple pages", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));

    if (String(url).includes("page=2")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 101 }, { id: 102 }]),
        headers: {
          get: () => ""
        }
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }))),
      headers: {
        get: (name) => name.toLowerCase() === "link"
          ? '<https://api.github.com/repositories/1/pulls/2/reviews?per_page=100&page=2>; rel="next"'
          : ""
      }
    };
  };

  try {
    const items = await fetchPagedJson(
      "https://api.github.com/repositories/1/pulls/2/reviews?per_page=100",
      {},
      20
    );

    assert.equal(items.length, 102);
    assert.deepEqual(calls, [
      "https://api.github.com/repositories/1/pulls/2/reviews?per_page=100",
      "https://api.github.com/repositories/1/pulls/2/reviews?per_page=100&page=2"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
