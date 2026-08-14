# Codebase Concerns

**Analysis Date:** 2026-08-14 (re-measured against working tree)

## Tech Debt

**Core app runtime orchestration glue (`app.js`):**
- Issue: `app.js` is 5,120 lines with 92 import statements and 23 module-level mutable globals. Pure logic has largely moved into `core/` (130 files, 15,788 lines, largest file 513 lines), so the remaining weight is dependency-injection glue: `wireAppEvents(...)` and sibling wiring calls pass 60+ closures into core modules.
- Files: `app.js`, `core/wire-events-main.js`, `core/widget/app-runtime.js`
- Impact: Change surface is still wide, and the injection contracts are large positional-object shapes that are hard to review. Some concepts are injected twice in transitional form (`state` value plus `getState` getter).
- Fix approach: Do not split further by line count. Consolidate the injection surface into a few cohesive context objects (state store, layout engine, persistence, modal host), following the existing `core/widget-controller-context.js` precedent.

**MV3 background service worker is absent:**
- Issue: `manifest.json` has no `background` key. Alarm scheduling (`core/alarm/alarm-runtime.js`, 30s tick) and Codex Usage tab orchestration run entirely in the New Tab document, so they stop when the last new-tab page is closed. `chrome.alarms` and `chrome.notifications` are never used; TODO alarms use the web `Notification` API plus `setTimeout`.
- Files: `manifest.json`, `core/alarm/alarm-runtime.js`, `core/alarm/notification-dispatcher.js`, `widgets/todo.js`, `widgets/codexUsage.js`
- Impact: TODO alarms silently do not fire without an open new tab. This contradicts `.planning/research/STACK.md`, which prescribes `chrome.alarms` + service worker as the recommended pattern.
- Fix approach: Record an explicit decision in PROJECT.md. Either add a service worker with `chrome.alarms`, or document "alarms require an open new tab" as a product constraint and surface it in the TODO alarm UI.

**Naming collision on "background":**
- Issue: `core/background/` and `core/background-*.js` mean wallpaper/visual background, not MV3 extension background. There is no MV3 background code in the repo at all.
- Files: `core/background/`, `core/background-runtime.js`, and 8 sibling `background-*` modules
- Impact: Contributors and agents searching for extension background logic land on wallpaper code and can wrongly conclude a service worker exists.
- Fix approach: Rename the visual layer to `core/wallpaper*`/`core/surface-background*`, or add a header comment in `core/background/index.js` stating that this is the visual background subsystem.

**Large committed startup snapshot as runtime baseline:**
- Issue: Startup baseline is now a smaller composable payload, but it is still a committed runtime baseline that can drift from product intent if not reviewed as a fixture.
- Files: `config/startup-state.json`
- Impact: Default-state evolution can still become coupled to one captured environment if changes are not covered by startup-state and buyer-gate tests.
- Fix approach: Keep defaults minimal and composable, review startup changes as product changes, and preserve `tests/startup-state.test.mjs` coverage.
- Re-measured 2026-08-14: the file is 6,956 bytes and now uses a composable `defaults`/`presets`/`applyPresets`/`overrides` shape with zero inline `instances`, so this concern is largely mitigated. Keep as a review reminder only.

**GitHub Review Inbox network cost is unbounded by user-visible settings:**
- Issue: `fetchReviewInboxItems` enumerates open PRs with `per_page=100` and `maxPages=20` (up to 2,000 PRs), then issues 4 detail requests per enumerated PR (reviews, issue comments, review comments, commits) before `maxItems` is applied at render time. The per-PR loop is serial (`for..of` with `await`), and there is no rate-limit backoff, `AbortController`, or request budget anywhere in the repo.
- Files: `widgets/githubReviewInbox.js`, `widgets/shared/githubApi.js`
- Impact: On a 50-PR repository one refresh costs ~201 requests; at `refreshMinutes=1` that is ~12,060 requests/hour against GitHub's 5,000/hour authenticated limit. Without a token, even a 3-PR repo at the 5-minute default exceeds the 60/hour anonymous limit. Full refresh latency scales linearly with open PR count (~15s at 100 PRs / 150ms RTT).
- Fix approach: Cap detail expansion to `maxItems` candidates, lower `maxPages`, add rate-limit-aware backoff using `x-ratelimit-remaining`/`retry-after`, and bound concurrency instead of serializing.

