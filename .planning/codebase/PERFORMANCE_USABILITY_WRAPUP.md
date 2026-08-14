# Performance & Usability Wrap-Up Report

**Report Date:** 2026-08-14
**Scope:** Whole codebase — 22 widgets, `core/` (130 modules), `app.js`, `storage.js`, persistence pipeline, lazy-load registry, drag/drop hot paths, stylesheets.
**Method:** Full source sweep, behavior execution of real modules under `node`, request/latency cost modeling, and reproduction of failure-mode logic in isolation.
**Supersedes:** the GitHub-only findings in `GITHUB_PR_USABILITY_AUDIT.md`, which remain valid and are referenced rather than repeated.

---

## Executive Summary

The codebase is architecturally healthy — 130 extracted core modules, 794 passing tests, zero dependencies. The problems are concentrated in three systemic patterns rather than scattered across widgets:

1. **Identity-based re-render invalidation.** `hydrate()` allocates new instance objects and `renderBoard()` diffs by reference (`rt.instance !== instance`), so undo, redo, and cross-tab sync destroy and recreate *every* widget — including refetching every uncached network widget.
2. **Error copy is not translated at the boundary.** `Failed to fetch` and other raw upstream text reach the user in 6 widgets. Only `rss.js` and `shortcut.js` implement a translation layer; they are the correct model the rest should follow.
3. **Cost has no ceiling and no feedback.** No `AbortController` anywhere, no rate-limit header handling, no storage quota handling, and no user-visible signal when a save fails.

| Severity | Count | Definition |
|---|---|---|
| P0 | 2 | Blocks recommending the product; data loss or guaranteed failure |
| P1 | 7 | A paying user notices and complains |
| P2 | 8 | Friction or avoidable cost |
| P3 | 5 | Polish |

---

## P0 — Blockers

### P0-1. A transient module-load failure permanently bricks a widget type

**Files:** `widgets/index.js` (`createLazyController`, `createLazyWidgetDefinition`)

Three independent latches combine into an unrecoverable state:

1. `startLoad()` sets `loadStarted = true` *before* awaiting, and the `.catch()` branch that renders `Widget failed to load.` never resets it.
2. `refresh()` / `manualRefresh()` fall through to `startLoad()` when `controller` is null, but `startLoad()` opens with `if (loadStarted || destroyed) return;` — so the refresh button is a silent no-op.
3. `createLazyWidgetDefinition.load()` memoizes `loadPromise` unconditionally. A **rejected** promise is cached and returned forever.

Verified by reproducing the memoization logic in isolation: three `load()` calls invoked the underlying loader exactly **once**. Every subsequent attempt replays the cached rejection.

Consequence: one interrupted `import()` — slow disk, throttled network on first paint, momentary extension-context hiccup — leaves `Widget failed to load.` in place for the entire page session. Adding a *new* widget of the same type is also broken, because the rejection is cached at the definition level, not the instance level. The only remedy is a full page reload, which the UI never suggests.

This is doubly damaging because `Widget failed to load.` is precisely the string the buyer-gate work in `IMPROVEMENT_GOALS.md` was created to eliminate.

**Fix:** Reset `loadStarted = false` in the `.catch()`; clear `loadPromise` on rejection so the next call retries; render a `Retry` button in the failure state rather than dead text.

### P0-2. GitHub Review Inbox request volume is unbounded by any setting

Detailed in `GITHUB_PR_USABILITY_AUDIT.md` (P0-1). Summary: `maxItems` is applied at render time only, so 50 open PRs cost ~201 requests per refresh — ~12,060/hour at `refreshMinutes=1` against a 5,000/hour authenticated limit. Untokened default configuration exceeds the 60/hour anonymous limit on a 3-PR repository.

---

## P1 — Paid-user visible

### P1-1. Undo/redo and cross-tab sync destroy and recreate every widget

**Files:** `core/widget/app-runtime.js` (`renderBoard`), `core/hydrate-state.js`, `app.js` (`restoreFromSnapshot`), `core/persistence-runtime.js`, `core/history-undo-runtime.js`

