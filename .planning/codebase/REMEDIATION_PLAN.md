# Remediation Plan — All 22 Findings

**Plan Date:** 2026-08-14
**Covers:** every finding in `PERFORMANCE_USABILITY_WRAPUP.md` (2 P0, 7 P1, 8 P2, 5 P3) and `GITHUB_PR_USABILITY_AUDIT.md`.
**Method:** each fix site was opened and verified before being planned. Where investigation changed the diagnosis, that is called out explicitly.

---

## Investigation corrections

Two findings changed materially once the fix sites were opened. These corrections matter more than the plan itself.

### Correction 1 — P1-1 cannot be fixed by relaxing the diff alone

The wrapup recommended "diff by stable `instance.id` plus a content signature." **That fix in isolation would introduce silent data loss.**

`createWidgetCard` captures the `instance` object into long-lived closures, and drag sessions **mutate it directly**:

```js
// core/widget-card-drag-session.js:300
instance.layout.x = nextPlacement.x;
instance.layout.y = nextPlacement.y;
```

There are 8 capture sites in `core/widget-card-runtime.js` (lines 59, 60, 66, 141, 151, 166, 260, 286, 297, 324), including `getWidget: () => instance` which backs every widget's `getConfig()`.

Today the reference-inequality check accidentally protects against this: because every card is destroyed after a restore, no closure ever outlives its instance object. Relax the diff and cards survive while holding orphaned objects — so a post-undo drag would write coordinates into an object no longer in `state.instances`, and the move would vanish on save.

Verified the staleness directly:

```
before hydrate  stale.config.a: 1   live.config.a: 1
after  hydrate  stale.config.a: 1   live.config.a: 99
```

**Consequence for the plan:** P1-1 becomes two ordered commits. The closure fix must land and be proven first; only then is relaxing the diff safe.

### Correction 2 — P2-1 is milder than reported

The wrapup said every save cycle pays a full `JSON.stringify` fingerprint. That is wrong. `nextPersistFingerprint` short-circuits for user mutations:

```js
function nextPersistFingerprint(snapshot, userMutationAt, allowNonUserMutation) {
  if (!allowNonUserMutation && userMutationAt > 0) {
    return `u:${userMutationAt}`;     // cheap
  }
  return snapshotFingerprint(snapshot);  // JSON.stringify
}
```

So normal edits already use a cheap clock fingerprint. Full stringify happens only on system/cache writes (`allowNonUserMutation = true`) and in `syncFromExternalSnapshot`.

What *does* run unconditionally on every save is `buildPersistSnapshot()` → `buildSessionSnapshot()` → `structuredClone` of `ui` + `presets` + `instances`.

**Consequence:** P2-1 is downgraded to P3 and narrowed to "avoid `structuredClone` on every save," which is a much smaller change than "replace the fingerprinting strategy."

---

## Sequencing principle

Fixes are ordered so that each step is independently verifiable and no step depends on an unlanded one. Three findings are **prerequisites** that unlock others:

```
S1 (live instance lookup) ──> S2 (relax renderBoard diff) ──> S9 (widget caching value rises)
S3 (shared error translator) ──> S4 (GitHub error copy) + S10 (rendered-copy test gate)
S5 (lazy-load retry) ──> independent, land first (smallest + highest severity)
```

---

## Stage 1 — Unrecoverable states (P0)

### S1. Lazy-load retry — `P0-1`

**File:** `widgets/index.js`
**Risk:** low. Contained to one module; no callers change.

Three edits:

1. In `createLazyController.startLoad()`, reset the latch in the failure branch:
   ```js
   .catch((error) => {
     console.warn(...);
     loadStarted = false;            // add
     if (!destroyed) renderLazyWidgetFailure(container, () => startLoad());
   });
   ```
2. In `createLazyWidgetDefinition.load()`, clear the memo on rejection so the next call retries:
   ```js
   loadPromise = loader().then(...).catch((error) => {
     loadPromise = null;             // add
     throw error;
   });
   ```
3. Replace the dead `Widget failed to load.` text with a `Retry` button. Add `renderLazyWidgetFailure(container, onRetry)` beside the existing `renderLazyWidgetStatus`.

