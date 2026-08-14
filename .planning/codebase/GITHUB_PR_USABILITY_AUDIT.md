# GitHub PR Widgets — Full Usability Audit

**Audit Date:** 2026-08-14
**Scope:** `widgets/githubPrList.js` (510 lines), `widgets/githubReviewInbox.js` (1,341 lines), `widgets/shared/githubApi.js` (237 lines), `widgets/shared/githubReviewInboxLogic.js` (369 lines), related `styles.css` rules, `core/widget-card-actions.js` header actions.
**Method:** Full read of both widgets and shared helpers, behavior execution against the real modules under `node`, request-cost modeling, and cross-check against AGENTS.md contracts.

## Verdict

`githubReviewInbox` is the most feature-rich widget in the repository and the most exposed. Its review-triage logic is well factored and well tested, but the surrounding usability surface has one release blocker (unbounded API cost), several first-run and recovery gaps, and an interaction gesture that conflicts with global navigation. `githubPrList` is simpler and safer, but it has no test file and duplicates the same error-copy weakness.

| Severity | Count |
|---|---|
| P0 | 1 |
| P1 | 5 |
| P2 | 6 |
| P3 | 4 |

---

## P0 — Release blocker

### P0-1. API request cost is unbounded by any user-visible setting

**Files:** `widgets/githubReviewInbox.js` (`fetchReviewInboxItems`, `buildOpenPullsApiUrl`, `fetchPagedJson`)

The PR list is enumerated with `per_page=100` and `maxPages=20`, so up to 2,000 open PRs can be pulled. Every enumerated PR then receives 4 detail requests (`pulls/N/reviews`, `issues/N/comments`, `pulls/N/comments`, `pulls/N/commits`), each itself paged to 20 pages. `maxItems` is applied only at render time in `renderList`, so it does not reduce network work at all.

Measured cost per refresh: `1 + 4 x openPRs` requests (the `+1` is the `/user` viewer lookup when a token is set).

| Open PRs | Requests / refresh | At `refreshMinutes=5` | At `refreshMinutes=1` |
|---|---|---|---|
| 5 | 21 | 252 / hr | 1,260 / hr |
| 20 | 81 | 972 / hr | 4,860 / hr |
| 50 | 201 | 2,412 / hr | **12,060 / hr — over 5,000 limit** |
| 100 | 401 | 4,812 / hr | **24,060 / hr — over 5,000 limit** |

Without a token the anonymous limit is 60/hr, so even a **3 open PR** repository at the 5-minute default costs ~144 requests/hr and is throttled within the first hour. Since `accessToken` is labeled optional and defaults empty, the out-of-box configuration is guaranteed to hit rate limiting on any active repository.

There is also no mitigation infrastructure: `grep` confirms no `AbortController`, no `signal:`, and no reads of `x-ratelimit-remaining`, `x-ratelimit-reset`, or `retry-after` anywhere in the repository.

**Fix:** Slice candidates to `maxItems` before detail expansion; lower `maxPages` for detail endpoints (commits/comments rarely need 2,000 entries); read rate-limit headers and back off with a visible "rate limited, retrying at HH:MM" state; add `AbortController` so `destroy()` and config changes cancel in-flight work.

---

## P1 — Paid-user visible

### P1-1. Raw upstream error text reaches the user

**Files:** `widgets/shared/githubApi.js` (`parseGitHubError`), `core/utils/error.js` (`normalizeErrorMessage`), both widgets

`parseGitHubError` returns GitHub's raw `message` field, and `normalizeErrorMessage` only substitutes the friendly fallback when the error carries no message. Verified strings that render directly into widget status:

| Real failure | Status text shown |
|---|---|
| Offline / DNS failure | `Failed to fetch` |
| Wrong repo or private without token | `Not Found` |
| Expired or revoked PAT | `Bad credentials` |
| Rate limited | `API rate limit exceeded for 203.0.113.5. (But here is the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)` |
| GitHub 502 | `<html>502 Bad Gateway</html>` |

`tests/buyer-gate-source-contract.test.mjs` forbids `Failed to fetch` and `Unknown error` as *source literals*, so these runtime pass-throughs are not caught by the buyer gate. `Failed to fetch` is exactly the string the improvement goals claim was eliminated.

Aggravating factor: the status element is `white-space: nowrap` with `text-overflow: ellipsis` (`styles.css` `.github-pr-widget-status`), so the long rate-limit message is truncated to an unreadable fragment.

**Fix:** Classify by status code and known message patterns into actionable copy (401/403-with-bad-credentials → "GitHub token is invalid or expired. Update it in widget settings."; 403-rate-limit → "GitHub rate limit reached. Retrying at HH:MM."; 404 → "Repository not found, or your token lacks access."; network → "Cannot reach GitHub. Check your connection.").

### P1-2. Swipe-to-ignore collides with board page navigation

**Files:** `widgets/githubReviewInbox.js` (pointer handlers), `core/swipe-targets.js`

