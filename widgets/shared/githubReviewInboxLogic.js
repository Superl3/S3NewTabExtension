import { arrayOrEmpty } from "../../core/utils/array.js";
import {
  normalizeGitHubCacheTimestamp,
  parseGitHubTimestamp
} from "./githubApi.js";
export { parseGitHubTimestamp as parseTimestamp } from "./githubApi.js";

const REVIEW_REASON_META = {
  NO_REVIEW_YET: {
    label: "No review yet",
    included: true
  },
  OTHER_ACTIVITY_ON_YOUR_PR: {
    label: "Activity from others",
    included: true
  },
  OWN_PR_NO_OTHER_ACTIVITY: {
    label: "No other-user activity",
    included: false
  },
  UPDATED_AFTER_YOUR_REVIEW: {
    label: "Updated after your review",
    included: true
  },
  APPROVED_NO_NEW_UPDATES: {
    label: "Approved (up to date)",
    included: false
  },
  APPROVED_THEN_UPDATED: {
    label: "Approved, then updated",
    included: true
  },
  APPROVED_UPDATED_NO_MENTION: {
    label: "Approved, no mention",
    included: false
  },
  REVIEWED_NO_NEW_UPDATES: {
    label: "Already reviewed",
    included: false
  }
};

export function normalizeGithubLogin(value) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

export function hasGithubMention(text, githubLogin) {
  const normalizedLogin = normalizeGithubLogin(githubLogin);
  if (!normalizedLogin) {
    return false;
  }
  const source = String(text || "");
  const escapedLogin = normalizedLogin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentionPattern = new RegExp(`(^|[^A-Za-z0-9-])@${escapedLogin}(?![A-Za-z0-9-])`, "i");
  return mentionPattern.test(source);
}

function maxTimestamp(values = []) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  return valid.length ? Math.max(...valid) : 0;
}

function isSameGithubUser(left, right) {
  return normalizeGithubLogin(left) && normalizeGithubLogin(left) === normalizeGithubLogin(right);
}

function collectOtherUserTimestamps(items, githubLogin, readTimestamp) {
  return items
    .filter((item) => !isSameGithubUser(item?.user?.login, githubLogin))
    .map(readTimestamp);
}

function collectUserTimestamps(items, targetLogin, readTimestamp) {
  return items
    .filter((item) => normalizeGithubLogin(item?.user?.login) === targetLogin)
    .map(readTimestamp)
    .filter(Boolean);
}

function readCommitTimestamp(commit) {
  const authoredAt = parseGitHubTimestamp(commit?.commit?.author?.date);
  const committedAt = parseGitHubTimestamp(commit?.commit?.committer?.date);
  return Math.max(authoredAt, committedAt);
}

export function deriveLatestCodeUpdateAt(pullRequest, commits = []) {
  const commitTimes = arrayOrEmpty(commits)
    .map(readCommitTimestamp)
    .filter((value) => value > 0);

  if (commitTimes.length) {
    return Math.max(...commitTimes);
  }

  return Math.max(
    parseGitHubTimestamp(pullRequest?.head?.repo?.pushed_at),
    parseGitHubTimestamp(pullRequest?.updated_at),
    parseGitHubTimestamp(pullRequest?.created_at)
  );
}

export function deriveLatestOtherActivityAt({
  pullRequest,
  githubLogin,
  reviews = [],
  issueComments = [],
  reviewComments = [],
  commits = []
}) {
  const otherReviewAt = collectOtherUserTimestamps(
    reviews,
    githubLogin,
    (review) => parseGitHubTimestamp(review?.submitted_at || review?.created_at)
  );
  const otherIssueCommentAt = collectOtherUserTimestamps(
    issueComments,
    githubLogin,
    (comment) => parseGitHubTimestamp(comment?.updated_at || comment?.created_at)
  );
  const otherReviewCommentAt = collectOtherUserTimestamps(
    reviewComments,
    githubLogin,
    (comment) => parseGitHubTimestamp(comment?.updated_at || comment?.created_at)
  );

  const otherCommitAt = commits
    .filter((commit) => {
      const authorLogin = normalizeGithubLogin(commit?.author?.login);
      const committerLogin = normalizeGithubLogin(commit?.committer?.login);
      const knownLogin = authorLogin || committerLogin;
      if (!knownLogin) {
        return false;
      }
      return knownLogin !== normalizeGithubLogin(githubLogin);
    })
    .map(readCommitTimestamp);

  return maxTimestamp([
    ...otherReviewAt,
    ...otherIssueCommentAt,
    ...otherReviewCommentAt,
    ...otherCommitAt
  ]);
}

export function deriveLatestAttentionAt({
  pullRequest,
  githubLogin,
  reviews = [],
  issueComments = [],
  reviewComments = [],
  commits = []
}) {
  const latestOtherActivityAt = deriveLatestOtherActivityAt({
    pullRequest,
    githubLogin,
    reviews,
    issueComments,
    reviewComments,
    commits
  });

  if (isSameGithubUser(pullRequest?.user?.login, githubLogin)) {
    return latestOtherActivityAt;
  }

  return Math.max(deriveLatestCodeUpdateAt(pullRequest, commits), latestOtherActivityAt);
}