## Known Bugs

No confirmed open bugs as of the 2026-08-14 re-measurement.

**Resolved since the 2026-05-18 audit** (verified against the working tree):
- `ALLOW_ANY_HTTPS_REDIRECT` no longer exists anywhere in `connector/`. The optional open-redirect broadening path is gone.
- `connector/.env.example` now states that `chrome-extension://` redirects require both `ALLOW_CHROME_EXTENSION_REDIRECT=1` and a populated `ALLOWED_EXTENSION_IDS`, which matches `connector/redirect-policy.mjs`. The docs/runtime mismatch is fixed.
- Monday OAuth/session logic is no longer duplicated. Both Monday widgets import `widgets/shared/mondayAuth.js`, `widgets/shared/mondayClient.js`, and `widgets/shared/mondayConfig.js`.
- Bookmark tree access is cached. `bookmarks.js` holds a 1,200ms TTL cache with in-flight promise dedupe and invalidates on `onCreated`/`onChanged`/`onRemoved`/`onMoved`/`onChildrenReordered`.
- `localStorage` cache pruning no longer scans all keys on every write. `widgets/shared/localStorageCacheIndex.js` keeps an index and falls back to a full scan only when the index is missing.

## Security Considerations

**Broad integration reach from extension context:**
- Risk: Extension requests many explicit host permissions for integrations; while broad wildcards are not present, the permission surface is still large enough to require release review.
- Files: `manifest.json`
- Current mitigation: `manifest.json` uses explicit host allowlists, and `npm run test:production` rejects `<all_urls>`, `http://*/*`, `https://*/*`, and `*://*/*`.
- Recommendations: Keep host permissions tied to active widget integrations and document why each host is needed before public release.

**Plaintext token persistence in local extension storage:**
- Risk: Access tokens are persisted in `chrome.storage.local` for Monday and AI chat sessions. GitHub widget PATs are persisted in the dashboard state snapshot itself, as `config.accessToken` on the widget instance.
- Files: `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`, `widgets/aiChat.js`, `widgets/githubPrList.js`, `widgets/githubReviewInbox.js`, `app.js`, `storage.js`
- Current mitigation: The manual export path redacts keys matching `SENSITIVE_EXPORT_KEYWORD_PARTS` (`token`, `secret`, `password`, `apikey`, `auth`, `credential`, `session`, `bearer`, `private`, `clientsecret`) via `core/state-export-sanitize.js`.
- Recommendations: Minimize token persistence duration, prefer short-lived tokens, isolate auth state from the general UI snapshot, and gate token usage behind explicit reconnect when possible. Note that `chrome.storage` unavailability falls back to `localStorage` in `storage.js`, which widens plaintext exposure during local/demo execution.

**Connector redirect policy is strict by default (verified):**
- Risk: Residual risk is limited to misconfigured allowlists rather than protocol broadening.
- Files: `connector/redirect-policy.mjs`, `connector/server.mjs`, `connector/.env.example`
- Current mitigation: `isAllowedRedirectUri` permits only `*.chromiumapp.org` hosts whose 32-char `[a-p]` extension ID is in `ALLOWED_EXTENSION_IDS`, `chrome-extension://` when the flag and a non-empty allowlist both hold, and `http://` on `localhost`/`127.0.0.1`. Everything else is rejected. `ENABLE_TOKEN_RELAY` additionally requires a loopback request.
- Recommendations: Keep the allowlist populated per environment and keep `ENABLE_TOKEN_RELAY` off outside local development.

## Performance Bottlenecks

**Frequent full-state serialization during save pipeline:**
- Problem: Save dedupe uses `JSON.stringify(snapshot)` fingerprints of the full state. The debounce is 150ms (`core/persistence-runtime.js`) and `queueSave()` has many call sites.
- Files: `app.js`, `core/persistence-runtime.js`
- Cause: Fingerprinting and clone-heavy snapshot creation scale with whole-state size.
- Improvement path: Use incremental dirty flags/version counters and scoped persistence writes instead of full snapshot fingerprinting each cycle.
- Aggravating factor: GitHub widgets persist their fetched PR lists into widget config (`cachePullItems`, `cacheReviewItems`), so every successful refresh enlarges the snapshot that gets fingerprinted and written.