The ignore gesture is a **rightward** horizontal drag on a list row (`shouldStartReviewInboxSwipe` requires `dx >= 18` positive; verified `dx=-100` returns `false`, `dx=+100` returns `true`). Board page navigation also uses horizontal drags.

`canStartBoardSwipeFromTarget` blocks board swipe inside `.widget-card`, so the two do not fire simultaneously. But the consequence is that **inside this widget a horizontal drag can never page the board**, while the same gesture on empty board space does. The direction is also unconventional — "swipe right to dismiss" with a left-anchored red background reads as a left-to-right reveal, opposite to the mail-app convention most users carry over. There is no discoverability affordance: nothing in the row hints that dragging ignores it.

Additionally, `INTERACTIVE_SWIPE_SELECTOR` in `core/swipe-targets.js` lists per-widget escape hatches such as `.shortcut-tile` and `.ai-chat-widget` but has no entry for the review inbox rows, so this widget's gesture is not registered in the global interaction contract that AGENTS.md requires to be uniform.

**Fix:** Register the gesture in `core/swipe-targets.js`, add a visible ignore affordance (hover button) so the gesture is optional rather than required, and reconsider direction or make it configurable.

### P1-3. No manual retry path when the widget is in an error state

**Files:** `widgets/githubReviewInbox.js`, `widgets/githubPrList.js`, `core/widget-card-actions.js`

A refresh button exists, but `core/widget-card-actions.js` mounts it as a header/float action that is only reachable through widget selection or hover chrome. When the widget shows `Bad credentials` or a rate-limit error, the list body itself contains only static text — no inline "Retry" or "Open settings" control. The failing state gives the user no in-place action, which is the same class of complaint the improvement-goals buyer gate was created to catch.

**Fix:** Render an inline action row in the empty/error state with "Retry" and "Open settings".

### P1-4. Stale cached data is not visually distinguished from fresh data

**Files:** `widgets/githubReviewInbox.js`, `widgets/githubPrList.js`, `widgets/shared/githubApi.js` (`formatGitHubSyncedLabel`)

On failure the widget keeps the previously cached list and shows the error only in the one-line status. The rows look identical to live data. The freshness signal is `formatGitHubSyncedLabel`, which returns **`toLocaleTimeString()` with no date** — verified: a 26-hour-old cache renders as `PM 2:57:03`, indistinguishable from three minutes ago. A user can act on day-old review state believing it is current.

**Fix:** Add a stale class (dimmed rows or a "showing cached data" banner) when `errorMessage` is set with items present, and include a date when the cache is older than the current day.

### P1-5. `githubPrList` has no test coverage at all

**Files:** `widgets/githubPrList.js`

`ls tests | grep github` returns only `github-review-inbox-logic.test.mjs` (40 cases) and `github-shared.test.mjs` (5 cases). A 510-line widget with caching, config-signature invalidation, and refresh scheduling has zero dedicated tests. `tests/buyer-gate-source-contract.test.mjs` touches it only with a single copy regex.

**Fix:** Add tests for `readCachedSnapshot` invalidation (repo change, token change, token added/removed), `configSignature` transitions, and `normalizeCachedPullItem` round-tripping.

---

## P2 — Notable friction

### P2-1. `agingDangerDays` silently overrides the user's input

`resolveAgingThresholds` forces `dangerDays = Math.max(warnDays + 1, requestedDangerDays)`. Verified: setting warn=5 / danger=3 yields `{warnDays: 5, dangerDays: 6}`, and warn=10 / danger=10 yields `{warnDays: 10, dangerDays: 11}`. The settings UI keeps displaying the rejected value while behavior uses a different one. The schema `min` for `agingDangerDays` is 2, which does not express the real constraint.

**Fix:** Validate in the settings modal and show why the value was adjusted, or clamp visibly by writing the corrected value back.

### P2-2. Two GitHub widgets with overlapping purpose and inconsistent settings

`githubPrList` labels the field `Repository` with placeholder `owner/repo`; `githubReviewInbox` labels it `Repository URL` with placeholder `https://github.com/owner/repo`. Both accept both forms (`normalizeGitHubRepository` handles them identically). Token labels differ too: `Access token (optional)` versus `PAT / token`. Default `refreshMinutes` differs (1 versus 5) with no explanation, even though the review inbox is the vastly more expensive one.

**Fix:** Unify labels, placeholders, and help text; make the review inbox default interval no shorter than the PR list's.

### P2-3. No repository validation feedback at settings time

Entering `owner` alone, or a malformed URL, is accepted by the modal. `normalizeGitHubRepository('owner')` returns `""`, and the user only learns of the problem afterward from widget body text (`Repository URL is malformed.`). The modal-close contract requires the modal to close on OK, so there is no opportunity for inline validation as currently structured.

**Fix:** Validate live in the settings field (helper text under the input) rather than only post-apply.

### P2-4. Read-state keys accumulate without bound

