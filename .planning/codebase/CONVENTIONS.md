# Coding Conventions

**Analysis Date:** 2026-03-30

## Naming Patterns

**Files:**
- Use lower camelCase for JavaScript module filenames in root and `widgets/` (examples: `app.js`, `storage.js`, `bookmarks.js`, `widgets/mondayMeetingNote.js`, `widgets/githubPrList.js`).
- Use kebab-case for documentation and CSS filenames (examples: `docs/dock-manual-test-checklist.md`, `docs/dock-accessibility-checklist.md`, `single-item-surfaces.css`, `widget-drag-motion.css`).

**Functions:**
- Use lower camelCase for function names across modules (examples: `normalizeText` in `widgets/search.js`, `resolveBookmarkRoot` in `bookmarks.js`, `buildDockConfig` in `app.js`).
- Use verb-based names for behavior (`renderBoard` in `app.js`, `fetchConnectorToken` in `widgets/aiChat.js`, `parseFeedXml` in `widgets/gmail.js`).
- Use `normalize*` prefixes for input sanitization helpers (`app.js`, `widgets/weather.js`, `widgets/container.js`, `connector/server.mjs`).

**Variables:**
- Use `UPPER_SNAKE_CASE` for module constants (`SNAP` in `app.js`, `TODO_ALARM_TICK_MS` in `widgets/todo.js`, `WEATHER_CACHE_MAX_ENTRIES` in `widgets/weather.js`).
- Use lower camelCase for mutable runtime state (`state`, `saveTimer` in `app.js`, `storedSession` in `widgets/aiChat.js`).

**Types:**
- Prefer runtime JavaScript with occasional JSDoc typedefs instead of TypeScript types.
- When type annotations are needed, use JSDoc inline in implementation files (`/** @typedef {Object} DockConfig */` and `/** @returns {DockConfig} */` in `app.js`).

## Code Style

**Formatting:**
- Tool used: Not detected (no `.prettierrc*`, `prettier.config.*`, or formatter config files in repository root).
- Follow the existing source style shown in `app.js`, `storage.js`, and `widgets/*.js`:
  - 2-space indentation
  - trailing semicolons
  - single quotes avoided in favor of double quotes
  - trailing commas in multiline objects/arrays where already present

**Linting:**
- Tool used: Not detected (no `.eslintrc*`, `eslint.config.*`, or `biome.json`).
- Preserve defensive patterns already used in source files:
  - guard clauses at function start (`widgets/search.js`, `widgets/gmail.js`)
  - explicit numeric bounds via `clamp` and `Number.isFinite` (`app.js`, `widgets/weather.js`, `widgets/gmail.js`)

## Import Organization

**Order:**
1. Standard/Node built-ins first in server-side modules (`http`, `https`, `fs`, `path`, `crypto` in `connector/server.mjs`).
2. Local relative imports next (`./storage.js`, `./widgets/index.js` in `app.js`; `../bookmarks.js` in `widgets/bookmarks.js`).
3. Exports declared after imports (`export const ...`, `export async function ...` in `widgets/*.js`, `storage.js`).

**Path Aliases:**
- Not used. Use explicit relative imports (`./` and `../`) as in `app.js` and `widgets/bookmarks.js`.

## Error Handling

**Patterns:**
- Wrap external I/O and browser API calls in `try/catch` and provide safe fallback behavior:
  - storage fallback to default snapshot in `storage.js`
  - URL/network parsing fallbacks in `widgets/gmail.js`, `widgets/weather.js`, `widgets/aiChat.js`
  - OAuth and connector failures mapped to user-facing messages in `widgets/aiChat.js`, `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`
- Normalize user-visible errors with helper functions (`normalizeErrorMessage` in `widgets/aiChat.js`, `widgets/weather.js`, `widgets/gmail.js`).
- Use explicit `throw new Error(...)` for actionable failures, then catch at UI boundary (`connector/server.mjs`, `widgets/aiChat.js`, `app.js`).

**Modal handlers:**
- Wrap apply callbacks in try/catch at event boundary.
- Never let apply exceptions block modal close.
- Keep cancel/close semantics identical across click and keyboard submit flows.

## Logging

**Framework:** console

**Patterns:**
- Keep logging minimal and warning-focused in client runtime (`console.warn` in `app.js` for recoverable failures like startup-state load/export issues).
- Use startup informational log in connector server only (`console.log` in `connector/server.mjs`).
- Prefer user-facing UI status text/errors over verbose console traces (`widgets/aiChat.js`, `widgets/gmail.js`).

## Comments

**When to Comment:**
- Prefer self-descriptive function names over inline comments.
- Use comments sparingly for intentional no-op catches (`// noop` in `widgets/weather.js`) and special-case behavior.

**JSDoc/TSDoc:**
- Limited use; only annotate selected contracts where needed (`DockConfig` typedef in `app.js`).
- No project-wide TSDoc enforcement detected.

## Function Design

**Size:**
- Keep small normalization/parsing helpers isolated per module (`normalizeText`, `normalize*` in `widgets/search.js`, `widgets/weather.js`, `connector/server.mjs`).
- Allow large orchestrator modules for UI composition (`app.js`) while still splitting into many small pure helper functions.

**Parameters:**
- Pass a dependency object into widget factories (`create({ container, getConfig, patchConfig, ... })` in `widgets/*.js`).
- Prefer optional fallback parameters for sanitizers (`normalizeText(value, fallback = "")`, `normalizeRefreshMinutes(value, fallback = 30)`).

**Return Values:**
- Widget `create(...)` functions return lifecycle objects with at least `refresh`, and often `destroy` (`widgets/clock.js`, `widgets/notes.js`, `widgets/container.js`, `widgets/todo.js`).
- Utility functions return normalized primitives/objects and avoid side effects unless explicitly mutating UI or storage (`storage.js`, `bookmarks.js`).

## Module Design

**Exports:**
- Use named exports only; default exports are not used (`storage.js`, `bookmarks.js`, `widgets/index.js`, `widgets/*.js`).
- Widget modules export a single `{type,title,defaultConfig,settingsSchema,create}` object (`widgets/search.js`, `widgets/clock.js`, `widgets/gmail.js`).

**Barrel Files:**
- Use one barrel file for widget registration in `widgets/index.js`.
- Register each widget by `widget.type` key and derive list via `Object.values(widgetRegistry)` in `widgets/index.js`.

---

*Convention analysis: 2026-03-30*
