# Project Research Summary

**Project:** S3 New Tab Extension — Codex Usage Stability (MV3)
**Domain:** MV3 browser extension quota/usage widget for authenticated AI web UI pages
**Researched:** 2026-03-31
**Confidence:** HIGH

## Executive Summary

This project is best treated as a reliability-first MV3 extension integration problem, not a UI-first widget project. The research consistently points to a proven pattern: extract usage data only from the authenticated page DOM in a content script, orchestrate all privileged actions (tab lookup, injection, retries, scheduling, storage writes) in a service worker, and render the widget strictly from storage as the system of record. Teams that ship this class of product successfully optimize for parser resilience, deterministic state transitions, and explicit error states—not for visual parity with provider UIs.

The recommended approach is an MVP centered on trustworthy Codex usage visibility: per-model quota rows, remaining allowance/reset time, explicit freshness, and robust Open/Sync recovery flows. Architecturally, this requires a single-writer storage contract, schema-validated DTO/message boundaries, and bounded retry logic around known MV3 transport failures. The immediate roadmap should prioritize orchestration split and storage contract hardening before adding advanced intelligence features.

The main risks are parser drift from provider UI changes, SPA timing/mutation race conditions, and MV3 service-worker lifecycle surprises. Mitigation is clear across sources: text-anchored parsing with parser versioning/confidence, MutationObserver + debounce with data-ready gates, idempotent sync locks persisted in storage/session, and UX states that degrade gracefully (stale last-known-good) instead of showing false zeros or generic failures.

## Key Findings

### Recommended Stack

The stack is strongly convergent on modern MV3 standards with minimal complexity overhead: TypeScript + Vite multi-entry build, Chrome extension APIs (`runtime`, `tabs`, `scripting`, `storage`, optional `alarms`/`webNavigation`), and schema/time helpers (`zod`, `date-fns`). Testing should be split into fixture-driven parser/view-model unit tests and Playwright extension E2E for lifecycle and messaging resilience.

**Core technologies:**
- **Manifest V3 + service worker (Chrome/Edge 120+):** extension runtime model — required for reliable orchestration in current Chromium ecosystem.
- **TypeScript 6.x:** typed parser/message contracts — reduces silent shape drift between content script, worker, and UI.
- **Vite 8.x:** multi-entry extension bundling — cleanly supports service worker/content script/new tab outputs.
- **`chrome.storage.local/session/sync` split:** canonical snapshots + transient lock state + user preferences — aligns data durability with MV3 lifecycle.
- **`zod` 4.x:** boundary validation — enforces DTO and message compatibility.
- **`@playwright/test` + Vitest/jsdom:** E2E + fast unit/contract coverage — catches both parser regressions and runtime integration failures.

**Critical version/usage requirements:**
- Target Chromium MV3 behavior on **Chrome/Edge 120+**.
- Respect MV3 service-worker ephemerality (no critical in-memory-only state).
- Keep `storage.sync` usage to small preferences only; snapshots in `storage.local`.

### Expected Features

MVP value is not feature breadth; it is dependable visibility of real usage limits in an authenticated context.

**Must have (table stakes):**
- Per-model quota rows (used/total/percent) across multiple windows (5h/weekly).
- Remaining allowance + reset time (absolute + human-readable ETA).
- One-click **Open source page** and **Sync now** for user-controlled recovery.
- Visible freshness metadata (`Last synced`).
- Explicit states for no data / not logged in / parse error / stale.
- Privacy-first and minimal-permissions behavior.

**Should have (competitive):**
- Parser confidence signal (high/partial/failed).
- Ground-truth mode from official usage-page text.
- Sync diagnostics panel for supportability.
- Burn-rate forecasting and threshold alerts (after stability baseline).

**Defer (v2+):**
- Cross-provider normalized dashboard (Codex + Claude + Grok).
- Forecasting/alerts at scale before sync correctness is proven.

### Architecture Approach

Use a strict 4-layer design: **content script extractor -> service worker orchestrator -> storage model (canonical) -> widget renderer**. The architectural pivot is moving all orchestration out of widget code into a service-worker command bus so the UI only issues high-level actions and reacts to storage updates.

**Major components:**
1. **Content Script Extractor** — parses authenticated DOM into normalized snapshot DTO with structured error outcomes.
2. **Service Worker Command Layer** — owns `SYNC_NOW`/`OPEN_USAGE_PAGE` flows, retries, injection fallback, status transitions, and canonical storage writes.
3. **Storage Schema (`codexUsage.snapshot/status/meta`)** — single source of truth with versioning, timestamps, parser metadata.
4. **Widget Renderer** — storage-driven presentation (`loading/fresh/stale/error`) with no direct privileged orchestration.

### Critical Pitfalls

