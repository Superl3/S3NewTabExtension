# Codebase Structure

**Analysis Date:** 2026-08-14 (re-measured against working tree)

## Scale Snapshot

| Area | Measure |
|---|---|
| Total JS/MJS/CSS/HTML | ~73,310 lines |
| `app.js` | 5,120 lines, 92 imports, 23 module globals |
| `core/` | 130 files, 15,788 lines, largest 513 lines |
| `widgets/` | 22 widget modules + 25 `widgets/shared/` helpers |
| `styles.css` | 5,556 lines (+2 auxiliary stylesheets) |
| `tests/` | 138 files, 794 passing cases |
| npm dependencies | 0 (no build toolchain) |

## Directory Layout

```text
S3NewTabExtension/
├── manifest.json                 # MV3 manifest; no `background` key (no service worker)
├── newtab.html                   # New-tab DOM shell and module bootstrap
├── app.js                        # Runtime orchestration hub (state, wiring, injection)
├── storage.js                    # chrome.storage.local -> localStorage -> defaults fallback
├── bookmarks.js                  # Bookmark tree resolver with TTL cache + invalidation
├── styles.css                    # Main styling for board/widgets/settings/modals
├── single-item-surfaces.css      # Surface style overrides
├── widget-drag-motion.css        # Drag/overlay animation styles
├── config/
│   └── startup-state.json        # Composable defaults/presets/overrides (no inline instances)
├── core/                         # 130 pure/injectable modules; see subdirectories below
│   ├── alarm/                    # Tick scheduler + notification dispatcher
│   ├── background/               # VISUAL wallpaper subsystem (NOT MV3 background)
│   ├── modal/                    # Dock settings + widget title rename runtimes
│   ├── platform/                 # chrome.* API seams (tabs, scripting, callbacks)
│   ├── settings/                 # Settings panel runtime
│   ├── state/                    # State merge policy
│   ├── utils/                    # array/error/function/geometry/grid/json/number/object/padding/text
│   └── widget/                   # Widget app-runtime composition
├── widgets/
│   ├── index.js                  # Registry with dynamic import loaders + viewport-lazy mount
│   ├── metadata.js               # Declarative defaultConfig/settingsSchema per widget type
│   ├── clock.js  search.js  notes.js  todo.js  label.js  shortcut.js
│   ├── bookmarks.js  gmail.js  calendar.js  rss.js  weather.js  aiChat.js
│   ├── githubPrList.js           # GitHub PR list widget module
│   ├── githubReviewInbox.js      # GitHub review inbox widget (swipe-to-ignore, tabs, read state)
│   ├── mondayAssigned.js  mondayMeetingNote.js
│   ├── flexWorktime.js  flexWorktimeTimeline.js  codexUsage.js
│   ├── container.js              # Widget folder/container widget
│   └── shared/                   # 25 helpers: auth, feeds, flex, github, monday, caches, dates
├── content-scripts/
│   └── codexUsageScraper.js      # Text-anchored parser for the ChatGPT usage page
├── connector/
│   ├── server.mjs                # Optional local OAuth/token relay server
│   ├── redirect-policy.mjs       # Strict redirect allowlist logic
│   └── .env.example              # Example env var names for connector
├── tests/                        # 138 `*.test.mjs` files run by node:test
├── scripts/
│   ├── validate-production-readiness.mjs  # Release hygiene gate
│   └── smoke-extension-cdp.mjs            # Unpacked-extension CDP smoke
├── docs/                         # Product/interaction specs and checklists
├── icons/                        # Extension icon assets
├── fonts/                        # Bundled font assets
└── .planning/codebase/           # Generated architecture/quality/stack mapping docs
```

## Directory Purposes

**`widgets/`:**
- Purpose: Feature modules plugged into runtime widget system.
- Contains: One file per widget definition; each file exports `*Widget` object with `create(...)` and schema/defaults.
- Key files: `widgets/index.js`, `widgets/container.js`, `widgets/mondayAssigned.js`, `widgets/flexWorktime.js`.

**`config/`:**
- Purpose: Startup defaults consumed when no persisted state is available.
- Contains: JSON snapshot data.
- Key files: `config/startup-state.json`.

**`connector/`:**
- Purpose: Standalone local Node process for OAuth/token relay used by selected widgets.
- Contains: HTTP server module and env example file.
- Key files: `connector/server.mjs`, `connector/.env.example`.