`restoreFromSnapshot()` calls `state = hydrate(snapshot)`. `hydrate()` builds instances with `normalized.push({ ... })` — always fresh object identities. `renderBoard()` then decides reuse with:

```js
if (!desiredIds.has(instanceId) || !instance || rt.type !== instance.type || rt.instance !== instance) {
  removeRuntimeEntry(instanceId);   // controller.destroy() + card.remove()
}
```

`rt.instance !== instance` is therefore **always true** after any snapshot restore. Every widget is torn down and reconstructed even when nothing about it changed.

Three user-facing paths hit this:

| Trigger | Path |
|---|---|
| Ctrl+Z / Ctrl+Y | `history-undo-runtime.js` → `restoreFromSnapshot` |
| Profile / preset load | `app.js:1495` → `restoreFromSnapshot` |
| Edit in a second new tab | `persistence-runtime.js:97` → `syncFromExternalSnapshot` → `restoreFromSnapshot` |

Cost per cycle depends on caching. Widgets that rehydrate from cache (weather, both GitHub, both Monday, both Flex, codexUsage) recover cheaply. Widgets with **zero caching** refetch from the network immediately on recreate — verified by grep: `gmail`, `rss`/`geekNews`, `calendar`, and `aiChat` have no `cacheAt` or `localStorage` usage at all, and each ends `create()` with `void loadX()`.

So a board with Gmail + RSS + Calendar and five presses of Ctrl+Z issues 15 fresh network requests, plus 5 full DOM teardowns of every other widget. Scroll position, in-progress text selection, and transient widget UI state are all lost each time.

**Fix:** Diff by stable `instance.id` plus a content signature instead of object identity. `refreshExistingCard()` already exists and handles the reuse path correctly — it just is not reachable after a restore.

### P1-2. `Failed to fetch` reaches users in 6 widgets

**Files:** `widgets/gmail.js:439`, `widgets/calendar.js:693`, `widgets/weather.js:594`, `widgets/mondayAssigned.js:1744`, `widgets/mondayMeetingNote.js:1297`, `widgets/githubPrList.js:462`, `widgets/githubReviewInbox.js:1262`

`normalizeErrorMessage(error)` returns `error.message` verbatim whenever a message exists; the friendly fallback applies only to message-less errors. Verified for each widget's actual call form — all six render the literal string `Failed to fetch` when offline.

Call sites with no fallback argument (`gmail`, `calendar`, `weather`, both Monday) are worse: a message-less rejection yields the default `"Unknown error"`, which `tests/buyer-gate-source-contract.test.mjs` explicitly forbids as a source literal but cannot catch at runtime.

**The correct pattern already exists in this repo.** `widgets/rss.js:78` defines a local translator:

```js
if (lower.includes("failed to fetch") || lower.includes("network")) {
  return "Feed is not reachable. Check the feed URL or browser network access.";
}
if (lower.includes("parse")) {
  return "Feed could not be read. Check that the URL points to an RSS or Atom feed.";
}
```

Only `rss.js` and `shortcut.js` do this. Flex widgets have their own `formatFlexHomeScrapeError`/`formatFlexWorkRecordScrapeError`, which is also the right shape.

**Fix:** Promote the RSS-style translator into `core/utils/error.js` as a shared `describeNetworkError(error, context)` and adopt it at all 23 `normalizeErrorMessage(error...)` sites.

### P1-3. Save failures are invisible to the user

**Files:** `storage.js` (`saveState`), `core/persistence-runtime.js`, `app.js:1313`

`saveState` awaits `storage.set(...)` with no try/catch, so a quota rejection propagates. It is caught upstream in `executeSave`, which routes to `onPersistError` — and that handler is:

```js
onPersistError: (error) => {
  console.warn("Failed to persist dashboard state", error);
}
```