**Tests:** new `tests/widget-lazy-load.test.mjs` — loader rejects then succeeds on retry; assert loader invoked twice (today: once). Assert `refresh()` after failure re-invokes the loader. Assert a second widget instance of the same type can load after a first failure.

### S2. GitHub request budget — `P0-2`

**File:** `widgets/githubReviewInbox.js` (`fetchReviewInboxItems`)
**Risk:** medium. Changes which items appear; needs care to not drop legitimate items.

The key enabler, confirmed by reading `buildReviewCandidate`: the **list payload alone** already tells us `user.login`, `requested_reviewers`, `requested_teams`, `created_at`, and `draft`. Detail calls are only needed to compute *attention* and *participation* timestamps.

Restructure to a two-phase fetch:

1. **Phase 1 (free):** partition `openPulls` into own-PRs (opened tab) and others (requested tab) using list fields only. Sort by `created_at` as today.
2. **Phase 2 (bounded):** expand details only for the first `maxItems` candidates *per tab*, with bounded concurrency:
   ```js
   const CONCURRENCY = 5;
   const DETAIL_PAGE_LIMIT = 3;   // was 20
   ```
3. Add rate-limit awareness in `widgets/shared/githubApi.js`: read `x-ratelimit-remaining` and `x-ratelimit-reset`; when remaining is low, stop expanding and surface `Rate limited — retrying at HH:MM` while keeping the cached list.

Expected cost change on a 50-PR repo at `maxItems=20`: 201 → 41 requests per refresh (≈80% reduction), and refresh latency 7.5s → ~1.5s from concurrency.

**Caveat to accept explicitly:** items beyond `maxItems` no longer get participation timestamps, so the auto-ignore rule cannot evaluate them. That is correct — they were never displayed anyway — but the ignored-count in the status line becomes "of the examined set" and the copy must say so.

**Tests:** extend `tests/github-review-inbox-logic.test.mjs` — assert detail fetch count is bounded by `maxItems`, not by open-PR count; assert concurrency cap; assert low-remaining response stops expansion and preserves the cache.

---

## Stage 2 — Silent data loss (P1)

### S3. Live instance lookup — `P1-1`, part 1 of 2

**File:** `core/widget-card-runtime.js`
**Risk:** medium. Touches every widget's `getConfig()`. Behavior-neutral by design, which makes it testable in isolation.

Replace the captured object with a live resolver at the top of `createWidgetCard`:

```js
const widgetId = instance.id;
const liveInstance = () => deps.instanceById(widgetId) || instance;
```

`deps.instanceById` is already wired in (`core/widget/app-runtime.js:67,128`) — no new dependency needed.

Then convert the 8 capture sites. The critical one:

```js
getWidget: () => liveInstance(),   // was: () => instance
```

For `attachWidgetTypeActions`, `attachWidgetCardClickBehavior`, `startWidgetCardDragSession`, `startWidgetPaddingDragSession`, `attachWidgetResizeHandle`: these receive `instance` as a value. Either pass `liveInstance()` at call time (they are invoked per interaction, so this resolves fresh) or change their signatures to accept a getter. **Prefer call-time resolution** — it is a smaller diff and those helpers are already invoked lazily inside event handlers.

`runtimeMap.set(instance.id, { ..., instance })` stays as-is; `refreshExistingCard` already reassigns `rt.instance = instance`.

**Tests:** new `tests/widget-card-live-instance.test.mjs` — replace `state.instances` with new objects (simulating hydrate), then assert `getConfig()` returns the new config and a simulated drag mutates the object currently in `state.instances`.

**This stage must land and pass before S4.**

### S4. Relax the renderBoard diff — `P1-1`, part 2 of 2

**File:** `core/widget/app-runtime.js` (`renderBoard`)
**Risk:** medium, but de-risked by S3.

Replace identity comparison with a content signature:

```js
function widgetCardSignature(instance) {
  return [
    instance.type,
    instance.viewMode,
    instance.surfaceMode,
    instance.containerId ?? "",
    instance.page ?? 0
  ].join("|");
}
```