**`docs/`:**
- Purpose: Human-readable design and manual QA references.
- Contains: Dock and interaction spec/checklist markdowns.
- Key files: `docs/dock-spec.md`, `docs/dock-interaction-spec.md`.

**Project root runtime files:**
- Purpose: Core extension runtime.
- Contains: `manifest.json`, `newtab.html`, `app.js`, `storage.js`, shared helpers and global CSS.
- Key files: `app.js`, `newtab.html`, `storage.js`, `bookmarks.js`.

## Key File Locations

**Entry Points:**
- `manifest.json`: Declares MV3 extension and routes new tab to `newtab.html`.
- `newtab.html`: Declares app shell and loads `app.js` as module.
- `app.js`: Executes `init()` and bootstraps all runtime behavior.
- `connector/server.mjs`: Starts optional local connector HTTP service.

**Configuration:**
- `manifest.json`: Permissions and host permissions.
- `config/startup-state.json`: Default hydrated state snapshot.
- `connector/.env.example`: Connector variable names and expected settings (example only).

**Core Logic:**
- `app.js`: Global state, render pipeline, board/dock/container/page interactions, settings UI, save/undo/history. Increasingly an injection hub over `core/` rather than a logic holder.
- `core/`: 130 pure/injectable modules holding the extracted logic; most have a 1:1 `tests/<name>.test.mjs` counterpart.
- `storage.js`: State load/save adapter with `chrome.storage.local` -> `localStorage` -> cloned-defaults fallback.
- `widgets/index.js`: Registry, dynamic import loaders, and viewport-proximity lazy mounting.
- `bookmarks.js`: Bookmark-root resolution with a 1,200ms TTL cache and event-driven invalidation.

**Testing:**
- Location: `tests/*.test.mjs`, run by the Node built-in `node:test` runner via `npm test`.
- Current scale: 138 test files, 794 passing cases, ~1.4s total runtime.
- Gates: `npm test` (unit/contract), `npm run test:production` (release hygiene, guards that all 138 test files stay present), `npm run smoke:extension` (unpacked-extension CDP smoke).
- Known gaps: `app.js` itself is only touched indirectly by one test file, `widgets/githubPrList.js` has no test file, and there is no visual regression coverage for `styles.css`.

## Naming Conventions

**Files:**
- Use lowercase or camelCase JavaScript filenames for runtime modules: `app.js`, `storage.js`, `widgets/mondayMeetingNote.js`.
- Use kebab-case for stylesheet and doc assets: `single-item-surfaces.css`, `widget-drag-motion.css`, `dock-interaction-spec.md`.
- Use lowercase JSON for configuration and manifest files: `manifest.json`, `config/startup-state.json`.

**Directories:**
- Use lowercase plural or category names: `widgets/`, `docs/`, `icons/`, `fonts/`, `scripts/`, `config/`, `connector/`.

## Where to Add New Code

**New Feature:**
- Primary code: Add runtime orchestration in `app.js` only when feature is cross-widget/global.
- Widget-scoped code: Add a new module in `widgets/<featureName>.js` and register it in `widgets/index.js`.
- Tests: Not applicable in-repo (no established automated test location).

**New Component/Module:**
- Widget implementation: `widgets/<name>.js` exporting `<name>Widget` with `type`, `defaultConfig`, `settingsSchema`, `create(...)`.
- Shared domain helper for multiple widgets: add root-level helper module alongside `bookmarks.js` and import explicitly from widget files.

**Utilities:**
- Shared helpers for extension runtime: place in root module files referenced by `app.js` (pattern used by `storage.js` and `bookmarks.js`).
- Connector-only utilities: keep inside `connector/server.mjs` (or split into `connector/*.mjs` if extraction is needed) to avoid leaking Node dependencies into extension runtime.

## Special Directories

**`.planning/codebase/`:**
- Purpose: Generated architecture/quality/stack/concern mapping documents for planning/execution agents.
- Generated: Yes.
- Committed: Yes.

**`icons/` and `fonts/`:**
- Purpose: Static assets loaded by extension UI.
- Generated: No.
- Committed: Yes.

> Removed 2026-08-14: previous revisions listed `.tmp/` and `.ruff_cache/` as committed directories. Neither exists in the working tree.

---

*Structure analysis: 2026-08-14 (re-measured: added core/tests/content-scripts layout, scale snapshot, corrected stale "no tests detected" and phantom cache directories)*