1. **Selector-fragile parsing on volatile UI** — avoid deep CSS coupling; parse text-anchored blocks, version parser, retain last-known-good snapshot with staleness badge.
2. **One-shot scraping on SPA pages** — avoid load-once assumptions; use debounced MutationObserver + explicit data-ready criteria.
3. **MV3 message lifecycle mistakes** — enforce async response contract, inject-and-retry once for recoverable `NO_RECEIVER` paths.
4. **Assuming service-worker memory persistence** — persist coordination/locks in storage/session; make sync idempotent and restart-safe.
5. **Auth context confusion (extension fetch vs logged-in DOM)** — keep acquisition DOM-based in user-authenticated tab; expose clear login-required UX.

## Implications for Roadmap

Based on cross-research dependencies and failure modes, use this phase structure:

### Phase 1: Service-Worker Orchestration Split
**Rationale:** This is the architectural dependency root; without it, retry/state/error handling remains fragmented and brittle.
**Delivers:** `service_worker` command router (`CODEX_SYNC_NOW`, `OPEN_USAGE_PAGE`, status updates), tab discovery, injection fallback hook.
**Addresses:** Open/Sync table-stakes flow, explicit recoverability.
**Avoids:** Widget-owned privileged API anti-pattern, message lifecycle failures.

### Phase 2: Canonical Storage Contract + Deterministic Rendering
**Rationale:** Stable UX and race prevention require a single source of truth before parser enhancements.
**Delivers:** Versioned `snapshot/status/meta` schema, monotonic `capturedAt` guard, storage-driven widget states (`loading/fresh/stale/error`).
**Addresses:** Freshness metadata, clear state taxonomy, privacy-local persistence model.
**Avoids:** Multi-writer races, stale-overwrites-fresh, generic failure UX.

### Phase 3: Parser Hardening and Sync Reliability
**Rationale:** Once orchestration and state model are stable, strengthen extraction correctness under real UI churn.
**Delivers:** Text-anchored parser improvements, confidence output, structured error codes, debounced mutation capture, bounded retry policy.
**Addresses:** Per-model rows + remaining/reset correctness and resilience.
**Avoids:** Selector drift breakage, SPA mutation misses, retry storms.

### Phase 4: Resilience Automation and Operational Visibility
**Rationale:** Scheduled refresh and diagnostics are multipliers only after correctness baseline exists.
**Delivers:** Conservative alarm-based refresh + alarm rehydration, diagnostics panel/debug metadata, integration scenarios for common failures.
**Addresses:** Reduced manual sync friction, maintainability.
**Avoids:** Hidden flakiness and opaque support incidents.

### Phase 5: Post-MVP Intelligence (v2)
**Rationale:** Forecasting, alerts, and cross-provider support depend on stable historical data and normalized schema maturity.
**Delivers:** Burn-rate forecast, threshold alerts, optional multi-provider normalization.
**Addresses:** Differentiator feature set.
**Avoids:** Premature complexity before core sync trust is proven.

### Phase Ordering Rationale

- Order follows strict dependency chain: orchestration -> storage contract -> parser resilience -> automation/ops -> advanced features.
- Grouping mirrors architecture boundaries so each phase hardens one layer at a time.
- Early phases directly neutralize top critical pitfalls (message lifecycle, race conditions, parser drift impact).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Parser token strategy (locale/wording drift) and confidence scoring thresholds.
- **Phase 4:** Optimal alarm cadence and retry/backoff tuning under MV3 lifecycle constraints.
- **Phase 5:** Cross-provider schema normalization and alert anti-spam policy design.

Phases with standard patterns (can likely skip extra research-phase):
- **Phase 1:** Service-worker command bus and privileged API centralization are well-documented.
- **Phase 2:** Single-writer storage model and storage-driven rendering are established MV3 patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Strong alignment with official Chrome/Playwright docs and explicit version guidance. |
| Features | MEDIUM | Table-stakes are plausible from sampled market evidence, but competitive breadth is limited. |
| Architecture | HIGH | Recommended boundaries/patterns are directly supported by MV3 API constraints and current repo context. |
| Pitfalls | HIGH | Critical risks map closely to documented MV3 lifecycle/messaging/storage realities plus known DOM volatility patterns. |

**Overall confidence:** HIGH

### Gaps to Address

- **Competitive validation gap:** Broader quota-widget feature benchmarking (beyond sampled listings) before locking post-MVP differentiators.
- **Locale robustness gap:** Validate parser tokenization against multilingual fixtures early in Phase 3.
- **Operational tuning gap:** Determine alarm interval and retry/backoff thresholds from telemetry, not static assumptions.

## Sources

### Primary (HIGH confidence)
- Chrome Extensions docs: messaging, storage, scripting, tabs, webNavigation, content scripts, service-worker concepts.
- Chrome Web Store policy/privacy guidance: minimum permissions and single-purpose constraints.
- Playwright Chrome extension testing docs.
- MDN MutationObserver reference.

### Secondary (MEDIUM confidence)
- Chrome Web Store listings for usage tracker competitors (feature expectations).
- Public OSS tracker README (feature patterns and UX conventions).

### Tertiary (LOW confidence)
- None used for core recommendations.

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
