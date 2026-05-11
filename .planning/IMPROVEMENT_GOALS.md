# Improvement Goals: 30 USD Buyer Gate Before Senior Engineering Gate

This document defines the improvement loop for S3 New Tab Extension. It is intentionally sequential:

1. Step 1, the strict 30 USD buyer gate, must pass first.
2. Step 2, the strict senior developer internal quality gate, may begin only after Step 1 is marked satisfied.

## Current Gate Status

| Step | Gate | Status | Reason |
| --- | --- | --- | --- |
| 1 | Strict 30 USD buyer ego | Current iteration satisfied | No unresolved paid-user P0/P1 remains after setup/degraded-state copy fixes, browser API guards, tests, and browser smoke. Next iteration must restart here if new findings appear. |
| 2 | Strict senior developer ego | Current iteration satisfied | Added a bounded shared Chrome API seam for auth widgets, updated tests, then returned to Step 1 for regression smoke. |

## Step 1: Strict 30 USD Buyer Ego

### Persona

The buyer paid 30 USD and expects a polished, reliable, low-friction new tab product. This buyer does not care that the project is technically complex. They judge by first launch, configuration friction, trust, visual polish, data reliability, and whether failures feel understandable and recoverable.

### Current Findings

These are the first issues that a strict paid user would likely call out:

1. Fixed: first-screen `Bookmarks Collection` no longer renders `Widget failed to load.` during local/demo execution when browser bookmark APIs are unavailable.
2. Fixed: local/demo execution no longer logs hard browser API failures for:
   - `widgets/shortcut.js` favicon cache reads/writes
   - `widgets/bookmarks.js` bookmark change listeners
   - `storage.js` dashboard state persistence
3. Fixed: fallback code defaults no longer put setup-heavy `AI Chat` or placeholder `Label` widgets on first launch if `config/startup-state.json` cannot be loaded.
4. Fixed: AI Chat no-setup copy now tells the user to add a connector URL or access token in settings instead of showing a terse required-field error.
5. Verified in prior iteration: configured startup-state first launch renders immediate-value widgets and named shortcuts without `AI Chat`, placeholder `Your Label`, `Widget failed to load.`, or current-page console errors.
6. Fixed: GitHub PR, GitHub Review Inbox, Monday, AI Chat, and RSS setup/degraded states no longer use terse `Set ... first`, raw `Request failed: ${error.message}`, `Unknown error`, or `Failed to fetch` style user-facing copy.
7. Fixed: Monday auth widgets now guard browser extension API access through a shared seam so local/demo Connect flows do not expose raw `chrome is not defined` failures.
8. Watchlist: broader onboarding copy remains a P2 candidate, but no current P0/P1 blocks the loop.

### Step 1 Evidence Log

- 2026-05-11: Added browser API fallback tests for storage, bookmark root resolution, default shortcut rendering, and default bookmarks rendering without `chrome.*` APIs.
- 2026-05-11: Local browser smoke on `http://127.0.0.1:8766/newtab.html` showed no current-page error/warn logs, no `Widget failed to load.`, and a polished bookmark unavailable message.
- 2026-05-11: Local browser smoke confirmed Edit Mode opens and Add Widget modal appears without current-page error/warn logs.
- 2026-05-11: `npm test` passed with 547 tests.
- 2026-05-11: Set this improvement program as the active `/goal` in `.planning/PROJECT.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md`.
- 2026-05-11: Removed setup-heavy fallback default widgets from code defaults and improved AI Chat no-setup copy.
- 2026-05-11: Added buyer-gate contract tests for fallback default widgets and AI Chat degraded setup copy/guarded browser API usage.
- 2026-05-11: Browser smoke on `http://127.0.0.1:8767/newtab.html?startup-state=config/startup-state.json` confirmed named shortcuts, search, weather, TODO, notes, and bookmarks degraded copy with no current-page console errors and no visible `AI Chat`, `Your Label`, or `Widget failed to load.`.
- 2026-05-11: `npm test` passed with 549 tests after Step 1 and Step 2 changes.
- 2026-05-11: Step 2 internal loop extracted fallback default widget order into `core/default-widget-order.js` so app code and tests share a stable pure policy contract instead of source-string inspection.
- 2026-05-11: Re-opened the goal as an active loop instead of a one-time satisfied document state.
- 2026-05-11: Fixed account-backed/setup widget degraded copy for GitHub PRs, GitHub Review Inbox, Monday Assigned Issues, Monday Meeting Note, AI Chat, and RSS.
- 2026-05-11: Step 2 internal loop added `widgets/shared/chromeApi.js` and moved AI/Monday auth widgets to the shared Chrome API seam.
- 2026-05-11: `npm test` passed with 553 tests after Step 2 and Step 1 regression.
- 2026-05-11: Browser smoke on `http://127.0.0.1:8768/newtab.html` confirmed default startup and setup-widget degraded states have no current-page console errors, no raw chrome failure, and no old terse setup copy.

