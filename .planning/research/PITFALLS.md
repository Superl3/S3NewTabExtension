# Domain Pitfalls

**Domain:** Authenticated web usage-page parsing in MV3 extensions (Codex Usage widget)
**Researched:** 2026-03-31

## Critical Pitfalls

Mistakes that commonly cause silent data drift, flaky sync, or expensive rewrites.

### Pitfall 1: Selector-coupled parsing of volatile UI
**What goes wrong:** Parser relies on fragile CSS class names / exact DOM hierarchy, so a provider UI rollout breaks extraction overnight.
**Why it happens:** Teams optimize for short-term accuracy on today’s markup, not change tolerance.
**Consequences:** Empty/partial metrics, false “0%” style displays, trust loss.
**Prevention:**
- Parse from resilient text blocks anchored by stable semantics (header phrases, model+period tokens), not hashed classnames.
- Keep parser versioned (`parserVersion`) and log parse coverage by slot (4 expected slots).
- Keep a fallback path: retain last known-good snapshot with staleness indicator instead of rendering blanks as valid data.
**Detection (warning signs):**
- Sudden jump in “no metric found” while usage page still loads.
- `lines` captured but expected slot map has missing keys (`codex-5h`, `codex-weekly`, `spark-5h`, `spark-weekly`).
- Spike in support reports right after vendor UI change.

### Pitfall 2: One-shot scrape on SPA page (missing post-load mutations)
**What goes wrong:** Extraction runs once at load and misses React/SPA re-rendered content, deferred quota cards, or route transition updates.
**Why it happens:** Assuming `DOMContentLoaded`/`tabs.onUpdated(status=complete)` implies final data is present.
**Consequences:** Intermittent success, “works on my machine” behavior, stale widget even with open usage tab.
**Prevention:**
- Use `MutationObserver` with debounce and explicit `disconnect()` on teardown.
- Trigger recapture on visibility regain and history/navigation events where appropriate.
- Define a “data-ready” gate (e.g., at least N quota headers parsed or timeout with explicit partial-state error).
**Detection (warning signs):**
- First sync after opening tab fails, second sync succeeds.
- Captures contain shell text but missing quota rows.
- CPU spikes if observer is too broad (observer storm).

### Pitfall 3: Message-channel lifecycle mistakes (MV3 async response)
**What goes wrong:** Content script receives message but response is dropped (`undefined`/null), or caller sees intermittent “Could not establish connection”.
**Why it happens:** Missing proper async response contract in `runtime.onMessage`, racing send before script is injected, or tab/document changed.
**Consequences:** False negatives in sync flow, duplicated retries, confusing user errors.
**Prevention:**
- For async handlers, use one consistent pattern: return literal `true` + `sendResponse`, or Promise-based handling with browser-version awareness.
- On failure, perform idempotent recovery: inject script then retry once.
- Scope sends by correct tab/document when available; treat “no receiving end” as recoverable, others as hard failure.
**Detection (warning signs):**
- Frequent errors: “Could not establish connection”, “Receiving end does not exist”.
- High retry count with low success delta.
- Null responses without explicit error payload.

### Pitfall 4: Service worker ephemerality assumed away
**What goes wrong:** In-memory state is treated as durable; worker suspension loses coordination state mid-flow.
**Why it happens:** Background page mental model carried into MV3 service workers.
**Consequences:** Sync orchestration resets, duplicate operations, stale UI state transitions.
**Prevention:**
- Persist coordination state in `chrome.storage`/`storage.session` rather than globals.
- Design sync operations to be restart-safe and idempotent.
- Keep worker responsibilities thin; let content script own page-local extraction.
**Detection (warning signs):**
- Randomly missing state after idle periods.
- Behavior changes when extension devtools is closed (worker no longer artificially kept alive).

### Pitfall 5: Auth/session assumptions in extension context
**What goes wrong:** Team tries to fetch authenticated usage endpoint directly from extension context and expects same cookie behavior as in-page session.
**Why it happens:** Confusion between content-script DOM access and extension-origin network/cookie semantics.
**Consequences:** 401/redirect loops, brittle hacks, potential policy risk if attempting unofficial API workarounds.
**Prevention:**
- Treat authenticated usage as **UI DOM extraction in logged-in tab** (project-aligned), not unofficial backend scraping.
- Ensure correct host permissions and tab targeting; avoid cross-origin auth emulation.
- Make login-required state explicit in UI (“Open usage tab, log in, Sync again”).
**Detection (warning signs):**
- Works in visible logged-in tab but fails in background fetch.
- Parsing code drifts toward reverse-engineered private endpoints.

## Moderate Pitfalls

