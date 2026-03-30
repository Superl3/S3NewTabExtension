# Technology Stack

**Analysis Date:** 2026-03-30

## Languages

**Primary:**
- JavaScript (ES modules, modern browser JS) - Main extension logic in `app.js`, `storage.js`, `bookmarks.js`, and `widgets/*.js`

**Secondary:**
- HTML5 - Extension new tab document in `newtab.html`
- CSS3 - UI styling in `styles.css`, `single-item-surfaces.css`, and `widget-drag-motion.css`
- Node.js ESM JavaScript - Local auth connector server in `connector/server.mjs`
- JSON - Extension manifest and startup state in `manifest.json` and `config/startup-state.json`

## Runtime

**Environment:**
- Chromium Extension Runtime (Manifest V3) for frontend/widget execution, permissions, and extension APIs via `manifest.json`
- Node.js runtime for local connector (`node connector/server.mjs`) documented in `README.md` and implemented in `connector/server.mjs`

**Package Manager:**
- Not detected (no `package.json`, `pnpm-lock.yaml`, `yarn.lock`, or `package-lock.json`)
- Lockfile: missing

## Frameworks

**Core:**
- Chrome Extension MV3 platform - Extension shell, permissions, identity flow, storage, and tab/script access in `manifest.json`
- Vanilla JavaScript widget framework (custom, in-repo) - Widget registry and lifecycle in `widgets/index.js` and per-widget modules in `widgets/*.js`

**Testing:**
- Not detected (no Jest/Vitest/Mocha config files)

**Build/Dev:**
- No build pipeline detected; source files are loaded directly by `newtab.html` (`<script type="module" src="app.js">`)
- Node CLI syntax checks are documented in `README.md` (`node --check ...`)

## Key Dependencies

**Critical:**
- Built-in Web Platform APIs (Fetch, DOMParser, localStorage, Cache Storage) used directly in `app.js`, `widgets/rss.js`, `widgets/gmail.js`, `widgets/calendar.js`, `widgets/weather.js`
- Chrome Extension APIs (`chrome.storage`, `chrome.identity`, `chrome.tabs`, `chrome.scripting`, `chrome.bookmarks`) used across `app.js`, `storage.js`, `bookmarks.js`, and widget modules

**Infrastructure:**
- Node built-in modules only (`http`, `https`, `fs`, `path`, `crypto`, `url`) in `connector/server.mjs`
- No third-party npm SDK/ORM/framework dependency detected in repository source

## Configuration

**Environment:**
- Extension configuration is persisted in `chrome.storage.local` via `storage.js` and widget-specific auth/session keys in files such as `widgets/aiChat.js` and `widgets/mondayAssigned.js`
- Local connector runtime configuration is environment-variable driven in `connector/server.mjs` (loaded from `connector/.env` if present; template file `connector/.env.example` exists)
- Startup/default dashboard configuration is file-based in `config/startup-state.json` and can be overridden with query params parsed in `app.js`

**Build:**
- No bundler/transpiler config detected
- Runtime/extension config files: `manifest.json`, `newtab.html`, `config/startup-state.json`

## Platform Requirements

**Development:**
- Chromium-based browser with extension developer mode enabled (`README.md` installation section)
- Node.js available for running local auth connector (`connector/server.mjs`)

**Production:**
- Browser extension execution target (Chrome/Edge/Brave/Vivaldi class browsers) using MV3 manifest in `manifest.json`
- Optional loopback connector process on `127.0.0.1` for OAuth/token relay integrations in `connector/server.mjs`

---

*Stack analysis: 2026-03-30*