There is no quota inspection anywhere: grep for `QUOTA`, `quota`, and `bytesInUse` across `app.js`, `storage.js`, and `core/` returns nothing. There is no user-facing save-failure indicator either — grep for `Failed to save`, `not saved`, `saveError` finds only that one `console.warn`.

A user whose storage is full keeps arranging widgets, sees everything work, and loses all of it on reload. A toast mechanism (`showAddWidgetToast`) already exists and is unused for this.

**Fix:** Surface persistence failure through the existing toast, and check `bytesInUse` against quota before large writes.

### P1-4. GitHub raw error text and missing recovery affordances

Detailed in `GITHUB_PR_USABILITY_AUDIT.md` P1-1, P1-3, P1-4: raw upstream messages truncated by a `nowrap` status line, no inline Retry/Settings action in the error state, and `formatGitHubSyncedLabel` returning a date-less `toLocaleTimeString()` so a 26-hour-old cache is indistinguishable from a fresh one.

### P1-5. Flex widgets default to opening background tabs every 60 seconds

**Files:** `widgets/metadata.js` (`flexWorktime`, `flexWorktimeTimeline` defaults), `widgets/shared/flexTabs.js`

Both Flex widgets default to `refreshMinutes: 1` **and** `openFlexTabIfMissing: true`. Each refresh cycle may query tabs, create a background tab, inject a script, scrape, and close it — up to 60 times per hour, per widget. With both widgets on the board that is 120 tab lifecycles per hour for data that changes on the scale of hours.

`refreshMinutes: 1` is also the default for `githubPrList`, where 1 request/refresh × 60 = exactly the 60/hour anonymous GitHub limit with no headroom for any other GitHub widget sharing the IP quota.

**Fix:** Raise defaults to match data volatility (Flex worktime and GitHub PRs do not need minute granularity); 5-15 minutes is appropriate.

### P1-6. Accessibility is near-absent in most widgets

**Files:** all of `widgets/`

Measured `aria-*`/`role` and `keydown`/`tabIndex` occurrences per widget:

| Widget | aria/role | keyboard |
|---|---|---|
| flexWorktimeTimeline | 10 | 1 |
| todo | 7 | 4 |
| githubReviewInbox | 6 | 0 |
| weather, flexWorktime | 2 | 0-1 |
| bookmarks, search | 1 | 0-1 |
| **aiChat, calendar, clock, codexUsage, container, githubPrList, gmail, label, mondayAssigned, mondayMeetingNote, notes, rss, shortcut** | **0** | **0** |

13 of 22 widgets have zero accessibility attributes and zero keyboard handling. The shell is better (`newtab.html` has 45 aria/role attributes, `styles.css` has 27 focus rules), so the gap is specifically in widget bodies. Interactive widgets are affected worst: `container` (folder expand/collapse) and `shortcut` (tile activation) are mouse-only.

`prefers-reduced-motion` is honored in only 3 places total across all stylesheets, while the drag/swipe system is animation-heavy.

**Fix:** Establish a widget accessibility baseline — focusable rows, `role`/`aria-label` on custom controls, Enter/Space activation — and extend `prefers-reduced-motion` coverage to drag/swipe transitions.

### P1-7. Codex Usage displays whichever language it scraped

**Files:** `widgets/codexUsage.js` (`extractStatus`, `SLOT_DEFINITIONS`)

`extractStatus` returns the Korean token `남음`/`사용됨` when the scraped page was Korean and `remaining`/`used` when it was English — the widget's own text changes language based on the user's ChatGPT locale. Slot titles are hardcoded Korean (`"Codex · 5시간"`, `"Codex · 주간"`) while the rest of the widget UI, and every other widget, is English.

Related inconsistency: `app.js:2805` and `app.js:2827` emit Korean toasts (`"빈 공간이 없어 위젯을 추가하지 못했습니다..."`) inside an otherwise English UI.

**Fix:** Normalize scraped status to a canonical internal token and render it in one chosen UI language; align the two Korean toasts with surrounding copy.

---

## P2 — Friction and avoidable cost

### P2-1. Full-state serialization on every save cycle