**GitHub Review Inbox refresh is serial per pull request:**
- Problem: The detail loop awaits one PR's 4 parallel requests before starting the next PR, so wall-clock refresh time is linear in open PR count.
- Files: `widgets/githubReviewInbox.js`
- Cause: `for (const pull of openPulls) { ... await Promise.all(...) }` with no outer concurrency.
- Improvement path: Bound outer concurrency (for example 4-6 in flight), and stop expanding details once `maxItems` inclusions are found.

**Unbounded read-state key growth in review inbox:**
- Problem: `buildReviewInboxReadItemKey` embeds `latestAttentionAt`, `latestParticipationAt`, `reason`, and requested-state into the key, so each new activity event on the same PR creates a new stored key. Neither `widgets/shared/scopedItemStorage.js` nor `widgets/shared/ignoredItems.js` has any prune or cap logic.
- Files: `widgets/githubReviewInbox.js`, `widgets/shared/scopedItemStorage.js`, `widgets/shared/ignoredItems.js`
- Cause: Activity-versioned read keys with append-only storage.
- Improvement path: Store the newest read watermark per PR number rather than a key per activity version, or prune keys for PRs absent from the latest snapshot.

**Resolved since 2026-05-18** (verified against the working tree):
- Bookmark tree fetching now has a 1,200ms TTL cache with in-flight dedupe and event-driven invalidation in `bookmarks.js`.
- Weather/Flex cache pruning now uses the index in `widgets/shared/localStorageCacheIndex.js` instead of scanning all `localStorage` keys per write.

## Fragile Areas

**Flex Home scrape extraction depends on page text heuristics:**
- Files: `widgets/flexWorktime.js`
- Why fragile: Extraction relies on Korean status regex and body-text scoring from `flex.team/home`; minor UI/content changes or login-flow changes break parsing.
- Safe modification: Keep scrape logic isolated, preserve fallback/error contracts, and validate against real logged-in tab scenarios before merging changes.
- Test coverage: Unit coverage exists for platform and parser contracts, but live logged-in Flex UI smoke remains manual.

**Shared auth/session behavior split across multiple widgets:**
- Files: `widgets/aiChat.js`, `widgets/githubPrList.js`, `widgets/githubReviewInbox.js`
- Why fragile: Monday widgets are now centralized on `widgets/shared/mondayAuth.js` + `mondayClient.js` + `mondayConfig.js`, but AI Chat still carries its own connector/session stack, and the GitHub widgets use a plain config-field token with no session lifecycle at all.
- Safe modification: Move AI Chat onto `widgets/shared/authConnector.js` + `authSessionStorage.js`, and give the GitHub widgets a real token seam instead of a raw config field.
- Test coverage: Connector and widget regression tests cover several auth/session contracts, but live connector reconnect/disconnect flows remain manual release-smoke items.

**GitHub error copy passes upstream text straight to the UI:**
- Files: `widgets/githubPrList.js`, `widgets/githubReviewInbox.js`, `widgets/shared/githubApi.js`
- Why fragile: `parseGitHubError` returns the raw GitHub `message` field, and `normalizeErrorMessage` only applies the friendly fallback when the error has no message. Verified user-visible strings include `Failed to fetch`, `Not Found`, `Bad credentials`, `<html>502 Bad Gateway</html>`, and the full multi-sentence rate-limit message. `tests/buyer-gate-source-contract.test.mjs` only forbids these as literal source strings, so runtime pass-through is not caught.
- Safe modification: Map HTTP status and known GitHub message classes to actionable copy before display, keeping raw text for diagnostics only.
- Test coverage: No test asserts rendered error copy for these paths.

## Scaling Limits

**Board/page layout hard limits:**
- Current capacity: Grid limits are fixed (`GRID_MAX_COLUMNS = 16`, `GRID_MAX_ROWS = 16`), launcher pages fixed (`MAX_LAUNCHER_PAGES = 12`).
- Limit: Large dashboards cannot scale beyond these values without code changes.
- Scaling path: Externalize limits to validated settings and benchmark layout/render cost before increasing.
- Files: `app.js`

