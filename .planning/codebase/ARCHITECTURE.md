# Architecture

**Analysis Date:** 2026-08-14 (re-measured against working tree)

## Pattern Overview

**Overall:** Build-free client-side modular architecture (MV3 new-tab extension) with registry-driven plugin widgets, an extracted pure-logic core, and a separate optional local auth connector service.

**Key Characteristics:**
- `app.js` (5,120 lines) owns global state and acts as the dependency-injection hub: it holds runtime closures and passes them into `core/` modules through large option objects such as `wireAppEvents({ ...60+ callbacks })`.
- Pure logic lives in `core/` (130 modules, 15,788 lines, largest file 513 lines). Modules receive DOM and `chrome.*` access by injection, which is what makes them testable under plain `node:test`.
- Feature modules (widgets) implement a shared contract (`type`, `defaultConfig`, `settingsSchema`, `create`) and are composed through `widgets/index.js` using **dynamic import loaders** plus viewport-proximity lazy mounting (240px margin).
- Extension-facing APIs are increasingly routed through seams: `core/platform/*` (`browser-api`, `chrome-api`, `chrome-callback`, `chrome-scripting`, `chrome-tabs`) and `widgets/shared/chromeApi.js`. `widgets/codexUsage.js` is the remaining widget with direct `chrome.*` calls (13 sites, all guarded).
- No build toolchain and zero npm dependencies. `newtab.html` loads `app.js` as a native ES module.

**Notable structural gap:** `manifest.json` declares no `background` service worker. All scheduling and cross-tab orchestration lives in the New Tab document, so it stops when the last new tab closes. `core/background/` refers to the *visual wallpaper* subsystem, not MV3 background.

## Layers

**Extension Shell Layer:**
- Purpose: Define extension identity, permissions, and new-tab entry mapping.
- Location: `manifest.json`
- Contains: MV3 metadata, permissions, host permissions, `chrome_url_overrides.newtab`.
- Depends on: Chromium extension runtime.
- Used by: Browser extension loader.

**Document/Composition Layer:**
- Purpose: Declare the static DOM surface and mount point for runtime UI.
- Location: `newtab.html`
- Contains: Board/persistent dock/settings/modal DOM skeleton and `<script type="module" src="app.js">` bootstrap.
- Depends on: CSS assets (`styles.css`, `single-item-surfaces.css`, `widget-drag-motion.css`) and `app.js`.
- Used by: `app.js` initialization and all runtime rendering.

**Application Runtime Layer:**
- Purpose: Central state machine, widget lifecycle orchestration, layout engine, settings rendering, modal flow, drag/drop, paging, undo/redo, and persistence.
- Location: `app.js` (state ownership + wiring) delegating to `core/`
- Contains: `hydrate(...)`, `renderBoard()`, `renderSettings()`, `wireEvents()`, `queueSave(...)`, startup-state resolution and sanitization.
- Depends on: `storage.js`, `widgets/index.js`, `core/*`, DOM from `newtab.html`, Chrome extension APIs.
- Used by: Entire new-tab user experience.

**Extracted Core Logic Layer:**
- Purpose: Hold decision logic as pure, injectable modules so behavior contracts can be tested without a browser.
- Location: `core/` (130 modules) with subpackages `alarm/`, `background/` (visual wallpaper), `modal/`, `platform/`, `settings/`, `state/`, `utils/`, `widget/`.
- Contains: Drag/drop intent resolution (`drag-drop-evaluation.js`, `drag-drop-orchestration.js`), launcher paging (`launcher-pages.js`), dock geometry/state, container placement, grid layout, history snapshots, modal runtimes, event wiring (`wire-events-*.js`), export sanitization.
- Depends on: Injected callbacks and data only; no direct DOM or `chrome.*` assumptions in most modules.
- Used by: `app.js` wiring and widget runtimes; mirrored 1:1 by `tests/*.test.mjs`.

**Persistence Layer:**
- Purpose: Read/write durable state and merge defaults safely.
- Location: `storage.js`
- Contains: `loadState(defaultState)`, `saveState(state)`, deep-merge helpers, `STORAGE_KEY`.
- Depends on: `chrome.storage.local`.
- Used by: `app.js` startup and save pipeline.

**Widget Definition Layer (Plugin Modules):**
- Purpose: Provide feature-specific UI and behavior behind a common contract.
- Location: `widgets/*.js` and registry in `widgets/index.js`
- Contains: Per-widget defaults, settings schema, `create(...)` controller factory; optional `refresh()` / `destroy()` lifecycle methods.
- Depends on: Runtime callbacks injected by `app.js` and browser APIs as needed.
- Used by: `createWidgetCard(...)` and widget runtime map in `app.js`.