### Buyer Acceptance Criteria

Step 1 is satisfied only when all of the following are true:

1. First launch has no visible `Widget failed to load`, raw exception text, broken default widget, or unexplained empty premium surface.
2. Every default widget either works immediately or shows a polished setup state with a clear next action.
3. Add/edit/delete/resizing basics work without visual drift across Use and Edit modes.
4. Modal close behavior follows the project-wide modal close contract for click, Escape, and Enter paths.
5. Browser API unavailable states degrade cleanly in local/demo execution without console errors that correspond to user-visible failures.
6. The buyer can understand what is free/local, what requires browser permissions, and what requires account setup without reading source code.
7. A manual smoke checklist exists and has been run for:
   - first launch
   - Edit Mode toggle
   - Add Widget
   - widget settings modal apply/cancel
   - layout persistence after reload
   - default shortcuts
   - bookmarks unavailable/degraded state
   - at least one account-backed widget unavailable/degraded state
8. `npm test` passes after the fixes.

### Step 1 Loop

Repeat this loop until the buyer gate passes:

1. Explore as the paid buyer: launch the app, use common flows, and record anything that would cause refund pressure.
2. Rank findings by paid-user damage:
   - P0: data loss, broken first launch, unusable default flow
   - P1: visible broken widget, confusing setup dead end, modal/navigation breakage
   - P2: polish, copy, discoverability, non-critical friction
3. Fix only the highest user-impact issues.
4. Verify with browser smoke evidence plus focused unit tests.
5. Re-run the buyer persona. Do not enter Step 2 while any P0/P1 buyer issue remains.

## Step 2: Strict Senior Developer Ego

### Entry Rule

Step 2 is blocked until Step 1 is explicitly updated to `Satisfied` in this document with evidence. Do not start broad refactors, architecture cleanup, or internal quality-only work before that update.

### Persona

The senior developer assumes the user-facing product is now acceptable and focuses on maintainability, risk reduction, clear module boundaries, test signal quality, dependency seams, and long-term change cost.

### Internal Quality Targets

After Step 1 passes, the senior developer loop should target:

1. Browser API access must go through small platform wrappers, not scattered direct `chrome.*` calls.
2. Large widgets should be split only where the split reduces real change risk:
   - `widgets/flexWorktimeTimeline.js`
   - `widgets/mondayAssigned.js`
   - `widgets/flexWorktime.js`
   - `widgets/mondayMeetingNote.js`
   - `widgets/githubReviewInbox.js`
   - `widgets/todo.js`
3. User-facing errors should be normalized through shared helpers so widgets do not leak raw transport or parser failures.
4. Tests should distinguish expected swallowed failures from noisy console output.
5. Browser smoke tests should cover the contracts that unit tests cannot fully prove: rendered first launch, modal behavior, local/demo fallback, and persistence/reload.
6. Refactors must preserve the project invariants in `AGENTS.md`, especially modal close, widget header alignment, drag overlay layering, and interaction/navigation contracts.

### Step 2 Loop

Repeat this loop only after Step 1 passes:

1. Choose one internal quality risk with a bounded blast radius.
2. Write or identify the contract test before changing structure.
3. Refactor toward the existing architecture rather than introducing a new framework or style.
4. Run `npm test` and the relevant browser smoke check.
5. Inspect the diff as a senior reviewer:
   - fewer direct platform dependencies
   - simpler data flow
   - smaller failure surface
   - no unrelated churn
   - no regression in user-visible behavior
6. Stop the loop if the next improvement is speculative rather than risk-reducing.

## Promotion Checklist

Step 1 can be promoted to `Satisfied` only with:

- no open P0/P1 buyer findings
- evidence from browser smoke checks
- passing `npm test`
- updated manual checklist or notes

Step 2 can be unblocked only after the Step 1 promotion checklist is complete.

