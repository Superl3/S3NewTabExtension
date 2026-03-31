# Technology Stack

**Project:** S3 New Tab Extension — Codex Usage Stability (MV3)
**Researched:** 2026-03-31

## Recommended Stack

### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Chrome Extension Manifest V3 + Extension Service Worker | MV3 (target Chrome/Edge Chromium 120+) | Runtime model for background orchestration | This is the standard 2025+ extension model. Chrome docs explicitly center MV3 service-worker lifecycle, messaging, storage, scripting APIs. |
| TypeScript | 6.0.x | Type-safe parser + message contracts | Prevents silent shape drift in parser outputs and message payloads; pairs well with schema validation. |
| Vite | 8.0.x | Build pipeline for multi-entry extension bundles | Fast builds + clean multi-entry setup (service worker, content script, new tab page) and first-class Vitest integration. |

### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `chrome.storage.local` | MV3 API | Durable cache of parsed usage snapshots | Officially recommended for larger extension data; persists across browser restarts and service worker restarts. |
| `chrome.storage.session` | MV3 API | In-memory coordination (locks, in-flight sync state) | Survives service worker suspension while avoiding disk persistence for transient state. |
| `chrome.storage.sync` | MV3 API | User preferences only (display mode, refresh policy) | Small quota but good for settings portability; avoid putting parser snapshots here. |

### Infrastructure
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `chrome.scripting` | MV3 API | Deterministic content script injection / registration | Official injection control point in MV3; better than ad-hoc tab script assumptions. |
| `chrome.alarms` | MV3 API | Scheduled re-sync triggers | Reliable periodic scheduling for service-worker-based extensions (with restart checks). |
| `chrome.runtime` + `chrome.tabs` messaging | MV3 API | Typed request/response between widget, SW, and content script | Standard MV3 communication path; Promise-based APIs are stable and documented. |
| `chrome.webNavigation` (filtered to target URL) | MV3 API | Detect usage-page navigation completion before extraction | Gives explicit navigation lifecycle events; reduces race conditions versus blind retries. |

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.x | Validate extracted payloads and message envelopes | Always at parser boundaries and inter-context message boundaries. |
| `date-fns` | 4.1.x | Parse/format reset times and durations | Use for reset-time normalization and display formatting; avoid hand-rolled date parsing. |
| `webextension-polyfill` | 0.12.x | Promise-first browser API wrapper for Chrome/Edge compatibility ergonomics | Use if you want one consistent async API surface across Chromium variants. |
| `@types/chrome` | 0.1.x | Strong typing for Chrome extension APIs | Always in TS projects using `chrome.*` APIs directly. |
| `vitest` + `jsdom` | 4.1.x / 29.0.x | Unit tests for parser + widget rendering logic | Use for fast fixture-driven parser and UI tests outside real browser. |
| `@playwright/test` | 1.58.x | End-to-end extension tests (persistent Chromium context) | Use for real extension loading, messaging, and rendering flows. |

## Prescriptive 2025 Pattern (for this project)

### 1) Parsing pattern (resilient DOM extraction)
- Use **content script extraction** (not unofficial ChatGPT APIs).
- Run extraction at `document_idle`, then attach a **debounced `MutationObserver`** for late-rendered sections.
- Parse by **text-anchored blocks** (model name + nearby quota/reset text), not brittle deep CSS selectors.
- Emit a **normalized DTO** (e.g. `CodexUsageSnapshotV1`) validated by Zod:
  - `model`
  - `limitWindow` (`5h`, `weekly`)
  - `used`, `remaining`, `percent`
  - `resetAt` (ISO)
  - `capturedAt` (ISO)
  - `parserVersion`
  - `sourceFingerprint` (lightweight structure hash)
- On mismatch, return structured errors (`NO_MATCH`, `PARTIAL_MATCH`, `UNPARSEABLE_TIME`) instead of throwing raw exceptions.

### 2) Storage pattern
- `storage.local`:
  - `codexUsage.latest`
  - `codexUsage.history` (short rolling window)
  - `codexUsage.lastError`
- `storage.session`:
  - `codexUsage.syncLock`
  - `codexUsage.inFlightRequestId`
- `storage.sync`:
  - `codexUsage.preferences` only.
