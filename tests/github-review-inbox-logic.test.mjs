import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReviewCandidate,
  classifyReviewNeed,
  collectLatestUserParticipation,
  deriveLatestCodeUpdateAt,
  deriveLatestOtherActivityAt,
  hasGithubMention,
  hasMentionAfterTimestamp,
  normalizeGithubLogin
} from "../widgets/shared/githubReviewInboxLogic.js";
import {
  buildCacheReviewItems,
  buildReviewInboxIgnoredToggleIconHref,
  buildReviewInboxOpenPullsLabel,
  buildReviewInboxTabLabel,
  buildReviewInboxReadItemKey,
  buildReviewInboxReadScopeKey,
  computeReviewInboxAgeSeverity,
  fetchPagedJson,
  findNextPageUrl,
  githubReviewInboxWidget,
  isReviewInboxItemRead,
  isReviewInboxSnapshotUnchanged,
  normalizeAgingDays,
  normalizeReviewInboxTab,
  normalizedConfig,
  readReviewInboxReadSnapshot,
  resolveAgingThresholds,
  setReviewInboxItemRead,
  shouldAutoIgnoreReviewInboxItem,
  shouldStartReviewInboxSwipe,
  sortReviewItemsByCreatedAt,
  splitReviewItemsByTab
} from "../widgets/githubReviewInbox.js";
import { widgetRegistry } from "../widgets/index.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return Array.from(map.keys())[index] || null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    }
  };
}

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
      latestCodeUpdateAt: Date.parse("2026-04-06T08:00:00Z"),
      hasApprovedUpdateSignal: true
    }),
    {
      reason: "APPROVED_THEN_UPDATED",
      label: "Approved, then updated",
      included: true
    }
  );
});