Signature includes only fields that require a **card rebuild**. Layout, title, and visual properties are excluded because `refreshExistingCard` already handles them via `applyLayout` / `applyCardVisual` / `applyCardStack`.

```js
if (!desiredIds.has(instanceId) || !instance ||
    rt.signature !== widgetCardSignature(instance)) {
  removeRuntimeEntry(instanceId);
}
```

Store `rt.signature` at create time and refresh it in `refreshExistingCard`.

**Tests:** extend `tests/widget-app-runtime.test.mjs` — assert `controller.destroy` is NOT called when a snapshot restore changes only layout; assert it IS called when `type` or `viewMode` changes; assert undo of a widget move preserves controller identity.

**Expected payoff:** undo/redo, preset load, and cross-tab sync stop rebuilding the board. This also removes the redundant refetch that made S9 urgent.

### S5. Surface persistence failures — `P1-3`

**Files:** `storage.js`, `app.js` (`onPersistError`)
**Risk:** low.

1. Wrap `saveState`'s `storage.set` in try/catch and rethrow a typed error so the caller can distinguish quota from transient failure.
2. Replace the `console.warn`-only handler:
   ```js
   onPersistError: (error) => {
     console.warn("Failed to persist dashboard state", error);
     showAddWidgetToast("Could not save your dashboard. Changes may be lost on reload.");
   }
   ```
   `showAddWidgetToast` is a hoisted function declaration at `app.js:2618`, so it is callable from line 1313. The element is `#addWidgetToast` with `class="app-toast"`, `role="status"`, `aria-live="polite"` — already generic and accessible.
3. Add a pre-write quota check in `storage.js` using `chrome.storage.local.getBytesInUse` where available, warning at >80% of `QUOTA_BYTES`.

**Naming cleanup:** `showAddWidgetToast` is now a general app toast. Rename to `showAppToast` (the element and CSS class already use the generic name) and keep a thin alias if call-site churn is a concern.

**Tests:** new `tests/persistence-error-surface.test.mjs` — assert the toast callback fires on a rejecting `saveState`; assert quota-threshold warning triggers.

---

## Stage 3 — Perceived quality (P1)

### S6. Shared network-error translator — `P1-2`

**File:** `core/utils/error.js` (extend), then 6 widget call sites
**Risk:** low. Additive; existing `normalizeErrorMessage` keeps its signature.

The correct implementation already exists in `widgets/rss.js:78`. Promote it:

```js
export function describeRequestError(error, { subject, hint } = {}) {
  const raw = normalizeErrorMessage(error, "");
  const lower = raw.toLowerCase();

  if (!raw) return `${subject} is not available. ${hint}`;
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return `Cannot reach ${subject}. Check your network connection.`;
  }
  if (lower.includes("bad credentials") || lower.includes("401")) {
    return `${subject} rejected your credentials. Update the token in widget settings.`;
  }
  if (lower.includes("rate limit")) {
    return `${subject} rate limit reached. It will retry automatically.`;
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return `${subject} was not found. Check the settings, or your access to it.`;
  }
  if (lower.startsWith("<") || lower.includes("<html")) {
    return `${subject} returned an unexpected response. Try again shortly.`;
  }
  if (lower.includes("parse")) {
    return `${subject} could not be read. ${hint}`;
  }
  return raw;   // already-actionable messages pass through
}
```

Adopt at the 6 leaking sites: `gmail.js:439`, `calendar.js:693`, `weather.js:594`, `mondayAssigned.js:1744`, `mondayMeetingNote.js:1297`, `githubPrList.js:462`, `githubReviewInbox.js:1262`.

Leave `rss.js` and `shortcut.js` alone initially — they already behave correctly. Migrate them in a follow-up only if the shared helper proves equivalent, to avoid regressing working copy.

**Also fixes** the `P1-4` GitHub error-copy half.

### S7. GitHub recovery affordances and freshness — `P1-4` remainder

**Files:** `widgets/githubPrList.js`, `widgets/githubReviewInbox.js`, `widgets/shared/githubApi.js`