**Widget-local history/cache bounds:**
- Current capacity: AI chat history truncates to 40 messages; weather/flex caches keep bounded entries.
- Limit: Context/history depth and cache retention are intentionally shallow.
- Scaling path: Add configurable retention policies with storage quotas and eviction metrics.
- Files: `widgets/aiChat.js`, `widgets/weather.js`, `widgets/flexWorktime.js`

## Dependencies at Risk

**Flex Home scrape dependency on third-party UI structure/content:**
- Risk: Any `flex.team` content or login flow change can break worktime extraction.
- Impact: Flex widget data quality/availability degrades to frequent error states.
- Migration plan: Prefer stable API mode where available; keep scrape mode as fallback.
- Files: `widgets/flexWorktime.js`

**External API and feed dependencies with no integration test safety net:**
- Risk: Upstream contract/rate-limit changes in Monday GraphQL, GitHub REST, Open-Meteo, RSS/ICS sources, or favicon service can break widgets.
- Impact: Runtime widget failures surface directly to users.
- Migration plan: Introduce contract checks/mocks and degrade gracefully with cached fallback snapshots.
- Files: `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`, `widgets/githubPrList.js`, `widgets/githubReviewInbox.js`, `widgets/weather.js`, `widgets/rss.js`, `widgets/calendar.js`, `widgets/shortcut.js`
- GitHub-specific: no code path reads `x-ratelimit-remaining`, `x-ratelimit-reset`, or `retry-after`, and there is no `AbortController` usage anywhere in the repo, so a slow or throttled GitHub cannot be backed off or cancelled.

## Missing Critical Features

**Real extension smoke is still manual:**
- Problem: The automated suite covers contracts and local browser smoke can cover rendered behavior, but there is no committed Playwright-style unpacked-extension E2E suite yet.
- Blocks: Fully automated proof for Chrome/Edge extension loading, real `chrome.*` permission prompts, and authenticated page scraping.
- Files: `docs/production-readiness.md`, future E2E harness.
- Current mitigation: `docs/production-readiness.md` defines the manual release smoke, and `npm run test:production` ensures that checklist stays present.

## Test Coverage Gaps

**Live extension runtime behavior is partially manual:**
- What's not fully automated: Real browser extension installation, permission prompts, authenticated tab reuse, and provider UI scraping against live accounts.
- Files: `manifest.json`, `content-scripts/codexUsageScraper.js`, `widgets/codexUsage.js`, `widgets/flexWorktime.js`, account-backed widgets.
- Risk: Local contract tests can pass while real browser/session behavior regresses.
- Priority: High

**Integration-heavy widgets still need live smoke:**
- What's not fully automated: Upstream provider UI changes, account login redirects, rate limits, and stale session behavior.
- Files: `widgets/rss.js`, `widgets/calendar.js`, `widgets/flexWorktime.js`, `widgets/weather.js`
- Risk: Upstream response variance causes production-only failures.
- Priority: High

**GitHub widget rendering and interaction are untested:**
- What's not automated: `widgets/githubPrList.js` has no dedicated test file at all. `widgets/githubReviewInbox.js` has 40 cases in `tests/github-review-inbox-logic.test.mjs`, but they cover pure candidate/aging/tab logic only; the swipe-to-ignore gesture, read-state transitions, cache rehydration, and error rendering are uncovered. `tests/github-shared.test.mjs` has 5 cases.
- Files: `widgets/githubPrList.js`, `widgets/githubReviewInbox.js`
- Risk: The most interaction-heavy widget in the repo (1,341 lines, custom pointer gesture) can regress silently.
- Priority: High

**No visual regression safety net for widget layout invariants:**
- What's not automated: `styles.css` is 5,556 lines and the AGENTS.md header/footer layout invariants (identical header height across Normal/Edit mode, fixed row height as item count changes, bottom-pinned footer) are enforced only by CSS rules.
- Files: `styles.css`, `single-item-surfaces.css`, `widget-drag-motion.css`
- Risk: Layout drift is invisible to `npm test`.
- Priority: Medium

---

*Concerns audit refreshed: 2026-08-14 (re-measured line counts, resolved-item verification, GitHub widget audit)*