test("classifyReviewNeed excludes approval updates without mention signal", () => {
  assert.deepEqual(
    classifyReviewNeed({
      hasParticipation: true,
      latestParticipationAt: Date.parse("2026-04-05T09:00:00Z"),
      latestApprovalAt: Date.parse("2026-04-05T09:00:00Z"),
      latestCodeUpdateAt: Date.parse("2026-04-06T08:00:00Z"),
      hasApprovedUpdateSignal: false
    }),
    {
      reason: "APPROVED_UPDATED_NO_MENTION",
      label: "Approved, no mention",
      included: false
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

test("buildReviewCandidate includes non-owned PRs when others comment after user response", () => {
  const candidate = buildReviewCandidate({
    githubLogin: "bug95",
    pullRequest: {
      user: { login: "reviewer1" },
      updated_at: "2026-04-09T12:00:00Z"
    },
    commits: [
      {
        author: { login: "reviewer1" },
        committer: { login: "reviewer1" },
        commit: { author: { date: "2026-04-06T10:00:00Z" }, committer: { date: "2026-04-06T10:00:00Z" } }
      }
    ],
    reviews: [],
    issueComments: [
      { user: { login: "bug95" }, created_at: "2026-04-07T09:00:00Z", body: "I left feedback" },
      { user: { login: "reviewer1" }, created_at: "2026-04-08T09:00:00Z", body: "Updated based on that feedback" }
    ],
    reviewComments: []
  });

  assert.equal(candidate.included, true);
  assert.equal(candidate.reason, "UPDATED_AFTER_YOUR_REVIEW");
  assert.equal(candidate.latestCodeUpdateAt, Date.parse("2026-04-08T09:00:00Z"));
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

test("buildReviewCandidate excludes own PRs with no other-user activity and no self participation", () => {
  const candidate = buildReviewCandidate({
    githubLogin: "bug95",
    pullRequest: {
      user: { login: "bug95" },
      updated_at: "2026-04-09T12:00:00Z"
    },
    commits: [],
    reviews: [],
    issueComments: [],
    reviewComments: []
  });

  assert.equal(candidate.included, false);
  assert.equal(candidate.reason, "OWN_PR_NO_OTHER_ACTIVITY");
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
  assert.equal(candidate.reason, "OWN_PR_NO_OTHER_ACTIVITY");
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

test("github review inbox widget is registered with required settings", async () => {
  assert.equal(widgetRegistry.githubReviewInbox.type, githubReviewInboxWidget.type);
  assert.equal(await widgetRegistry.githubReviewInbox.load(), githubReviewInboxWidget);
  const keys = githubReviewInboxWidget.settingsSchema.map((field) => field.key);
  assert.deepEqual(keys.slice(0, 7), [
    "repository",
    "githubLogin",
    "accessToken",
    "maxItems",
    "refreshMinutes",
    "agingWarnDays",
    "agingDangerDays"
  ]);
  assert.equal(githubReviewInboxWidget.title, "GitHub Review Inbox");
});

test("normalizeAgingDays clamps values into supported range", () => {
  assert.equal(normalizeAgingDays("", 3), 3);
  assert.equal(normalizeAgingDays(0, 3), 3);
  assert.equal(normalizeAgingDays(120, 3), 90);
});

test("resolveAgingThresholds keeps danger above warn", () => {
  assert.deepEqual(resolveAgingThresholds({ agingWarnDays: 5, agingDangerDays: 3 }), {
    warnDays: 5,
    dangerDays: 6
  });
});

test("computeReviewInboxAgeSeverity uses configured warn and danger thresholds", () => {
  const nowMs = Date.parse("2026-04-10T12:00:00Z");
  const cfg = normalizedConfig({ agingWarnDays: 3, agingDangerDays: 5 });

  assert.equal(computeReviewInboxAgeSeverity(Date.parse("2026-04-06T11:00:00Z"), cfg, nowMs), "warn");
  assert.equal(computeReviewInboxAgeSeverity(Date.parse("2026-04-04T11:00:00Z"), cfg, nowMs), "danger");
  assert.equal(computeReviewInboxAgeSeverity(Date.parse("2026-04-08T11:00:00Z"), cfg, nowMs), "");
});

test("sortReviewItemsByCreatedAt keeps the oldest PR first", () => {
  const sorted = sortReviewItemsByCreatedAt([
    { number: 12, createdAt: Date.parse("2026-04-08T12:00:00Z") },
    { number: 10, createdAt: Date.parse("2026-04-01T12:00:00Z") },
    { number: 11, createdAt: Date.parse("2026-04-05T12:00:00Z") }
  ]);

  assert.deepEqual(sorted.map((item) => item.number), [10, 11, 12]);
});

test("shouldStartReviewInboxSwipe requires deliberate horizontal drag", () => {
  assert.equal(shouldStartReviewInboxSwipe(10, 1), false);
  assert.equal(shouldStartReviewInboxSwipe(18, 20), false);
  assert.equal(shouldStartReviewInboxSwipe(24, 6), true);
});

test("shouldAutoIgnoreReviewInboxItem hides non-requested reviews only in needs review tab", () => {
  assert.equal(shouldAutoIgnoreReviewInboxItem({ reviewRequested: false }, "needsReview"), true);
  assert.equal(shouldAutoIgnoreReviewInboxItem({ reviewRequested: true }, "needsReview"), false);
  assert.equal(shouldAutoIgnoreReviewInboxItem({ reviewRequested: false }, "opened"), false);
});

test("normalizeReviewInboxTab falls back to needsReview", () => {
  assert.equal(normalizeReviewInboxTab("opened"), "opened");
  assert.equal(normalizeReviewInboxTab("anything-else"), "needsReview");
});

test("splitReviewItemsByTab separates own PRs from review-needed PRs", () => {
  const split = splitReviewItemsByTab([
    { number: 10, author: "Bug95", title: "Own PR" },
    { number: 11, author: "reviewer1", title: "Needs review 1" },
    { number: 12, author: "reviewer2", title: "Needs review 2" }
  ], "bug95");

  assert.deepEqual(split.opened.map((item) => item.number), [10]);
  assert.deepEqual(split.needsReview.map((item) => item.number), [11, 12]);
});

test("review inbox read state is scoped by repository login and item update signature", () => {
  const storage = createMemoryStorage();
  const cfg = normalizedConfig({
    repository: "https://github.com/owner/repo",
    githubLogin: "Bug95"
  });
  const item = {
    number: 101,
    latestCodeUpdateAt: Date.parse("2026-04-09T10:00:00Z"),
    latestParticipationAt: 0,
    reason: "NO_REVIEW_YET",
    reviewRequested: true
  };

  assert.equal(buildReviewInboxReadScopeKey(cfg), "githubReviewInboxRead::owner/repo::bug95");
  assert.equal(
    buildReviewInboxReadItemKey(item),
    `101|${Date.parse("2026-04-09T10:00:00Z")}|0|NO_REVIEW_YET|requested`
  );
  assert.equal(isReviewInboxItemRead(cfg, item, storage), false);
  assert.equal(setReviewInboxItemRead(cfg, item, true, storage), true);
  assert.equal(isReviewInboxItemRead(cfg, item, storage), true);
  assert.equal(isReviewInboxItemRead({ ...cfg, githubLogin: "other" }, item, storage), false);
  assert.equal(isReviewInboxItemRead(cfg, { ...item, latestCodeUpdateAt: item.latestCodeUpdateAt + 1000 }, storage), false);
});

test("review inbox read state can be removed and prunes empty scopes", () => {
  const storage = createMemoryStorage();
  const cfg = normalizedConfig({
    repository: "owner/repo",
    githubLogin: "bug95"
  });
  const item = {
    number: 101,
    latestCodeUpdateAt: 10,
    latestParticipationAt: 0,
    reason: "NO_REVIEW_YET",
    reviewRequested: false
  };

  setReviewInboxItemRead(cfg, item, true, storage);
  assert.equal(isReviewInboxItemRead(cfg, item, storage), true);
  assert.equal(setReviewInboxItemRead(cfg, item, false, storage), true);
  assert.equal(isReviewInboxItemRead(cfg, item, storage), false);
  assert.deepEqual(readReviewInboxReadSnapshot(storage), {});
});

test("review inbox open PR button targets the repository pull request list", () => {
  assert.equal(buildReviewInboxOpenPullsLabel(), "Open repository pull requests");
});

test("review inbox tabs use compact requested and opened labels", () => {
  assert.equal(buildReviewInboxTabLabel("needsReview", 12), "requested (12)");
  assert.equal(buildReviewInboxTabLabel("opened", 3), "opened (3)");
});

test("review inbox hidden toggle switches between closed and open eye icons", () => {
  assert.equal(buildReviewInboxIgnoredToggleIconHref(false), "#i-eye-off");
  assert.equal(buildReviewInboxIgnoredToggleIconHref(true), "#i-eye");
});

test("hasGithubMention matches case-insensitive direct mentions", () => {
  assert.equal(hasGithubMention("Please take another look, @Bug95", "bug95"), true);
  assert.equal(hasGithubMention("This references bug95 without mention syntax", "bug95"), false);
});

test("hasMentionAfterTimestamp ignores self comments and old comments", () => {
  assert.equal(
    hasMentionAfterTimestamp({
      githubLogin: "bug95",
      sinceTimestamp: Date.parse("2026-04-05T09:00:00Z"),
      issueComments: [
        { user: { login: "bug95" }, created_at: "2026-04-06T09:00:00Z", body: "@bug95 self ping" },
        { user: { login: "reviewer1" }, created_at: "2026-04-04T09:00:00Z", body: "@bug95 old ping" }
      ],
      reviewComments: [
        { user: { login: "reviewer2" }, updated_at: "2026-04-06T11:00:00Z", body: "@Bug95 please re-check" }
      ]
    }),
    true
  );
});

test("buildReviewCandidate excludes approved PRs updated without mention", () => {
  const candidate = buildReviewCandidate({
    githubLogin: "bug95",
    pullRequest: { updated_at: "2026-04-08T12:00:00Z" },
    commits: [{ commit: { author: { date: "2026-04-06T10:00:00Z" }, committer: { date: "2026-04-06T10:00:00Z" } } }],
    reviews: [{ user: { login: "bug95" }, state: "APPROVED", submitted_at: "2026-04-05T09:00:00Z" }],
    issueComments: [{ user: { login: "reviewer1" }, created_at: "2026-04-06T11:00:00Z", body: "please update tests" }],
    reviewComments: []
  });

  assert.equal(candidate.included, false);
  assert.equal(candidate.reason, "APPROVED_UPDATED_NO_MENTION");
});

test("buildReviewCandidate includes approved PRs updated with mention after approval", () => {
  const candidate = buildReviewCandidate({
    githubLogin: "bug95",
    pullRequest: { updated_at: "2026-04-08T12:00:00Z" },
    commits: [{ commit: { author: { date: "2026-04-06T10:00:00Z" }, committer: { date: "2026-04-06T10:00:00Z" } } }],
    reviews: [{ user: { login: "bug95" }, state: "APPROVED", submitted_at: "2026-04-05T09:00:00Z" }],
    issueComments: [{ user: { login: "reviewer1" }, created_at: "2026-04-06T11:00:00Z", body: "@Bug95 please re-review" }],
    reviewComments: []
  });

  assert.equal(candidate.included, true);
  assert.equal(candidate.reason, "APPROVED_THEN_UPDATED");
});

test("isReviewInboxSnapshotUnchanged returns true for identical cached review inbox data", () => {
  const cfg = normalizedConfig({
    repository: "https://github.com/owner/repo",
    githubLogin: "bug95",
    accessToken: ""
  });
  const items = [
    {
      id: "1",
      number: 101,
      title: "Needs review",
      htmlUrl: "https://github.com/owner/repo/pull/101",
      author: "reviewer1",
      draft: false,
      reviewRequested: true,
      reviewerNames: "bug95",
      teamCount: 0,
      reason: "NO_REVIEW_YET",
      reasonLabel: "No review yet",
      createdAt: Date.parse("2026-04-01T10:00:00Z"),
      latestCodeUpdateAt: Date.parse("2026-04-09T10:00:00Z"),
      latestParticipationAt: 0,
      latestApprovalAt: 0,
      warning: ""
    }
  ];

  assert.equal(
    isReviewInboxSnapshotUnchanged({
      cacheRepository: "owner/repo",
      cacheGithubLogin: "Bug95",
      cacheTokenFingerprint: "0:0",
      cacheTokenUserWarning: "",
      cacheReviewItems: buildCacheReviewItems(items)
    }, cfg, items, ""),
    true
  );
});

test("isReviewInboxSnapshotUnchanged returns false when warning changes", () => {
  const cfg = normalizedConfig({
    repository: "owner/repo",
    githubLogin: "bug95",
    accessToken: ""
  });
  const items = [];

  assert.equal(
    isReviewInboxSnapshotUnchanged({
      cacheRepository: "owner/repo",
      cacheGithubLogin: "bug95",
      cacheTokenFingerprint: "0:0",
      cacheTokenUserWarning: "old warning",
      cacheReviewItems: []
    }, cfg, items, "new warning"),
    false
  );
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