**Shared Domain Adapter Layer (Bookmarks):**
- Purpose: Encapsulate bookmark tree traversal and folder resolution logic for widget use.
- Location: `bookmarks.js`
- Contains: `resolveBookmarkRoot(config)` and bookmark-path/ID resolution helpers.
- Depends on: `chrome.bookmarks`.
- Used by: `widgets/bookmarks.js`.

**Optional Local Connector Service Layer:**
- Purpose: OAuth start/callback mediation and token relay for widgets needing external auth.
- Location: `connector/server.mjs`
- Contains: HTTP routes (`/api/auth/start`, `/api/auth/callback/*`, `/healthz`), redirect URI allowlist logic, provider definitions, state TTL map.
- Depends on: Node built-ins (`http`, `https`, `fs`, `crypto`, `url`, `path`) and `.env`-style env vars.
- Used by: Widget auth flows in `widgets/aiChat.js`, `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js` via configured connector URL.

## Data Flow

**Startup and Hydration Flow:**

1. Browser opens overridden new tab (`manifest.json` → `newtab.html`), then module script loads `app.js`.
2. `init()` in `app.js` resolves startup source (`getStartupStateFromLocation()` or persisted storage via `loadState(...)` from `storage.js`).
3. `hydrate(...)` normalizes UI/theme/background/widget instances using registry defaults from `widgets/index.js` and produces runtime `state`.
4. Runtime wiring executes (`wireStorageSync()`, `wireEvents()`), then `renderBoard()` and settings/theme/background application complete first paint.

**State Mutation and Persistence Flow:**

1. User action handlers in `app.js` mutate `state` (add/remove/move widget, edit config, change theme/background, dock/container operations).
2. `recordHistorySnapshot(...)` captures undo/redo checkpoints for user-mutating operations.
3. `queueSave(...)` debounces persistence and calls `buildPersistSnapshot()` (which strips runtime-only fields).
4. `saveState(...)` in `storage.js` writes to `chrome.storage.local`; `wireStorageSync()` listens on `chrome.storage.onChanged` to sync external/session updates.

**Widget Lifecycle Flow:**

1. Registry lookup in `widgetRegistry` (`widgets/index.js`) selects definition by `instance.type`.
2. `createWidgetCard(...)` in `app.js` creates card shell, then calls `def.create({...runtime hooks...})` from each widget module.
3. Returned controller object is stored in `runtime` map (`app.js`) and refreshed via `refreshAllWidgets()` or targeted refresh logic.
4. `renderBoard()` and teardown paths call `controller.destroy?.()` before re-creation.

**Auth/External Access Flow (Connector-backed widgets):**

1. Widget triggers connect action (`widgets/aiChat.js`, `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`).
2. Widget launches web auth (`chrome.identity.launchWebAuthFlow`) against connector start endpoint.
3. `connector/server.mjs` validates redirect URI and provider, then performs OAuth redirect/callback exchange.
4. Connector returns token via hash/query to extension redirect URI; widget stores session in `chrome.storage.local` and uses it in API calls.

**State Management:**
- Use a single in-memory mutable `state` object in `app.js` as the source of truth.
- Use normalized snapshots (`hydrate(...)`, `buildPersistSnapshot()`) for consistency between runtime and persisted state.
- Use `runtime` map in `app.js` as ephemeral UI/controller state; do not persist runtime map contents.

## Key Abstractions

**Widget Definition Contract:**
- Purpose: Standardize feature module integration with runtime renderer/settings.
- Examples: `widgets/clock.js`, `widgets/search.js`, `widgets/bookmarks.js`, `widgets/container.js`, `widgets/mondayAssigned.js`.
- Pattern: Export object with `type`, `title`, `defaultConfig`, optional `defaultLayout/defaultGridSize`, `settingsSchema`, and `create({...})` returning controller methods.

**Widget Registry:**
- Purpose: Central type-to-definition mapping used for rendering and add-widget UI.
- Examples: `widgets/index.js` (`widgetRegistry`, `widgetList`, `widgetLoaders`), `widgets/metadata.js`.
- Pattern: Declarative metadata in `widgets/metadata.js` merged with per-type **dynamic import loaders**, so widget code is fetched on demand rather than statically bundled into first paint. Off-screen widgets defer creation until near the viewport, and render a `widget-lazy-status` placeholder until then.

**Runtime Controller Map:**
- Purpose: Track rendered card DOM + widget controller per instance ID.
- Examples: `app.js` (`const runtime = new Map();`, `runtime.set(instance.id, { card, controller })`).
- Pattern: Ephemeral runtime cache enabling refresh/destroy without rehydrating persisted state.