export function collectLatestUserParticipation({
  githubLogin,
  reviews = [],
  issueComments = [],
  reviewComments = []
}) {
  const targetLogin = normalizeGithubLogin(githubLogin);
  if (!targetLogin) {
    return {
      hasParticipation: false,
      latestParticipationAt: 0,
      latestApprovalAt: 0
    };
  }

  let latestParticipationAt = 0;
  let latestApprovalAt = 0;

  const pushLatest = (timestamp) => {
    if (timestamp > latestParticipationAt) {
      latestParticipationAt = timestamp;
    }
  };

  for (const review of reviews) {
    if (normalizeGithubLogin(review?.user?.login) !== targetLogin) {
      continue;
    }
    const submittedAt = parseGitHubTimestamp(review?.submitted_at || review?.created_at);
    if (!submittedAt) {
      continue;
    }
    pushLatest(submittedAt);
    if (String(review?.state || "").toUpperCase() === "APPROVED" && submittedAt > latestApprovalAt) {
      latestApprovalAt = submittedAt;
    }
  }

  const commentTimestamps = [
    ...collectUserTimestamps(
      issueComments,
      targetLogin,
      (comment) => parseGitHubTimestamp(comment?.updated_at || comment?.created_at)
    ),
    ...collectUserTimestamps(
      reviewComments,
      targetLogin,
      (comment) => parseGitHubTimestamp(comment?.updated_at || comment?.created_at)
    )
  ];
  for (const timestamp of commentTimestamps) {
    pushLatest(timestamp);
  }

  return {
    hasParticipation: latestParticipationAt > 0 || latestApprovalAt > 0,
    latestParticipationAt,
    latestApprovalAt
  };
}

export function hasMentionAfterTimestamp({
  githubLogin,
  sinceTimestamp = 0,
  issueComments = [],
  reviewComments = []
}) {
  const targetLogin = normalizeGithubLogin(githubLogin);
  if (!targetLogin || sinceTimestamp <= 0) {
    return false;
  }

  const comments = [
    ...arrayOrEmpty(issueComments),
    ...arrayOrEmpty(reviewComments)
  ];

  return comments.some((comment) => {
    if (isSameGithubUser(comment?.user?.login, targetLogin)) {
      return false;
    }
    const commentAt = parseGitHubTimestamp(comment?.updated_at || comment?.created_at);
    if (commentAt <= sinceTimestamp) {
      return false;
    }
    return hasGithubMention(comment?.body, targetLogin);
  });
}

export function classifyReviewNeed({
  latestAttentionAt,
  latestCodeUpdateAt = 0,
  hasParticipation = false,
  latestParticipationAt = 0,
  latestApprovalAt = 0,
  hasApprovedUpdateSignal = false
}) {
  const attentionAt = normalizeGitHubCacheTimestamp(latestAttentionAt ?? latestCodeUpdateAt);

  if (!hasParticipation) {
    return {
      reason: "NO_REVIEW_YET",
      label: REVIEW_REASON_META.NO_REVIEW_YET.label,
      included: true
    };
  }

  if (attentionAt > latestParticipationAt) {
    const reason = latestApprovalAt > 0 && latestApprovalAt === latestParticipationAt
      ? (hasApprovedUpdateSignal ? "APPROVED_THEN_UPDATED" : "APPROVED_UPDATED_NO_MENTION")
      : "UPDATED_AFTER_YOUR_REVIEW";
    return {
      reason,
      label: REVIEW_REASON_META[reason].label,
      included: REVIEW_REASON_META[reason].included
    };
  }

  if (latestApprovalAt > 0 && attentionAt <= latestApprovalAt) {
    return {
      reason: "APPROVED_NO_NEW_UPDATES",
      label: REVIEW_REASON_META.APPROVED_NO_NEW_UPDATES.label,
      included: false
    };
  }

  return {
    reason: "REVIEWED_NO_NEW_UPDATES",
    label: REVIEW_REASON_META.REVIEWED_NO_NEW_UPDATES.label,
    included: false
  };
}

export function buildReviewCandidate({
  pullRequest,
  githubLogin,
  reviews = [],
  issueComments = [],
  reviewComments = [],
  commits = []
}) {
  const isOwnPullRequest = isSameGithubUser(pullRequest?.user?.login, githubLogin);
  const latestAttentionAt = deriveLatestAttentionAt({
    pullRequest,
    githubLogin,
    reviews,
    issueComments,
    reviewComments,
    commits
  });
  const participation = collectLatestUserParticipation({
    githubLogin,
    reviews,
    issueComments,
    reviewComments
  });
  const hasApprovedUpdateSignal = hasMentionAfterTimestamp({
    githubLogin,
    sinceTimestamp: participation.latestApprovalAt,
    issueComments,
    reviewComments
  });
  const baseClassification = classifyReviewNeed({
    latestAttentionAt,
    hasParticipation: participation.hasParticipation,
    latestParticipationAt: participation.latestParticipationAt,
    latestApprovalAt: participation.latestApprovalAt,
    hasApprovedUpdateSignal
  });

  let classification = baseClassification;

  if (isOwnPullRequest) {
    if (latestAttentionAt <= 0) {
      classification = {
        reason: "OWN_PR_NO_OTHER_ACTIVITY",
        label: REVIEW_REASON_META.OWN_PR_NO_OTHER_ACTIVITY.label,
        included: false
      };
    } else if (!participation.hasParticipation) {
      classification = {
        reason: "OTHER_ACTIVITY_ON_YOUR_PR",
        label: REVIEW_REASON_META.OTHER_ACTIVITY_ON_YOUR_PR.label,
        included: true
      };
    }
  }

  return {
    isOwnPullRequest,
    latestAttentionAt,
    latestParticipationAt: participation.latestParticipationAt,
    latestApprovalAt: participation.latestApprovalAt,
    hasApprovedUpdateSignal,
    hasParticipation: participation.hasParticipation,
    reason: classification.reason,
    reasonLabel: classification.label,
    included: classification.included
  };
}