1. Add an inline action row in the empty/error state with `Retry` and `Open settings`. `openSettings` is already in the widget context for all widgets (`core/widget-controller-context.js:96`).
2. Fix the freshness label. `formatGitHubSyncedLabel` returns a date-less `toLocaleTimeString()`, so a 26-hour-old cache renders as `PM 2:57:03`. Include the date when the cache is not from today. Note the same file already has a correct `formatGitHubRelativeTimestamp` returning `1d ago` — the bug is that the wrong function is used for freshness.
3. Add an `is-stale` class when `errorMessage` is set while items exist, and a `Showing cached data` banner.

### S8. Refresh-interval defaults — `P1-5`, `P2-5`

**File:** `widgets/metadata.js`
**Risk:** low, but it is a **behavior change for existing users** — defaults only affect new widget instances, so existing boards keep their stored values. That is the desired scope.

| Widget | Now | Proposed | Reason |
|---|---|---|---|
| `githubPrList` | 1 | 10 | 1 min = exactly the 60/hr anonymous limit |
| `githubReviewInbox` | 5 | 15 | highest per-refresh cost in the product |
| `flexWorktime` | 1 | 15 | may open/close a background tab per cycle |
| `flexWorktimeTimeline` | 1 | 15 | same, plus heavier scrape |

Also reconsider `openFlexTabIfMissing: true` as a default. Silently opening background tabs is surprising; defaulting it off with clear copy ("Open Flex tab to sync") is more honest. Requires a product decision — flagged, not assumed.

### S9. Caching for Gmail, RSS, Calendar, AI Chat — `P2-2`

**Files:** the four widgets
**Risk:** low. Follows the established pattern.

Verified these have zero `cacheAt`/`localStorage` usage while every comparable widget caches — an inconsistency, not a policy.

Reuse the existing pattern rather than inventing one. Two options already in the codebase:
- config-embedded cache (GitHub/Monday style) — survives restart, but grows the persisted state blob
- `localStorage` + `localStorageCacheIndex` (weather/Flex style) — keeps the state blob small

**Prefer the `localStorage` route** for these four, specifically because `P3-1` (below) wants *less* payload in persisted state, not more.

Note that S4 substantially reduces the pain here by removing the redundant rebuild, so S9 is about first-paint quality (no empty flash on load) rather than request volume.

### S10. Upgrade the buyer-gate test from source-literal to rendered copy — enables durability of S6

**File:** `tests/buyer-gate-source-contract.test.mjs`
**Risk:** low, high value.

The current gate only greps source text, which is why `Failed to fetch` shipped despite being explicitly forbidden. Add a rendering assertion layer: construct each widget with a stubbed `fetch` that rejects with each realistic failure, then assert the rendered status text matches none of the forbidden patterns.

This is the single change that prevents the P1-2 class from recurring, and it should be treated as part of S6's definition of done rather than optional follow-up.

---

## Stage 4 — Breadth (P1/P2)

### S11. Widget accessibility baseline — `P1-6`

**Files:** 13 widgets, `styles.css`, `widget-drag-motion.css`

`widgets/todo.js` already demonstrates the house pattern — copy it rather than inventing one:

```js
li.tabIndex = 0;
li.dataset.noPageSwipe = "true";
li.dataset.noPageDrag = "true";
checkbox.setAttribute("aria-label", "Mark task done");
```

Note the `data-no-page-swipe` / `data-no-page-drag` attributes: `core/swipe-targets.js` honors these via `LOCK_SELECTOR`, so this is also the documented way to register widget-local gestures. That resolves the `P1-2` swipe-contract violation in the GitHub audit — Review Inbox rows should carry these attributes instead of relying on `.widget-card` blocking.

Priority order within this stage, by interactivity:
1. `container` (folder expand/collapse) and `shortcut` (tile activation) — currently mouse-only for their primary action
2. List widgets: `githubPrList`, `gmail`, `rss`, `calendar`, `mondayAssigned`, `mondayMeetingNote`
3. Display widgets: `clock`, `label`, `notes`, `codexUsage`, `aiChat`

