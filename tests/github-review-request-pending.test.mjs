import assert from "node:assert/strict";
import test from "node:test";

import { buildReviewCandidate } from "../widgets/shared/githubReviewInboxLogic.js";

const DAY = 86400000;
const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);
const iso = (offsetDays) => new Date(NOW - offsetDays * DAY).toISOString();

function candidate({ pullRequest, ...rest }) {
  return buildReviewCandidate({
    githubLogin: "me",
    reviews: [],
    issueComments: [],
    reviewComments: [],
    commits: [],
    pullRequest,
    ...rest
  });
}

/**
 * GitHub removes a reviewer from `requested_reviewers` as soon as that reviewer
 * submits a review. So if the user is still listed, GitHub itself considers the
 * review outstanding -- either it was never submitted, or the author explicitly
 * re-requested it. That signal must win over any "no new updates" heuristic.
 */

test("still-requested review is kept even when the user already commented", () => {
  const result = candidate({
    pullRequest: {
      number: 1,
      user: { login: "author" },
      requested_reviewers: [{ login: "me" }],
      created_at: iso(5),
      updated_at: iso(1)
    },
    issueComments: [{ user: { login: "me" }, body: "a question", created_at: iso(3) }],
    commits: [{ commit: { author: { date: iso(4) }, committer: { date: iso(4) } } }]
  });

  assert.equal(result.included, true, "an outstanding review request must not be dropped");
  assert.equal(result.reviewRequestPending, true);
});

test("re-requested review after an approval is kept", () => {
  const result = candidate({
    pullRequest: {
      number: 2,
      user: { login: "author" },
      requested_reviewers: [{ login: "me" }],
      created_at: iso(9)
    },
    reviews: [{ user: { login: "me" }, state: "APPROVED", submitted_at: iso(2) }],
    commits: [{ commit: { author: { date: iso(8) }, committer: { date: iso(8) } } }]
  });

  assert.equal(result.included, true, "a re-request after approval must resurface");
  assert.equal(result.reviewRequestPending, true);
});

test("still-requested review survives a stale-looking review comment history", () => {
  const result = candidate({
    pullRequest: {
      number: 3,
      user: { login: "author" },
      requested_reviewers: [{ login: "me" }],
      created_at: iso(6)
    },
    reviews: [{ user: { login: "me" }, state: "COMMENTED", submitted_at: iso(1) }],
    commits: [{ commit: { author: { date: iso(5) }, committer: { date: iso(5) } } }]
  });

  assert.equal(result.included, true);
});

test("team review requests also keep the item", () => {
  const result = candidate({
    pullRequest: {
      number: 4,
      user: { login: "author" },
      requested_reviewers: [],
      requested_teams: [{ slug: "reviewers" }],
      created_at: iso(4)
    },
    reviews: [{ user: { login: "me" }, state: "APPROVED", submitted_at: iso(1) }],
    commits: [{ commit: { author: { date: iso(3) }, committer: { date: iso(3) } } }]
  });

  assert.equal(result.included, true, "an outstanding team request still needs review");
  assert.equal(result.reviewRequestPending, true);
});

test("reviewer matching ignores case and a leading @", () => {
  for (const login of ["ME", "@me", "Me"]) {
    const result = candidate({
      pullRequest: {
        number: 5,
        user: { login: "author" },
        requested_reviewers: [{ login }],
        created_at: iso(4)
      },
      reviews: [{ user: { login: "me" }, state: "APPROVED", submitted_at: iso(1) }],
      commits: [{ commit: { author: { date: iso(3) }, committer: { date: iso(3) } } }]
    });

    assert.equal(result.included, true, `reviewer login "${login}" must match`);
  }
});

test("approved and no longer requested stays excluded", () => {
  const result = candidate({
    pullRequest: {
      number: 6,
      user: { login: "author" },
      requested_reviewers: [],
      requested_teams: [],
      created_at: iso(9)
    },
    reviews: [{ user: { login: "me" }, state: "APPROVED", submitted_at: iso(1) }],
    commits: [{ commit: { author: { date: iso(8) }, committer: { date: iso(8) } } }]
  });

  assert.equal(result.included, false, "a completed review must not resurface");
  assert.equal(result.reviewRequestPending, false);
  assert.equal(result.reason, "APPROVED_NO_NEW_UPDATES");
});

