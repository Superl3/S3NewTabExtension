# Architecture Patterns

**Domain:** MV3 browser extension widget integration (Codex Usage extraction + state rendering)  
**Researched:** 2026-03-31

## Recommended Architecture

Use a **4-layer MV3 architecture** with storage as the system of record:

1. **Content Script Extractor** (page-local, least privilege)
2. **Service Worker Orchestrator** (privileged coordinator)
3. **Storage Model** (`chrome.storage.local` canonical snapshot + sync metadata)
4. **Widget Renderer** (new-tab UI subscribes to storage changes)

Current code already has extractor + widget + storage listener. The key architectural upgrade is to move orchestration from widget code into a dedicated **service worker command layer**, so UI and extraction are decoupled.

### Target topology (recommended)

```text
Codex Usage Page (chatgpt.com)
  └─ content-scripts/codexUsageScraper.js
       ├─ DOM parse (header/block strategy)
       ├─ normalize snapshot
       └─ runtime message response + optional storage write

Extension Service Worker (new)
  ├─ command router (SYNC_NOW, OPEN_USAGE_PAGE, GET_STATUS)
  ├─ tab discovery (chrome.tabs.query)
  ├─ script injection fallback (chrome.scripting.executeScript)
  ├─ retry/error classification
  ├─ alarm-based refresh (optional, bounded)
  └─ writes canonical snapshot/status to chrome.storage.local

New Tab Widget (widgets/codexUsage.js)
  ├─ renders from storage snapshot only
  ├─ sends high-level commands to service worker
  └─ subscribes to chrome.storage.onChanged for reactive updates

Storage (chrome.storage.local)
  ├─ codexUsage.snapshot.vN
  ├─ codexUsage.status (idle/syncing/error)
  └─ codexUsage.meta (parserVersion, sourceTabId, capturedAt, errorCode)
```

## Component Boundaries

| Component | Responsibility | Communicates With |
|---|---|---|
| `content-scripts/codexUsageScraper.js` | Read ChatGPT DOM, parse target usage blocks, return JSON-serializable snapshot only | Service worker via `runtime.onMessage`; optional `chrome.storage.local` |
| `service-worker.js` (new) | Owns sync workflow, tab lookup/open, script injection, retries, status transitions, write canonical storage | `chrome.tabs`, `chrome.scripting`, `chrome.runtime`, `chrome.storage`, `chrome.alarms` |
| `widgets/codexUsage.js` | Pure presentation and user actions (`Open`, `Sync`), no tab/scripting logic | Service worker via `runtime.sendMessage`, storage via `onChanged` |
| Storage schema (`chrome.storage.local`) | Single source of truth for renderable usage data and sync state | Read/write by service worker; read/react by widget |

## Data Flow

### 1) User-initiated sync flow (primary)

```text
Widget Sync click
  -> runtime.sendMessage({type:"CODEX_SYNC_NOW"}) to service worker
  -> service worker queries usage tab(s)
     -> if not found: tabs.create(CODEX_USAGE_URL), set status="needs_user_login"
     -> if found: tabs.sendMessage(CAPTURE)
         -> on "receiving end does not exist": scripting.executeScript + retry sendMessage
  -> content script parses DOM and returns snapshot
  -> service worker validates + normalizes + writes snapshot/status/meta to storage.local
  -> widget receives storage.onChanged and re-renders
```

### 2) Passive refresh flow (when usage tab changes)

```text
Usage page mutation/visibility event in content script
  -> debounced capture
  -> message to service worker OR direct storage write (choose one, not both)
  -> storage update
  -> widget auto-refresh via storage.onChanged
```

**Recommendation:** prefer **content script -> service worker -> storage** for all writes (single writer), to avoid split ownership bugs.

### 3) Startup hydration flow

```text
Widget create()
  -> read latest snapshot/status from storage.local
  -> immediate render (stale-while-revalidate style)
  -> optional background sync request to service worker
```

## Patterns to Follow

### Pattern 1: Service-worker command bus (HIGH confidence)
**What:** All privileged operations go through one runtime message router in service worker.  
**When:** Always, for `tabs/scripting/alarms` operations.  
**Why:** `chrome.tabs` is not available in content scripts, and central orchestration is more resilient than UI-driven tab control.

```typescript
// service-worker.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "CODEX_SYNC_NOW") {
    void syncCodexUsage().then(
      (result) => sendResponse({ ok: true, result }),
      (err) => sendResponse({ ok: false, error: String(err?.message || err) })
    );
    return true; // async response compatibility
  }
});
```

### Pattern 2: Single-writer storage model (HIGH confidence)
**What:** Only service worker writes `codexUsage.*`; widget/content-script read (or content-script returns data only).  
**When:** Always for stable state transitions and easier debugging.  
**Why:** Prevents race conditions and conflicting snapshot versions.

### Pattern 3: Storage-driven rendering (HIGH confidence)
**What:** Widget renders from storage snapshot + status only; never depends on in-flight tab calls for final UI state.  
**When:** Always.  
**Why:** Makes rendering deterministic and keeps UI responsive even when sync fails.