Extend `prefers-reduced-motion` (only 3 occurrences today) to the drag/swipe transitions in `widget-drag-motion.css` and the review-inbox swipe animation.

### S12. Request cancellation — `P2-3`

**Files:** all fetching widgets, plus a small shared helper

Zero `AbortController` usage today. The fetch shape is uniform (`await fetch(url, { headers, cache: "no-store" })`), so a shared helper is viable:

```js
// widgets/shared/abortableFetch.js
export function createRequestScope() {
  let controller = null;
  return {
    signal() { controller?.abort(); controller = new AbortController(); return controller.signal; },
    abort() { controller?.abort(); controller = null; }
  };
}
```

Call `scope.abort()` in each `destroy()` and at the start of each new load. Keep `requestSerial` — it stays correct for state safety and now handles the abort-race too.

Treat `AbortError` as a non-error in the catch branches so cancellation does not render a failure message.

### S13. Pointer-path layout batching — `P2-4`

**Files:** `app.js` (`dockSlotIndexAtPoint`, `dockSlotRectRelativeToHost`), `core/drop-guide-runtime.js`

`getBoundingClientRect` runs per `pointermove` during dock drags with no rAF batching. Two changes:
1. Cache dock strip and slot rects at drag start; invalidate on resize and on dock config change rather than per move.
2. Coalesce visual updates into a single rAF tick per frame.

Measure before and after — this is the one fix in the plan whose payoff is asserted rather than verified, since no profiling was done.

### S14. Read/ignore state pruning — `P2-8`

**Files:** `widgets/shared/scopedItemStorage.js`, `widgets/githubReviewInbox.js`

Two independent problems:
1. Read keys are activity-versioned (`buildReviewInboxReadItemKey` embeds `latestAttentionAt`), so each new event creates a permanent key. Replace with a per-PR-number **watermark**: store the newest attention timestamp the user has seen, and treat `latestAttentionAt <= watermark` as read. This changes unbounded growth into one entry per PR.
2. No prune exists at all. Add `pruneScopedItems(storageKey, scopeKey, liveItemKeys)` to `scopedItemStorage.js` and call it after each successful sync with the current PR-number set, dropping closed/merged PRs.

### S15. Setup-path affordances — `P2-6`, `P2-7`

**Files:** 6 setup-heavy widgets, `widgets/metadata.js`

1. Add an `Open settings` button to every "Add X in settings" empty state. `openSettings` is already available to all widgets.
2. Progressive disclosure for dense settings: `clock` has 12 fields and is the canonical Add-Widget probe; `calendar` 9; `shortcut`, `githubReviewInbox`, `bookmarks` 8 each. Add an `advanced: true` flag in `settingsSchema` and render advanced fields behind a collapsed section. This requires a change in `core/widget-modal-fields-render.js` and is the largest UI change in the plan — consider splitting it out.

---

## Stage 5 — Polish (P2/P3)

### S16. Avoid per-save full clone — `P2-1`, downgraded to P3
Narrowed after Correction 2. `buildSessionSnapshot`'s `structuredClone` is the only unconditional full-state cost. Options: clone lazily only when a write actually proceeds past the fingerprint check, or track a dirty-subtree set. Low priority given the fingerprint is already cheap for user edits.

### S17. Copy language normalization — `P1-7`
- `widgets/codexUsage.js`: `extractStatus` returns Korean or English depending on the scraped page. Normalize to canonical tokens (`"remaining"` / `"used"`) internally and render one chosen UI language. Hardcoded Korean slot titles (`"Codex · 5시간"`) should match the rest of the UI.
- `app.js:2805,2827`: two Korean toasts inside an otherwise-English UI. Align with surrounding copy.

**Product decision needed:** is the UI language English or Korean? The codebase is currently mixed. Pick one and make it a documented convention before doing the mechanical work, otherwise this churns twice.