test("a request for someone else does not pull the item in", () => {
  const result = candidate({
    pullRequest: {
      number: 7,
      user: { login: "author" },
      requested_reviewers: [{ login: "someone-else" }],
      created_at: iso(9)
    },
    reviews: [{ user: { login: "me" }, state: "APPROVED", submitted_at: iso(1) }],
    commits: [{ commit: { author: { date: iso(8) }, committer: { date: iso(8) } } }]
  });

  assert.equal(result.included, false);
  assert.equal(result.reviewRequestPending, false);
});

test("own pull requests are unaffected by reviewer requests", () => {
  const result = candidate({
    pullRequest: {
      number: 8,
      user: { login: "me" },
      requested_reviewers: [{ login: "me" }],
      created_at: iso(4)
    },
    commits: [{ commit: { author: { date: iso(3) }, committer: { date: iso(3) } } }]
  });

  assert.equal(result.isOwnPullRequest, true);
  assert.equal(result.included, false, "your own PR with no other activity stays quiet");
});

test("pending request reports a distinct, explanatory reason", () => {
  const result = candidate({
    pullRequest: {
      number: 9,
      user: { login: "author" },
      requested_reviewers: [{ login: "me" }],
      created_at: iso(9)
    },
    reviews: [{ user: { login: "me" }, state: "APPROVED", submitted_at: iso(1) }],
    commits: [{ commit: { author: { date: iso(8) }, committer: { date: iso(8) } } }]
  });

  assert.equal(result.reason, "REVIEW_REQUESTED_PENDING");
  assert.match(result.reasonLabel, /review requested/i);
});

test("a genuinely new update still reports the update reason, not the request reason", () => {
  const result = candidate({
    pullRequest: {
      number: 10,
      user: { login: "author" },
      requested_reviewers: [],
      created_at: iso(6)
    },
    reviews: [{ user: { login: "me" }, state: "COMMENTED", submitted_at: iso(4) }],
    commits: [{ commit: { author: { date: iso(1) }, committer: { date: iso(1) } } }]
  });

  assert.equal(result.included, true);
  assert.equal(result.reason, "UPDATED_AFTER_YOUR_REVIEW");
});

test("pending request survives a cache round trip", async () => {
  const { buildCacheReviewItems } = await import("../widgets/githubReviewInbox.js");

  const item = {
    id: "1",
    number: 7,
    title: "Fix the thing",
    author: "author",
    htmlUrl: "https://github.com/o/r/pull/7",
    reviewRequested: true,
    reason: "REVIEW_REQUESTED_PENDING",
    reasonLabel: "Review requested",
    createdAt: NOW - 3 * DAY,
    latestAttentionAt: NOW - 2 * DAY,
    latestParticipationAt: NOW - 1 * DAY,
    latestApprovalAt: 0,
    warning: ""
  };

  const [restored] = buildCacheReviewItems([item]);

  assert.equal(
    restored.reviewRequested,
    true,
    "a reload must not lose the pending review request"
  );
  assert.equal(restored.reason, "REVIEW_REQUESTED_PENDING");
});

test("a re-request resurfaces as unread after being read", async () => {
  const { buildReviewInboxReadItemKey } = await import("../widgets/githubReviewInbox.js");

  const shared = { number: 7, latestAttentionAt: 1000, latestParticipationAt: 2000 };
  const afterApproval = { ...shared, reason: "APPROVED_NO_NEW_UPDATES", reviewRequested: false };
  const afterReRequest = { ...shared, reason: "REVIEW_REQUESTED_PENDING", reviewRequested: true };

  assert.notEqual(
    buildReviewInboxReadItemKey(afterApproval),
    buildReviewInboxReadItemKey(afterReRequest),
    "a re-requested review must not stay marked as read"
  );
});

test("pending requests are never auto-ignored", async () => {
  const { shouldAutoIgnoreReviewInboxItem } = await import("../widgets/githubReviewInbox.js");

  assert.equal(
    shouldAutoIgnoreReviewInboxItem(
      { reviewRequested: true, latestParticipationAt: 0 },
      "needsReview"
    ),
    false,
    "an outstanding request must not be silently hidden"
  );
});

test("the reviewRequested badge agrees with the keep decision", () => {
  const pullRequest = {
    number: 11,
    user: { login: "author" },
    requested_reviewers: [{ login: "me" }],
    created_at: iso(9)
  };

  const result = candidate({
    pullRequest,
    reviews: [{ user: { login: "me" }, state: "APPROVED", submitted_at: iso(1) }],
    commits: [{ commit: { author: { date: iso(8) }, committer: { date: iso(8) } } }]
  });

  // The widget derives its badge from this same field, so they cannot disagree.
  assert.equal(result.reviewRequestPending, result.included);
});
