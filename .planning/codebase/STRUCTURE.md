# Codebase Structure

**Analysis Date:** 2026-03-30

## Directory Layout

```text
S3NewTabExtension/
├── manifest.json                 # MV3 extension manifest and permissions
├── newtab.html                   # New-tab DOM shell and module bootstrap
├── app.js                        # Main application runtime (state, rendering, events)
├── storage.js                    # chrome.storage persistence adapter
├── bookmarks.js                  # Shared bookmark tree/path resolver utilities
├── styles.css                    # Main styling for board/widgets/settings/modals
├── single-item-surfaces.css      # Surface style overrides
├── widget-drag-motion.css        # Drag/overlay animation styles
├── config/
│   └── startup-state.json        # Default startup snapshot source
├── widgets/
│   ├── index.js                  # Widget registry/list composition
│   ├── clock.js                  # Clock widget module
│   ├── search.js                 # Search widget module
│   ├── bookmarks.js              # Bookmarks widget module
│   ├── notes.js                  # Notes widget module
│   ├── todo.js                   # TODO widget module
│   ├── shortcut.js               # Shortcut widget module
│   ├── label.js                  # Label widget module
│   ├── gmail.js                  # Gmail widget module
│   ├── calendar.js               # Calendar widget module
│   ├── rss.js                    # RSS widget module
│   ├── weather.js                # Weather widget module
│   ├── aiChat.js                 # AI chat widget module
│   ├── githubPrList.js           # GitHub PR list widget module
│   ├── mondayAssigned.js         # Monday assigned issues widget
│   ├── mondayMeetingNote.js      # Monday meeting note widget
│   ├── flexWorktime.js           # Flex worktime widget
│   └── container.js              # Widget folder/container widget
├── connector/
│   ├── server.mjs                # Optional local OAuth/token relay server
│   └── .env.example              # Example env var names for connector
├── docs/                         # Product/interaction specs and checklists
├── icons/                        # Extension icon assets
├── fonts/                        # Bundled font assets
├── scripts/                      # Utility snippets/docs for manual workflows
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
- `app.js`: Global state, render pipeline, board/dock/container/page interactions, settings UI, save/undo/history.
- `storage.js`: State load/save adapter for `chrome.storage.local`.
- `widgets/index.js`: Registry and ordered widget list.
- `bookmarks.js`: Bookmark-root resolution utility.

**Testing:**
- Not detected: no dedicated test directory (`test/`, `tests/`, `__tests__/`) and no `*.test.*` / `*.spec.*` files found in project tree.

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

**`.tmp/`:**
- Purpose: Session and external-context scratch artifacts.
- Generated: Yes.
- Committed: Yes (present in repository tree).

**`.ruff_cache/`:**
- Purpose: Tool cache artifacts.
- Generated: Yes.
- Committed: Yes (present in repository tree).

**`icons/` and `fonts/`:**
- Purpose: Static assets loaded by extension UI.
- Generated: No.
- Committed: Yes.

---

*Structure analysis: 2026-03-30*