### S18. Remaining GitHub polish — `P3-1` … `P3-5`
- `P3-1`: `buildGitHubRepoPullsPageUrl("")` returns `https://github.com`; return empty and disable the Open action instead.
- `P3-2`: fixed 82px rows clip wrapping badges. Cap badge count with a `+N` overflow indicator rather than growing the row (AGENTS.md requires stable row height).
- `P3-3`: unify labels/placeholders/help text between the two GitHub widgets.
- `P3-4`: `agingDangerDays` silently clamps to `max(warnDays+1, requested)`. Validate in the settings modal and write the corrected value back visibly.
- `P3-5`: explain auto-ignore. Show the reveal toggle whenever an auto-ignore rule is active, not only when count > 0, with a tooltip stating the rule.

---

## Risk register

| Fix | Risk | Mitigation |
|---|---|---|
| S3 → S4 (live instance) | Silent layout data loss if ordered wrong or landed together | Two commits, S3 first with an explicit mutation test; never merge S4 before S3 is green |
| S2 (GitHub budget) | Items beyond `maxItems` lose participation data, changing auto-ignore counts | Accept and reword status copy; assert bounded fetch count in tests |
| S8 (refresh defaults) | Users may expect near-real-time updates | Defaults affect new instances only; existing boards unchanged |
| S12 (AbortController) | `AbortError` rendering as a user-facing failure | Explicitly treat `AbortError` as non-error in every catch |
| S15 (progressive disclosure) | Touches the shared settings renderer used by all widgets | Split into its own change; strong modal-contract regression coverage |
| S17 (language) | Mechanical work churns twice without a decision | Require the language convention decision before implementation |

---

## Verification gates

Every stage must pass, and every fix needs a test that fails before it:

```bash
npm test                  # currently 794 passing
npm run test:production   # 138 test files guarded
npm run smoke:extension   # unpacked-extension CDP smoke
```

Stage-specific manual smoke, since automated coverage cannot reach these:
- **S1:** throttle the network in DevTools, force a widget module load failure, confirm Retry recovers without a page reload.
- **S4:** board with Gmail + RSS + Calendar; press Ctrl+Z repeatedly and confirm via the Network panel that no refetch storm occurs and scroll position survives.
- **S5:** fill `chrome.storage.local` near quota and confirm the toast appears.
- **S11:** keyboard-only pass over every widget; confirm each primary action is reachable.

Two structural gaps make this plan harder than it should be and are worth closing alongside it:
- `widgets/githubPrList.js` has no test file at all.
- `styles.css` (5,556 lines) has no visual regression coverage, so S11/S18 layout work is unverifiable by automation.

---

## Recommended commit sequence

| # | Commit | Branch |
|---|---|---|
| 1 | S1 lazy-load retry + tests | `fix` |
| 2 | S5 persistence failure surfacing + quota check | `fix` |
| 3 | S3 live instance lookup + mutation tests | `fix` |
| 4 | S4 renderBoard signature diff + tests | `fix` |
| 5 | S6 shared `describeRequestError` + 6 call sites | `fix` |
| 6 | S10 rendered-copy buyer gate | `fix` |
| 7 | S2 GitHub request budget + rate-limit backoff | `feat/widget-ui` |
| 8 | S7 GitHub recovery + freshness | `feat/widget-ui` |
| 9 | S8 refresh defaults | `fix` |
| 10 | S9 caching for 4 widgets | `feat/widget-ui` |
| 11 | S12 AbortController scope | `fix` |
| 12 | S14 read/ignore pruning | `fix` |
| 13 | S11 accessibility baseline (batched by widget group) | `feat/widget-ui` |
| 14 | S13 pointer-path batching | `fix` |
| 15 | S15/S17/S18 polish | `feat/widget-ui` |

Commits 1-6 are the ones that change whether this product can be trusted. Everything after is quality.

---

## Explicitly out of scope

- Build toolchain or TypeScript adoption. None of the 22 findings is caused by the absence of a build step.
- Further `core/` subdivision. Average file is 121 lines; the remaining issue is injection-contract shape, not file size.
- Replacing DOM scraping with unofficial APIs. `PROJECT.md` lists this as out of scope and that judgment holds.

---

*Every fix site in this plan was opened and read. Corrections 1 and 2 came from that reading and change the recommended approach relative to the wrapup report. Cost-reduction estimates are analytic; the S13 payoff is asserted rather than measured.*