`buildReviewInboxReadItemKey` embeds `latestAttentionAt`, `latestParticipationAt`, `reason`, and requested-state into the key. Verified: the same PR #42 produces distinct keys `42|1000|0|...` and `42|2000|0|...` as activity arrives. Neither `widgets/shared/scopedItemStorage.js` nor `widgets/shared/ignoredItems.js` contains any prune, cap, or eviction logic. Keys for closed and merged PRs are never removed.

**Fix:** Store a per-PR-number read watermark, or prune scope keys for PR numbers absent from the newest snapshot.

### P2-5. Fetched PR lists are persisted into dashboard state

Both widgets write their results into widget config (`cachePullItems`, `cacheReviewItems`) via `patchConfig(..., { mutationKind: "system" })`. This correctly avoids polluting the user-mutation clock, but it means every successful refresh grows the single state blob that `core/persistence-runtime.js` fingerprints with `JSON.stringify` on a 150ms debounce and writes to `chrome.storage.local`. With `maxItems=50` on two widgets this is a recurring multi-kilobyte serialize-and-write cycle for data that is disposable.

**Fix:** Move fetched snapshots to a dedicated cache key outside the fingerprinted dashboard state.

### P2-6. Refresh latency scales linearly with repository size

The detail loop is `for (const pull of openPulls) { ... await Promise.all(4 requests) }` — parallel within a PR, serial across PRs. Modeled at 150ms per round: 3.0s for 20 PRs, 7.5s for 50, 15.0s for 100; at 400ms RTT, 100 PRs takes 40s. Throughout, the widget shows only `Refreshing review inbox...` with no progress indication and no way to cancel.

**Fix:** Bound outer concurrency (4-6 in flight) and stop once `maxItems` inclusions are collected.

---

## P3 — Polish

### P3-1. `Open repository` silently degrades to github.com
`buildGitHubRepoPullsPageUrl("")` returns `https://github.com`. With an unconfigured or malformed repository, the open button navigates to the GitHub homepage rather than reporting that no repository is set. Verified.

### P3-2. Row height is fixed regardless of content
`.github-review-inbox-list:not(.is-empty) .github-pr-item` sets `height: 82px` (both `min-height` and `height`). This satisfies the AGENTS.md stable-row-dimension rule, but combined with wrapping badges (`.github-pr-badges { flex-wrap: wrap }`) a row carrying `New` + reason + `Review requested` + reviewer names + `Draft` will clip. Long reviewer lists are capped at `min(100%, 250px)` with ellipsis, so multi-reviewer information is frequently unreadable.

### P3-3. No keyboard access to ignore or unignore
`grep` finds no `keydown`, `tabIndex`, or `role` assignments in either widget. Ignore is pointer-gesture-only, so keyboard and assistive-technology users cannot reach it. `Unignore` is a real button, so the two directions are asymmetric in accessibility.

### P3-4. Auto-ignore is invisible until the user opts in
`shouldAutoIgnoreReviewInboxItem` silently hides `needsReview` items that are neither review-requested nor previously participated in. The count surfaces only as `N ignored PRs` in the truncating status line, and the eye toggle is `hidden` when the count is zero. A user can conclude the inbox is empty while items are filtered out by a rule that is never explained.

---

## What is done well

- `widgets/shared/githubReviewInboxLogic.js` cleanly separates review-candidate reasoning from rendering and carries 40 test cases. Verified behavior is correct: an approved PR with no subsequent activity yields `reason: APPROVED_NO_NEW_UPDATES`, `included: false`.
- `requestSerial` guards every async return path, so out-of-order responses and post-`destroy()` writes cannot corrupt render state in either widget.
- Cache invalidation is thorough: repository, GitHub login, and token fingerprint all participate, and `githubTokenFingerprint` stores only a length-and-checksum pair rather than the token.
- `tokenUserWarning` catching a token whose `/user` login differs from the configured login is a genuinely thoughtful trust affordance.
- Token values are covered by the export sanitizer (`accessToken` matches the `token` keyword in `SENSITIVE_EXPORT_KEYWORD_PARTS`), so profile export redacts them.
- `patchConfig(..., { mutationKind: "system" })` correctly keeps background cache writes out of undo history and the user-mutation clock.

---

## Recommended order

1. **P0-1** — cap detail expansion to `maxItems`, add rate-limit backoff. Without this the widget cannot be recommended for any active repository.
2. **P1-1** — status-code-driven error copy, shared by both widgets.
3. **P1-3 + P1-4** — inline retry/settings actions and an explicit stale-data state.
4. **P1-5** — `githubPrList` test file, then extend review inbox tests to gesture and read-state.
5. **P1-2** — register the swipe gesture in `core/swipe-targets.js` and add a non-gesture ignore affordance.
6. **P2 batch** — settings unification, aging validation, read-key pruning, cache relocation.

---

*Audit method: full source read plus behavior execution against the real modules. Request-cost and latency figures are analytic models derived from the code paths, not live GitHub measurements.*
