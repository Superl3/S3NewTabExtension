# Improvement Goals: 30 USD Buyer Gate Before Senior Engineering Gate

This document defines the improvement loop for S3 New Tab Extension. It is intentionally sequential:

1. Step 1, the strict 30 USD buyer gate, must pass first.
2. Step 2, the strict senior developer internal quality gate, may begin only after Step 1 is marked satisfied.

## Current Gate Status

| Step | Gate | Status | Reason |
| --- | --- | --- | --- |
| 1 | Strict 30 USD buyer ego | Not satisfied | First-screen exploration found visible widget failure and browser API dependency failures in local/demo execution. |
| 2 | Strict senior developer ego | Blocked | Internal refactor/quality loop is not allowed to start until Step 1 passes. |

## Step 1: Strict 30 USD Buyer Ego

### Persona

The buyer paid 30 USD and expects a polished, reliable, low-friction new tab product. This buyer does not care that the project is technically complex. They judge by first launch, configuration friction, trust, visual polish, data reliability, and whether failures feel understandable and recoverable.

### Current Findings

These are the first issues that a strict paid user would likely call out:

1. First-screen widget failure is visible: `Bookmarks Collection` can render `Widget failed to load.` during local/demo execution when browser bookmark APIs are unavailable.
2. Local/demo execution logs hard browser API failures:
   - `widgets/shortcut.js` reads `chrome.storage.local` without a safe unavailable-API path.
   - `widgets/bookmarks.js` subscribes to `chrome.bookmarks.*` listeners without a safe unavailable-API path.
   - `storage.js` tries to persist through `chrome.storage.local` without a local/demo fallback.
3. Several premium-facing widgets depend on external accounts or page scraping. Their empty/error states must feel intentional, not like raw developer messages or setup dead ends.
4. The first-run story is not yet strong enough for a paid product: the user sees many capabilities, but not a guided confidence path proving which widgets work immediately and which require setup.
5. The repository has strong unit coverage, but the paid-user gate needs browser-level smoke evidence for launch, edit mode, add widget, modal close, persistence/reload, and degraded browser-API states.

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

