# Codebase Concerns

**Analysis Date:** 2026-05-18

## Tech Debt

**Core app runtime and UI orchestration (`app.js`):**
- Issue: `app.js` is still a large 5,077-line module that combines state model, persistence, layout orchestration, settings UI, modal workflows, wallpaper/media coordination, and startup-state import/export.
- Files: `app.js`
- Impact: High change surface area increases regression risk; unrelated feature updates collide in one file and make refactoring/testing difficult.
- Fix approach: Split `app.js` into focused modules (state/persistence, board interactions, settings UI, background media, startup import/export) behind explicit interfaces.

**Duplicated OAuth/session logic in Monday widgets:**
- Issue: Monday auth flow, token relay parsing, session normalization, and storage handling are duplicated across widgets.
- Files: `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`
- Impact: Behavior drift risk (bug fixes and security hardening need to be applied twice), and higher maintenance cost.
- Fix approach: Extract shared Monday auth client helpers into one module and consume from both widgets.

**Large committed startup snapshot as runtime baseline:**
- Issue: Startup baseline is now a smaller composable payload, but it is still a committed runtime baseline that can drift from product intent if not reviewed as a fixture.
- Files: `config/startup-state.json`
- Impact: Default-state evolution can still become coupled to one captured environment if changes are not covered by startup-state and buyer-gate tests.
- Fix approach: Keep defaults minimal and composable, review startup changes as product changes, and preserve `tests/startup-state.test.mjs` coverage.

## Known Bugs

**Connector redirect configuration docs mismatch runtime behavior:**
- Symptoms: `.env.example` states `ALLOW_CHROME_EXTENSION_REDIRECT=1` works without `ALLOWED_EXTENSION_IDS`, but runtime rejects chrome-extension redirects when allowlist is empty.
- Files: `connector/.env.example`, `connector/server.mjs`
- Trigger: Set only `ALLOW_CHROME_EXTENSION_REDIRECT=1` and attempt connector redirect without populated `ALLOWED_EXTENSION_IDS`.
- Workaround: Set `ALLOWED_EXTENSION_IDS` with the extension ID(s), or use chromiumapp redirect flow only.

## Security Considerations

**Broad integration reach from extension context:**
- Risk: Extension requests many explicit host permissions for integrations; while broad wildcards are not present, the permission surface is still large enough to require release review.
- Files: `manifest.json`
- Current mitigation: `manifest.json` uses explicit host allowlists, and `npm run test:production` rejects `<all_urls>`, `http://*/*`, `https://*/*`, and `*://*/*`.
- Recommendations: Keep host permissions tied to active widget integrations and document why each host is needed before public release.

**Plaintext token persistence in local extension storage:**
- Risk: Access tokens are persisted in `chrome.storage.local` for Monday and AI chat sessions.
- Files: `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`, `widgets/aiChat.js`, `app.js`
- Current mitigation: Optional sanitized export path redacts sensitive keys during manual state export.
- Recommendations: Minimize token persistence duration, prefer short-lived tokens, isolate auth state from general UI snapshot, and gate token usage behind explicit reconnect when possible.

**Optional open redirect broadening in connector:**
- Risk: Connector can allow any HTTPS redirect when `ALLOW_ANY_HTTPS_REDIRECT=1`, increasing token-delivery exposure if misconfigured.
- Files: `connector/server.mjs`, `connector/.env.example`
- Current mitigation: Default configuration keeps this disabled; extension-ID allowlist exists for extension redirects.
- Recommendations: Keep `ALLOW_ANY_HTTPS_REDIRECT` disabled in all environments; enforce explicit allowlists only.

## Performance Bottlenecks

**Frequent full-state serialization during save pipeline:**
- Problem: Save dedupe uses `JSON.stringify(snapshot)` fingerprints of the full state and runs frequently (150ms debounce with many `queueSave()` call sites).
- Files: `app.js`
- Cause: Fingerprinting and clone-heavy snapshot creation scale with whole-state size.
- Improvement path: Use incremental dirty flags/version counters and scoped persistence writes instead of full snapshot fingerprinting each cycle.

**Bookmark widget reloads full bookmark tree on each event:**
- Problem: Widget resolves root from `chrome.bookmarks.getTree()` and re-renders from scratch on bookmark events and manual refresh.
- Files: `bookmarks.js`, `widgets/bookmarks.js`
- Cause: Full-tree fetch + recursive traversal + full DOM rebuild per update.
- Improvement path: Cache tree slices by selected folder and apply targeted updates for bookmark change events.

**Cache pruning scans all `localStorage` keys on writes:**
- Problem: Weather/Flex cache pruning iterates all `localStorage` keys and parses candidate entries on cache write.
- Files: `widgets/weather.js`, `widgets/flexWorktime.js`
- Cause: Prefix scan over global storage namespace each write.
- Improvement path: Track index metadata for cache keys or move caches to `chrome.storage.local` with bounded key sets.

## Fragile Areas

**Flex Home scrape extraction depends on page text heuristics:**
- Files: `widgets/flexWorktime.js`
- Why fragile: Extraction relies on Korean status regex and body-text scoring from `flex.team/home`; minor UI/content changes or login-flow changes break parsing.
- Safe modification: Keep scrape logic isolated, preserve fallback/error contracts, and validate against real logged-in tab scenarios before merging changes.
- Test coverage: Unit coverage exists for platform and parser contracts, but live logged-in Flex UI smoke remains manual.

**Shared auth/session behavior split across multiple widgets:**
- Files: `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`, `widgets/aiChat.js`
- Why fragile: Similar OAuth/token/session flows are implemented separately with different helper stacks.
- Safe modification: Centralize auth parsing/storage helpers first, then refactor call sites incrementally.
- Test coverage: Connector and widget regression tests cover several auth/session contracts, but live connector reconnect/disconnect flows remain manual release-smoke items.

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
- Risk: Upstream contract/rate-limit changes in Monday GraphQL, Open-Meteo, RSS/ICS sources, or favicon service can break widgets.
- Impact: Runtime widget failures surface directly to users.
- Migration plan: Introduce contract checks/mocks and degrade gracefully with cached fallback snapshots.
- Files: `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`, `widgets/weather.js`, `widgets/rss.js`, `widgets/calendar.js`, `widgets/shortcut.js`

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

---

*Concerns audit refreshed: 2026-05-18*
