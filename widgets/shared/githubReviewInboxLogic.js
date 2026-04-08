const REVIEW_REASON_META = {
  NO_REVIEW_YET: {
    label: "No review yet",
    included: true
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

export function classifyReviewNeed({
  latestCodeUpdateAt = 0,
  hasParticipation = false,
  latestParticipationAt = 0,
  latestApprovalAt = 0
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
      ? "APPROVED_THEN_UPDATED"
      : "UPDATED_AFTER_YOUR_REVIEW";
    return {
      reason,
      label: REVIEW_REASON_META[reason].label,
      included: true
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
  const latestCodeUpdateAt = deriveLatestCodeUpdateAt(pullRequest, commits);
  const participation = collectLatestUserParticipation({
    githubLogin,
    reviews,
    issueComments,
    reviewComments
  });
  const classification = classifyReviewNeed({
    latestCodeUpdateAt,
    hasParticipation: participation.hasParticipation,
    latestParticipationAt: participation.latestParticipationAt,
    latestApprovalAt: participation.latestApprovalAt
  });

  return {
    latestCodeUpdateAt,
    latestParticipationAt: participation.latestParticipationAt,
    latestApprovalAt: participation.latestApprovalAt,
    hasParticipation: participation.hasParticipation,
    reason: classification.reason,
    reasonLabel: classification.label,
    included: classification.included
  };
}