`persistLatestSnapshot` runs `buildPersistSnapshot()` (structuredClone), `snapshotFingerprint()` (`JSON.stringify` of the whole state), then `saveState()` (which serializes again inside `chrome.storage`). Debounce is 150ms (`core/persistence-runtime.js:184`) with 30+ `queueSave()` call sites.

Aggravated by widgets persisting fetched payloads into config: `cacheReviewItems` at `maxItems=50` is roughly 20KB, `cachePullItems` roughly 13KB. Every successful GitHub refresh grows the blob that gets cloned, stringified, and written.

**Fix:** Dirty-flag or version-counter invalidation instead of whole-state fingerprinting; move fetched snapshots out of the persisted dashboard state.

### P2-2. Gmail, RSS, Calendar, and AI Chat have no caching at all

Verified: zero `cacheAt`/`localStorage` occurrences in `widgets/gmail.js`, `widgets/rss.js`, `widgets/calendar.js`, `widgets/aiChat.js`. Every widget recreation — including every undo (P1-1) — triggers a fresh network round trip, and every one shows an empty/loading state first. The comparable widgets (weather, GitHub, Monday, Flex) all cache, so the inconsistency is not a deliberate policy.

### P2-3. No request cancellation anywhere

`AbortController` and `signal:` appear **zero times** in the repository. All widgets rely on a `requestSerial` counter to *ignore* stale responses, which is correct for state safety but does not stop the request. Changing a setting mid-refresh, or destroying a widget, leaves in-flight work running to completion — worst on Review Inbox where hundreds of requests may be queued.

### P2-4. Layout reads in pointer paths are not rAF-batched

`getBoundingClientRect` appears 15 times in `core/`, including `core/drop-guide-runtime.js` (2) and `app.js` `dockSlotRectRelativeToHost` / `dockSlotIndexAtPoint`, which run per `pointermove` during dock drags. Neither `core/widget-card-drag-session.js` nor `core/drag-positioning.js` contains any `requestAnimationFrame`. Each move event can force synchronous layout.

### P2-5. Refresh interval defaults are inconsistent with data volatility

| Widget | Default | Assessment |
|---|---|---|
| githubPrList | 1 min | too aggressive (= anon rate limit exactly) |
| flexWorktime | 1 min | too aggressive (opens background tabs) |
| flexWorktimeTimeline | 1 min | too aggressive (opens background tabs) |
| githubReviewInbox | 5 min | too aggressive given per-refresh cost |
| gmail | 5 min | reasonable |
| rss / geekNews | 15 min | reasonable |
| calendar / weather | 30 min | reasonable |

The most expensive widgets have the shortest intervals — the ordering is inverted.

### P2-6. Setup-heavy widgets give no in-widget path to settings

Six widget types ship with empty required fields: `aiChat` (accessToken, endpoint), `calendar` (icsUrl), `mondayAssigned`/`mondayMeetingNote` (accessToken, boardId), `githubPrList` (repository, accessToken), `githubReviewInbox` (repository, accessToken, githubLogin). Their empty states say "Add X in settings" but render no button to open settings; the user must discover Edit mode and the widget's settings affordance independently.

### P2-7. Settings field count is high on the widgets users configure first

`clock` has 12 settings fields, `calendar` 9, `shortcut` 8, `githubReviewInbox` 8, `bookmarks` 8. Clock — the widget the buyer-gate flow uses as the canonical "add a widget" probe — is the most option-dense in the product, with no progressive disclosure between common and advanced options.

### P2-8. Read-state and ignore-state storage grows without bound

Detailed in `GITHUB_PR_USABILITY_AUDIT.md` P2-4. `widgets/shared/scopedItemStorage.js` and `widgets/shared/ignoredItems.js` contain no prune, cap, or eviction logic, and review-inbox read keys are activity-versioned so each new event on a PR creates a new permanent key.

---

## P3 — Polish