### Pattern 4: Error taxonomy + explicit UX states (MEDIUM-HIGH confidence)
**What:** Persist normalized error codes (`NO_TAB`, `NO_RECEIVER`, `PARSE_EMPTY`, `NOT_LOGGED_IN`, `PERMISSION`, `UNKNOWN`) and map to concise user-facing hints.  
**When:** Every sync attempt.  
**Why:** Enables self-healing retries and non-noisy UI.

### Pattern 5: Bounded retry + idempotent sync lock (HIGH confidence)
**What:** Prevent concurrent sync storms with in-memory lock + TTL in storage meta. Retry only known transient failures once after injection.  
**When:** Manual sync and alarm sync.  
**Why:** MV3 worker lifecycle and tab messaging errors are common under navigation churn.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Widget owning `tabs.query/sendMessage/executeScript`
**What:** UI layer directly orchestrates privileged APIs (current partial pattern).  
**Why bad:** Tight coupling, duplicate retry logic, hard to test, harder future reuse (popup/sidepanel).  
**Instead:** widget sends command; service worker orchestrates.

### Anti-Pattern 2: Multiple writers to same storage key
**What:** Content script and widget both writing canonical snapshot.  
**Why bad:** stale overwrites and non-deterministic render order.  
**Instead:** single-writer contract.

### Anti-Pattern 3: Selector-fragile parsing without fallback lines
**What:** Relying on narrow DOM selectors only.  
**Why bad:** ChatGPT UI churn breaks extraction silently.  
**Instead:** text-block + header windowing parser (already aligned), plus parserVersion + confidence flags.

### Anti-Pattern 4: Assuming service worker in-memory state persists
**What:** keeping critical snapshot/status only in globals.  
**Why bad:** MV3 idle shutdown drops memory.  
**Instead:** persist to `chrome.storage` and reconstruct on each wake.

## Build Order (Roadmap-Oriented)

1. **Phase A — Orchestration split (must-do first)**
   - Add `background.service_worker` in manifest.
   - Implement runtime command router and move sync/open workflows there.
   - Keep current parser unchanged initially.

2. **Phase B — Storage contract hardening**
   - Introduce explicit schema:
     - `codexUsage.snapshot.v1`
     - `codexUsage.status.v1`
     - `codexUsage.meta.v1`
   - Migrate widget to strict storage-driven render.
   - Add schema/version guards.

3. **Phase C — Extraction robustness**
   - Keep header-block parser, add confidence markers and empty-parse detection.
   - Add transient retry policy for `NO_RECEIVER` + controlled `executeScript` fallback.
   - Add parse diagnostics (non-sensitive) to meta.

4. **Phase D — Auto-refresh + resilience polish**
   - Optional `chrome.alarms` periodic refresh (conservative period, e.g., >=5 min for UX, not 30s floor).
   - Rehydrate alarms on worker startup.
   - Improve user-state hints (login needed/tab missing).

5. **Phase E — Observability + test harness**
   - Add structured debug logs gated by config.
   - Add integration scenarios: tab absent, script missing, parser empty, navigation race.

## Scalability Considerations

| Concern | At 1 widget | At several widgets/pages | At future multi-source usage widgets |
|---|---|---|---|
| Sync contention | simple lock sufficient | service-worker queue per data source | generic task queue + dedupe keys |
| Storage churn | negligible | debounce writes, avoid no-op writes | batched writes + key partitioning |
| UI consistency | direct | storage-driven updates critical | event contracts + schema versioning |
| Parser drift | manual fix acceptable | versioned parser + fallback lines | parser plugin boundary + telemetry |

## Confidence Notes

- **HIGH:** MV3 messaging/service-worker/storage lifecycle constraints and recommended separation (official Chrome docs).  
- **HIGH:** tabs API context limits (`tabs` unavailable in content scripts).  
- **MEDIUM:** exact optimal alarm cadence and retry policy tuning for this specific product (needs real usage telemetry).

## Sources

- Chrome Extensions — Service worker lifecycle (idle shutdown, persistence guidance): https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle  
- Chrome Extensions — Service worker overview: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers  
- Chrome Extensions — Message passing (one-time vs long-lived, async response rules): https://developer.chrome.com/docs/extensions/develop/concepts/messaging  
- Chrome Extensions — Content scripts capabilities/limits: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts  
- Chrome Extensions API — `chrome.storage` (areas, quotas, onChanged, access levels): https://developer.chrome.com/docs/extensions/reference/api/storage  
- Chrome Extensions API — `chrome.scripting` (programmatic injection, dynamic scripts): https://developer.chrome.com/docs/extensions/reference/api/scripting  
- Chrome Extensions API — `chrome.tabs` (availability and permissions): https://developer.chrome.com/docs/extensions/reference/api/tabs  
- Chrome Extensions API — `chrome.alarms` (persistence caveats, minimum interval): https://developer.chrome.com/docs/extensions/reference/api/alarms  
- Repo context (current implementation):
  - `manifest.json`
  - `widgets/codexUsage.js`
  - `content-scripts/codexUsageScraper.js`