### Pitfall 1: Locale/token brittleness in quota text parsing
**What goes wrong:** Regex only matches one locale phrase (e.g., Korean tokens), misses English/variant phrasing.
**Prevention:**
- Normalize whitespace aggressively.
- Support bilingual token sets for period/status/reset phrases.
- Keep token table centralized and test with fixture snapshots from multiple UI languages.
**Warning signs:** Parse success differs by browser locale/account language.

### Pitfall 2: Frame/document ambiguity
**What goes wrong:** Script/message lands in wrong frame/document in complex navigation scenarios.
**Prevention:**
- Prefer main-frame targeting for this use case.
- Use `documentId`/frame-aware APIs where precision matters.
- Ignore non-main-frame captures unless explicitly needed.
**Warning signs:** Multiple captures from same tab with conflicting payloads.

### Pitfall 3: Overwriting fresh data with stale capture (race)
**What goes wrong:** Later-arriving older capture overwrites newer snapshot in storage/UI.
**Prevention:**
- Compare `capturedAt` and only accept monotonic newer snapshots.
- Include source URL/path validation before applying.
**Warning signs:** Timestamp goes backward; UI “flickers” between values.

### Pitfall 4: Storage write/read cadence mismanaged
**What goes wrong:** Frequent writes during mutation storms and chatty UI listeners.
**Prevention:**
- Debounce writes.
- Keep snapshot payload bounded (line caps, metric-only primary view).
- Prefer `storage.local` for this dataset; avoid `storage.sync` quotas for high-churn telemetry.
**Warning signs:** Write throttling errors, laggy UI updates.

## Minor Pitfalls

### Pitfall 1: Empty state communicated as hard error
**What goes wrong:** Logged-out or not-on-usage-page state is shown as generic failure.
**Prevention:** Explicit state taxonomy: `not_opened`, `not_logged_in`, `parse_partial`, `synced`.

### Pitfall 2: Observer lifetime leaks
**What goes wrong:** Mutation observers persist longer than needed and keep work running.
**Prevention:** Disconnect observers when route no longer matches usage path.

### Pitfall 3: Status chip noise and low-signal UI
**What goes wrong:** Widget shows verbose parser internals or stale debug lines.
**Prevention:** Keep default UI to percent + reset time + concise state; hide internals behind debug mode.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Parser hardening | Regex tuned to one DOM snapshot | Build fixture-based tests with multiple captured `lines` snapshots and token variants |
| Open/Sync recovery | Retrying all failures blindly | Retry only recoverable transport errors once; classify hard failures |
| UI sync wiring | storage change races causing stale overwrite | Apply monotonic `capturedAt` guard before render |
| MV3 background reliability | assuming long-lived worker memory | Persist coordination state and make flows idempotent |
| Permissions/security | over-broad host permissions or unofficial API calls | Keep minimal host scope; stay DOM-based on user-opened authenticated page |

## Confidence Notes

- **HIGH:** MV3 lifecycle/messaging/storage pitfalls (directly documented in Chrome extension docs).
- **MEDIUM:** DOM quota-card volatility patterns and UI drift patterns (supported by architecture behavior + field practice, but not explicitly codified by one canonical vendor doc).
- **LOW:** None used for core recommendations.

## Sources

1. Chrome Extensions — Message passing (async response rules, listener behavior, serialization) — https://developer.chrome.com/docs/extensions/develop/concepts/messaging (Last updated 2025-12-03)
2. Chrome Extensions — Extension service worker lifecycle (idle shutdown, persistence guidance) — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle (Last updated 2023-05-02)
3. Chrome Extensions — `chrome.scripting` API (injection targeting, execution worlds, frame/document targeting) — https://developer.chrome.com/docs/extensions/reference/api/scripting (Last updated 2026-01-07)
4. Chrome Extensions — `chrome.tabs` API (messaging, tab lifecycle caveats) — https://developer.chrome.com/docs/extensions/reference/api/tabs
5. Chrome Extensions — `chrome.webNavigation` API (event order, BFCache note, documentId/frame lifecycle) — https://developer.chrome.com/docs/extensions/reference/api/webNavigation (Last updated 2025-08-11)
6. Chrome Extensions — Storage and cookies (extension vs page storage/cookie behavior, partitioning notes) — https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies (Last updated 2023-09-28)
7. Chrome Extensions — `chrome.storage` API (quotas, async writes, onChanged) — https://developer.chrome.com/docs/extensions/reference/api/storage (Last updated 2025-12-19)
8. MDN — MutationObserver (observe/disconnect/takeRecords semantics) — https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver (Last modified 2025-06-10)
