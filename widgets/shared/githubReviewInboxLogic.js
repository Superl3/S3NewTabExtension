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

export function parseTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
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

export function deriveLatestCodeUpdateAt(pullRequest, commits = []) {
  const commitTimes = Array.isArray(commits)
    ? commits
        .map((commit) => {
          const authoredAt = parseTimestamp(commit?.commit?.author?.date);
          const committedAt = parseTimestamp(commit?.commit?.committer?.date);
          return Math.max(authoredAt, committedAt);
        })
        .filter((value) => value > 0)
    : [];

  if (commitTimes.length) {
    return Math.max(...commitTimes);
  }

  return Math.max(
    parseTimestamp(pullRequest?.head?.repo?.pushed_at),
    parseTimestamp(pullRequest?.updated_at),
    parseTimestamp(pullRequest?.created_at)
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
  const otherReviewAt = reviews
    .filter((review) => !isSameGithubUser(review?.user?.login, githubLogin))
    .map((review) => parseTimestamp(review?.submitted_at || review?.created_at));

  const otherIssueCommentAt = issueComments
    .filter((comment) => !isSameGithubUser(comment?.user?.login, githubLogin))
    .map((comment) => parseTimestamp(comment?.updated_at || comment?.created_at));

  const otherReviewCommentAt = reviewComments
    .filter((comment) => !isSameGithubUser(comment?.user?.login, githubLogin))
    .map((comment) => parseTimestamp(comment?.updated_at || comment?.created_at));

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
    .map((commit) => {
      const authoredAt = parseTimestamp(commit?.commit?.author?.date);
      const committedAt = parseTimestamp(commit?.commit?.committer?.date);
      return Math.max(authoredAt, committedAt);
    });

  return maxTimestamp([
    ...otherReviewAt,
    ...otherIssueCommentAt,
    ...otherReviewCommentAt,
    ...otherCommitAt
  ]);
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
    const submittedAt = parseTimestamp(review?.submitted_at || review?.created_at);
    if (!submittedAt) {
      continue;
    }
    pushLatest(submittedAt);
    if (String(review?.state || "").toUpperCase() === "APPROVED" && submittedAt > latestApprovalAt) {
      latestApprovalAt = submittedAt;
    }
  }

  for (const comment of issueComments) {
    if (normalizeGithubLogin(comment?.user?.login) !== targetLogin) {
      continue;
    }
    pushLatest(parseTimestamp(comment?.updated_at || comment?.created_at));
  }

  for (const comment of reviewComments) {
    if (normalizeGithubLogin(comment?.user?.login) !== targetLogin) {
      continue;
    }
    pushLatest(parseTimestamp(comment?.updated_at || comment?.created_at));
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
    ...(Array.isArray(issueComments) ? issueComments : []),
    ...(Array.isArray(reviewComments) ? reviewComments : [])
  ];

  return comments.some((comment) => {
    if (isSameGithubUser(comment?.user?.login, targetLogin)) {
      return false;
    }
    const commentAt = parseTimestamp(comment?.updated_at || comment?.created_at);
    if (commentAt <= sinceTimestamp) {
      return false;
    }
    return hasGithubMention(comment?.body, targetLogin);
  });
}

export function classifyReviewNeed({
  latestCodeUpdateAt = 0,
  hasParticipation = false,
  latestParticipationAt = 0,
  latestApprovalAt = 0,
  hasApprovedUpdateSignal = false
}) {
  if (!hasParticipation) {
    return {
      reason: "NO_REVIEW_YET",
      label: REVIEW_REASON_META.NO_REVIEW_YET.label,
      included: true
    };
  }

  if (latestCodeUpdateAt > latestParticipationAt) {
    const reason = latestApprovalAt > 0 && latestApprovalAt === latestParticipationAt
      ? (hasApprovedUpdateSignal ? "APPROVED_THEN_UPDATED" : "APPROVED_UPDATED_NO_MENTION")
      : "UPDATED_AFTER_YOUR_REVIEW";
    return {
      reason,
      label: REVIEW_REASON_META[reason].label,
      included: REVIEW_REASON_META[reason].included
    };
  }

  if (latestApprovalAt > 0 && latestCodeUpdateAt <= latestApprovalAt) {
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
  const latestOtherActivityAt = deriveLatestOtherActivityAt({
    pullRequest,
    githubLogin,
    reviews,
    issueComments,
    reviewComments,
    commits
  });
  const latestCodeUpdateAt = isOwnPullRequest
    ? latestOtherActivityAt
    : Math.max(deriveLatestCodeUpdateAt(pullRequest, commits), latestOtherActivityAt);
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
    latestCodeUpdateAt,
    hasParticipation: participation.hasParticipation,
    latestParticipationAt: participation.latestParticipationAt,
    latestApprovalAt: participation.latestApprovalAt,
    hasApprovedUpdateSignal
  });

  let classification = baseClassification;

  if (isOwnPullRequest) {
    if (latestCodeUpdateAt <= 0) {
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
    latestCodeUpdateAt,
    latestParticipationAt: participation.latestParticipationAt,
    latestApprovalAt: participation.latestApprovalAt,
    hasApprovedUpdateSignal,
    hasParticipation: participation.hasParticipation,
    reason: classification.reason,
    reasonLabel: classification.label,
    included: classification.included
  };
}
