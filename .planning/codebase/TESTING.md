# Testing Patterns

**Analysis Date:** 2026-08-14 (re-measured against working tree)

## Test Framework

**Runner:** Node.js built-in `node:test`.

**Run Commands:**
```bash
npm test
npm run test:production
```

**CI:** `.github/workflows/tests.yml` runs both commands on `main`, `fix`, `feat/**`, `chore/**`, and pull requests.

## Test File Organization

**Location:** `tests/*.test.mjs`

**Current scale:** 138 test files and 794 passing test cases in the latest local run (~1.4s).

**Major suites:**
- Modal close and Enter-submit contracts: `wire-events-overlays`, `wire-events-keydown`, `widget-modal-runtime`, `todo-alarm-modal-contract`.
- Drag/drop, dock, container, page navigation: `widget-card-drag-session`, `dock-widget-drag-session`, `drag-drop-*`, `container-*`, `launcher-*`.
- Startup and buyer gate: `startup-state`, `buyer-gate-source-contract`, `browser-api-fallback`.
- Integration logic contracts: `codex-usage-contract`, `github-review-inbox-logic` (40 cases), `github-shared` (5 cases), `monday-widgets-regression`, `flex-worktime-platform`, `calendar-ics-contract`, `weather-contract`.

## Known Coverage Gaps

- `app.js` has no direct test; only `tests/widget-app-runtime.test.mjs` imports it. Its 5,120 lines of orchestration are covered only by the CDP smoke and manual checklist.
- `widgets/githubPrList.js` has no dedicated test file.
- `widgets/githubReviewInbox.js` tests cover pure logic (candidate inclusion, aging, tab split, read keys) but not the swipe-to-ignore pointer gesture, read-state transition, cache rehydration, or rendered error copy.
- Rendered degraded/error copy is guarded only by source-string assertions in `tests/buyer-gate-source-contract.test.mjs`; upstream messages passed through at runtime are not asserted.
- `styles.css` (5,556 lines) has no visual regression coverage, so the AGENTS.md header/footer layout invariants are unverified by automation.

## Production Readiness Gate

`npm run test:production` runs `scripts/validate-production-readiness.mjs`.

The guard verifies:
- Manifest V3 and new-tab entry shape.
- Required permissions and explicit host permissions without `<all_urls>` or broad wildcard hosts.
- CI runs both unit/contract tests and production readiness checks.
- `.gitattributes` enforces LF text working trees and protects binary assets.
- Planning docs no longer contain known stale test/CI statements.
- `docs/production-readiness.md` contains the required manual release smoke checklist.

## Interaction Invariant Regression Gate

Every change that touches navigation, deletion, drag-drop, container/folder routing, or modal submission must run and pass focused regression coverage before merge.

**Required targeted suites:**
```bash
node --test tests/wire-events-overlays.test.mjs tests/wire-events-keydown.test.mjs tests/wire-events-widget-controls.test.mjs tests/widget-modal-runtime.test.mjs
node --test tests/widget-card-drag-session.test.mjs tests/dock-widget-drag-session.test.mjs tests/drag-drop-evaluation.test.mjs tests/drag-drop-orchestration.test.mjs
node --test tests/launcher-drop-plan.test.mjs tests/launcher-page-runtime.test.mjs tests/launcher-pages.test.mjs tests/board-wheel-navigation.test.mjs
node --test tests/container-drop-runtime.test.mjs tests/container-order-runtime.test.mjs tests/widget-drop-plan-apply.test.mjs
```

## Manual Smoke Requirements

Automated tests do not replace real extension smoke. Before a public production claim, run the checklist in `docs/production-readiness.md` from a clean Chrome and Edge profile with the repo loaded as an unpacked extension.

Minimum smoke coverage:
- First launch and configured startup dashboard.
- Edit Mode toggle, Add Widget, widget settings OK/Cancel/Enter/Escape/overlay close.
- Layout persistence after reload.
- Bookmarks degraded and real-extension permission states.
- At least one account-backed widget degraded state and one live authenticated path.

---

*Testing analysis refreshed: 2026-08-14 (re-measured file/case counts, added coverage gap section)*