- Persist `capturedAt`, `ttlMs`, and `parserVersion` with each snapshot to make stale/compatibility checks explicit.

### 3) Message flow pattern
1. Widget UI requests refresh (`runtime.sendMessage`: `USAGE_SYNC_REQUEST`).
2. Service worker acquires `syncLock` (session), locates/opens target tab, waits for navigation readiness.
3. Service worker triggers extraction (`tabs.sendMessage` or scripted execution).
4. Content script returns validated DTO or structured error.
5. Service worker writes `storage.local` atomically and releases lock.
6. Widget rerenders from storage snapshot (`storage.onChanged` + initial read).

**Rule:** widget never parses DOM directly; all extraction is centralized in content script + service worker orchestration.

### 4) Rendering pattern (widget reliability)
- Render from a **single view model** derived from cached snapshot.
- Show explicit states: `loading`, `fresh`, `stale`, `error`.
- Keep previous good snapshot on parse failures (soft-degrade), plus "Last updated" timestamp.
- Avoid noisy footer text; show only actionable metadata (remaining %, reset time, last sync).

### 5) Testing stack pattern
- **Unit (Vitest + jsdom):**
  - Parser fixtures from saved HTML snapshots (multiple UI variants).
  - Time parsing edge cases (timezone, locale wording).
  - View-model mapping and rendering state transitions.
- **Contract tests:**
  - Zod schema compatibility between content script and service worker messages.
  - Snapshot version migration tests (`V1 -> V2` if shape changes).
- **E2E (Playwright):**
  - Load unpacked extension in persistent Chromium context.
  - Validate service worker startup, messaging path, storage writes, and widget display.
  - Add a service-worker termination resilience test (wake + recover path).

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Parser validation | Zod | Custom ad-hoc checks | Too easy to drift; no contract-level guarantees across contexts. |
| Scheduling | `chrome.alarms` + event-driven sync | `setInterval` in service worker | SW lifecycle makes interval-based reliability weaker. |
| Storage | `chrome.storage.local/session/sync` split by purpose | IndexedDB-first | Added complexity without clear benefit for this snapshot-scale workload. |
| Messaging | `sendMessage` request/response (+ optional Port for streams) | Long-lived Port for everything | Unnecessary complexity for mostly discrete sync requests. |
| E2E tooling | Playwright | Puppeteer | Both work; Playwright’s fixtures/projects ergonomics are stronger for multi-scenario CI. |

## Installation

```bash
# Core runtime deps
npm install zod date-fns webextension-polyfill

# Dev dependencies
npm install -D typescript vite vitest jsdom @playwright/test @types/chrome @types/node
```

## Sources

- Chrome Extensions: Message passing (updated 2025-12-03) — https://developer.chrome.com/docs/extensions/develop/concepts/messaging (HIGH)
- Chrome Extensions: Storage API (updated 2025-12-19) — https://developer.chrome.com/docs/extensions/reference/api/storage (HIGH)
- Chrome Extensions: Scripting API (updated 2026-01-07) — https://developer.chrome.com/docs/extensions/reference/api/scripting (HIGH)
- Chrome Extensions: Alarms API (updated 2026-01-07) — https://developer.chrome.com/docs/extensions/reference/api/alarms (HIGH)
- Chrome Extensions: Tabs API — https://developer.chrome.com/docs/extensions/reference/api/tabs (HIGH)
- Chrome Extensions: WebNavigation API (updated 2025-08-11) — https://developer.chrome.com/docs/extensions/reference/api/webNavigation (HIGH)
- Chrome Extensions: Service worker lifecycle — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle (MEDIUM; page older but still canonical)
- Chrome Extensions: Unit testing / E2E testing guides — https://developer.chrome.com/docs/extensions/how-to/test/unit-testing , https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing (MEDIUM; guidance older but valid)
- Playwright Chrome extensions guide — https://playwright.dev/docs/chrome-extensions (HIGH)
- MDN MutationObserver (last modified 2025-06-10) — https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver (HIGH)
- Zod docs (Zod 4 stable) — https://zod.dev/ (MEDIUM)
- npm package registry versions checked 2026-03-31 — https://www.npmjs.com/ (HIGH for version numbers)