**Snapshot/Persistence Abstraction:**
- Purpose: Separate user state from transient runtime fields and avoid stale writes.
- Examples: `app.js` (`buildSessionSnapshot()`, `buildPersistSnapshot()`, fingerprint + mutation clock), `core/persistence-runtime.js` (150ms debounce), `core/runtimeSnapshotPolicy.js`, `storage.js`.
- Pattern: Snapshot normalization + debounced write + external-change reconciliation. `JSON.stringify` fingerprints plus a user-mutation clock reject stale writes, and `chrome.storage.onChanged` merges changes made by other open new tabs.

**Export Sanitization Abstraction:**
- Purpose: Keep credentials and volatile runtime values out of manually exported state/profiles.
- Examples: `core/state-export-sanitize.js` driven by `SENSITIVE_EXPORT_KEYWORD_PARTS`, `VOLATILE_BACKGROUND_KEYWORD_PARTS`, and `VOLATILE_PROFILE_KEYWORD_PARTS` in `app.js`.
- Pattern: Keyword-substring key matching plus URL query-parameter redaction, replacing matches with `[REDACTED]`.

**Platform Seam Abstraction:**
- Purpose: Allow the dashboard to run without extension APIs (local/demo execution, tests).
- Examples: `core/platform/browser-api.js`, `core/platform/chrome-*.js`, `widgets/shared/chromeApi.js`, and the `chrome.storage.local` -> `localStorage` -> cloned-defaults fallback chain in `storage.js`.
- Pattern: Capability probing before use, with graceful degradation to actionable user copy instead of thrown errors.

**Container/Dock/Page Placement Abstractions:**
- Purpose: Encode widget placement across board grid, dock strip, container folder, and launcher pages.
- Examples: `app.js` (`isWidgetDocked(...)`, `isWidgetInContainer(...)`, paging helpers), `widgets/container.js` (container drop target management).
- Pattern: Placement-aware rendering and drag/drop path-specific projection logic.

## Entry Points

**Extension Entry:**
- Location: `manifest.json`
- Triggers: Browser new-tab open.
- Responsibilities: Route new tab to `newtab.html`; grant required permissions for storage/bookmarks/identity/tabs/scripting.

**UI Runtime Entry:**
- Location: `newtab.html` line with `<script type="module" src="app.js">`
- Triggers: New-tab document load.
- Responsibilities: Boot `app.js` module in extension page context.

**Application Bootstrap:**
- Location: `app.js` (`async function init()` and `void init();`)
- Triggers: Module evaluation completion.
- Responsibilities: Load/hydrate state, apply theme/background, wire events/storage sync, render board.

**Connector Service Entry (Optional):**
- Location: `connector/server.mjs` (`http.createServer(...)` + `server.listen(...)`)
- Triggers: Node process start (`node connector/server.mjs`).
- Responsibilities: Serve health/start/callback routes for OAuth/token relay.

## Error Handling

**Strategy:** Defensive fallback and graceful degradation with local `try/catch`, runtime normalization, and non-fatal warning logs.

**Patterns:**
- Default-fallback-on-error for storage and parsing (for example `storage.js` `loadState(...)` returns cloned defaults when read fails).
- Widget/API failures are normalized to user-facing status/error text, while runtime stays active (for example in `widgets/aiChat.js`, `widgets/mondayAssigned.js`, `widgets/flexWorktime.js`).
- Optional lifecycle hooks (`refresh?.()`, `destroy?.()`) are invoked safely from runtime loops in `app.js`.

## Cross-Cutting Concerns

**Logging:** `console.warn(...)` for non-blocking failures in runtime and connector (`app.js`, `connector/server.mjs`).

**Validation:** Normalize-and-clamp strategy across app and widgets (for example `hydrate(...)` in `app.js`, URL sanitization in `widgets/bookmarks.js`, connector URL normalization in `widgets/aiChat.js`).

**Authentication:** OAuth/token session handling via `chrome.identity` + `chrome.storage.local` in widget modules; optional local mediation through `connector/server.mjs`. Monday widgets share `widgets/shared/mondayAuth.js`; AI Chat still has its own connector stack; GitHub widgets use a plain `config.accessToken` field with no session lifecycle.

**Scheduling:** No `chrome.alarms` and no service worker. Periodic widget refresh uses per-widget `setTimeout` chains, and TODO alarms use a 30s tick in `core/alarm/alarm-runtime.js`. All scheduling is bound to New Tab document lifetime.

---

*Architecture analysis: 2026-08-14 (re-measured: added core logic layer, dynamic-import registry, platform/export seams, scheduling gap)*