- **P3-1. `Open repository` silently navigates to `github.com`** when the repository is unset or malformed. Verified: `buildGitHubRepoPullsPageUrl("")` → `https://github.com`.
- **P3-2. Fixed 82px review-inbox rows clip wrapping badges.** `height: 82px` satisfies the AGENTS.md stable-row rule but collides with `flex-wrap: wrap` badges; reviewer lists are capped at `min(100%, 250px)` and frequently ellipsized.
- **P3-3. Two GitHub widgets use inconsistent labels and defaults** for the same concepts (`Repository` vs `Repository URL`, `Access token (optional)` vs `PAT / token`, 1 min vs 5 min).
- **P3-4. `agingDangerDays` silently overrides user input.** `resolveAgingThresholds` forces `max(warnDays + 1, requested)`; verified warn=5/danger=3 → `{5, 6}`. The settings UI keeps showing the rejected value.
- **P3-5. Auto-ignore is never explained.** `shouldAutoIgnoreReviewInboxItem` hides items silently; the count appears only inside a truncating status line, and the reveal toggle is `hidden` at zero.

---

## What is genuinely strong

Worth stating plainly, because the finding list above is long:

- **Lazy widget loading is real and well built.** Dynamic `import()` per type plus an `IntersectionObserver` with a 240px margin and an rAF/timeout race fallback. Off-screen widgets do not cost first paint.
- **Stale-write protection is correct.** Fingerprint plus user-mutation clock plus in-flight fingerprint, with `storage.onChanged` reconciliation. Multi-tab correctness is handled properly, which most extensions get wrong.
- **Bounded image work.** Wallpaper luminance samples at 24×24; blur precompute caps the long edge at 820px and emits JPEG at 0.82. Neither scales with source resolution.
- **Graceful platform degradation.** `chrome.storage.local` → `localStorage` → cloned defaults; `bookmarks.js` has a 1,200ms TTL cache with in-flight dedupe and five-event invalidation; only `codexUsage` still touches `chrome.*` directly, and all 13 sites are guarded.
- **`requestSerial` discipline is universal** across async widgets, so out-of-order responses and post-`destroy()` writes cannot corrupt state.
- **Export sanitization is real,** covering `token`/`secret`/`auth`/`session` and friends plus credential query parameters.
- **`mutationKind: "system"`** correctly keeps background cache writes out of undo history and the user-mutation clock.

---

## Recommended sequence

**Tier 1 — correctness and trust**
1. **P0-1** lazy-load retry. Small, contained fix in `widgets/index.js`; removes a permanent-brick failure mode.
2. **P1-3** surface save failures through the existing toast; add quota checking.
3. **P1-1** switch `renderBoard` to id + content-signature diffing. This is the single highest-leverage performance change — it fixes undo, preset load, and cross-tab sync at once.

**Tier 2 — perceived quality**
4. **P1-2** shared `describeNetworkError` in `core/utils/error.js`, modeled on `rss.js`; adopt at all 23 sites. Then upgrade the buyer-gate test from source-literal matching to rendered-copy assertions so this cannot regress.
5. **P0-2** cap GitHub detail expansion to `maxItems`; add rate-limit backoff.
6. **P1-5 / P2-5** correct refresh-interval defaults.

**Tier 3 — breadth**
7. **P1-6** widget accessibility baseline; extend `prefers-reduced-motion`.
8. **P2-2** add caching to Gmail/RSS/Calendar (naturally reinforced once P1-1 lands).
9. **P2-3** `AbortController` on all widget fetches.
10. **P1-7 / P2-6 / P2-7** copy language normalization, in-widget settings entry points, progressive disclosure in dense settings.

**Do not do now**
- Introducing a build toolchain or TypeScript. The zero-dependency, no-build structure is working at 73k LOC and is orthogonal to every finding above.
- Further splitting `core/`. Average file is 121 lines; the remaining problem is injection-contract shape, not file size.

---

*All request-count, latency, and storage-size figures are analytic models derived from the code paths, not live measurements. Behavioral claims (error strings, threshold clamping, promise memoization, swipe direction, timestamp formatting) were verified by executing the real modules.*
