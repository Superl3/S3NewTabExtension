<!-- GSD:project-start source:PROJECT.md -->
## Project

**S3 New Tab Extension — Codex Usage Stability**

Chromium 기반 New Tab 대시보드 확장 프로그램에서 ChatGPT Codex 사용량을 안정적으로 표시하는 개선 프로젝트입니다. 현재 목표는 `https://chatgpt.com/codex/settings/usage` 화면 기준으로 GPT-5.3-Codex / GPT-5.3-Codex-Spark의 5시간/주간 한도를 정확히 파싱하고 위젯 UI를 일관되게 렌더링하는 것입니다. 1차 대상 사용자는 이 확장을 개인 업무 대시보드로 사용하는 개발자 자신입니다.

**Core Value:** Codex Usage 위젯이 실제 ChatGPT Usage 화면과 일치하는 정보를 항상 안정적으로 보여준다.

### Constraints

- **Security**: 인증 정보는 브라우저 세션 내부에서만 사용, 외부 전송 금지 — 보안/정책 준수
- **Compatibility**: Chrome/Edge Chromium MV3 동작 보장 — 사용자 환경 일관성
- **Maintainability**: 과도한 선택자 의존을 피하고 텍스트 블록 기반 파싱 유지 — UI 변경 내성 확보
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
- On mismatch, return structured errors (`NO_MATCH`, `PARTIAL_MATCH`, `UNPARSEABLE_TIME`) instead of throwing raw exceptions.
### 2) Storage pattern
- `storage.local`:
- `storage.session`:
- `storage.sync`:
- Persist `capturedAt`, `ttlMs`, and `parserVersion` with each snapshot to make stale/compatibility checks explicit.
### 3) Message flow pattern
### 4) Rendering pattern (widget reliability)
- Render from a **single view model** derived from cached snapshot.
- Show explicit states: `loading`, `fresh`, `stale`, `error`.
- Keep previous good snapshot on parse failures (soft-degrade), plus "Last updated" timestamp.
- Avoid noisy footer text; show only actionable metadata (remaining %, reset time, last sync).
### 5) Testing stack pattern
- **Unit (Vitest + jsdom):**
- **Contract tests:**
- **E2E (Playwright):**
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Parser validation | Zod | Custom ad-hoc checks | Too easy to drift; no contract-level guarantees across contexts. |
| Scheduling | `chrome.alarms` + event-driven sync | `setInterval` in service worker | SW lifecycle makes interval-based reliability weaker. |
| Storage | `chrome.storage.local/session/sync` split by purpose | IndexedDB-first | Added complexity without clear benefit for this snapshot-scale workload. |
| Messaging | `sendMessage` request/response (+ optional Port for streams) | Long-lived Port for everything | Unnecessary complexity for mostly discrete sync requests. |
| E2E tooling | Playwright | Puppeteer | Both work; Playwright’s fixtures/projects ergonomics are stronger for multi-scenario CI. |
## Installation
# Core runtime deps
# Dev dependencies
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

## Project Critical Rule: Modal Close Invariants

- Applies globally to every modal flow in this repository.
- Cancel/Close actions must always dismiss the modal.
- Primary actions (OK/Add/Apply/Save) and Enter-submit paths must also always dismiss the modal.
- Even when apply logic throws, returns false, or partially fails, modal dismissal must still occur.
- Do not weaken this contract without explicit user approval and matching updates in AGENTS.md + .planning/PROJECT.md.

## Project Critical Rule: Interaction Invariants

- This rule applies to page navigation, widget deletion, container/folder drag-drop, and cross-surface drag behavior (board/dock/folder/launcher) in both Edit and Use modes.
- Drop intent precedence is fixed globally: `DELETE_ZONE > SPACE.CONTAINER > SPACE.BOARD > NONE`.
- Drag feedback and final commit must use the same resolver so visible intent equals committed result.
- Delete commits must be deterministic and followed by valid state normalization (active page bounds, ordering, focus target).
- Page transitions from click/wheel/keyboard/drag must share one clamping/materialization contract.
- Do not weaken this contract without explicit user approval and matching updates in AGENTS.md + .planning/PROJECT.md.
