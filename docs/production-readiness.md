# Production Readiness

This repository is release-candidate quality for internal use when both automated gates pass:

```bash
npm test
npm run test:production
npm run smoke:extension
```

Public production release requires the manual smoke checks below from a clean browser profile after loading the repository root as an unpacked Chromium extension.

## Current Automated Gates

- `npm test` runs the full `node:test` suite in `tests/*.test.mjs`.
- `npm run test:production` checks release hygiene: Manifest V3 shape, explicit host permissions, CI coverage, LF working-tree policy, production-readiness docs, and stale planning-doc phrases.
- `npm run smoke:extension` loads a packaged copy as an unpacked Chromium extension through Chrome DevTools Protocol and verifies New Tab first launch, Add Widget, settings OK, reload persistence, all four packaged font weights, and an overlapping storage write from two extension tabs.
- CI runs unit and production checks on `main`, `fix`, `feat/**`, `chore/**`, and pull requests, followed by a separate headless Chrome for Testing smoke job with Node.js 22.
- `tests/extension-package.test.mjs` builds the same package used by smoke, checks local CSS assets, and verifies that development directories and the connector environment are excluded.

## Real Extension Smoke

Run this before claiming production-ready status:

- Run `npm run smoke:extension` locally with Chrome or Edge installed. Pass `-- --browser <path>` if auto-detection is not enough.
- Pass `-- --headless --browser <path>` to run without opening a visible window. Node.js 22 or newer is required for the smoke client's built-in WebSocket support. Use Chrome for Testing if a regular Chrome installation does not allow command-line extension loading.
- Load the extension unpacked in Chrome and Edge from a clean profile.
- Open a new tab and verify the configured startup dashboard renders without visible `Widget failed to load`, raw exception text, or console error/warn output tied to user-visible failures.
- Toggle Edit Mode, open Add Widget, add the default Clock widget, confirm widget settings with OK, reload, and verify the new widget persists.
- Open widget settings for at least Clock, Search, Weather, TODO, Notes, Bookmarks Collection, and one account-backed widget. Verify Cancel, OK, Enter, Escape, and overlay close follow the modal close contract.
- Verify drag, resize, delete-zone, dock, folder/container, and page navigation basics in both Use and Edit modes.

## Account-backed widgets

Run live checks only with test accounts or intentionally scoped tokens:

- GitHub PRs and GitHub Review Inbox: repository URL, login matching, token/no-token degraded states, refresh, open actions, ignored/read state persistence.
- Monday Assigned Issues and Monday Meeting Note: connector auth, direct token fallback, invalid board/column copy, reconnect/disconnect.
- AI Chat: connector URL or access token setup, missing setup copy, send failure copy, session persistence.
- Codex Usage: Open and Sync from an already logged-in ChatGPT tab, fresh snapshot timestamp, stale snapshot guard.
- Flex Worktime and Flex Worktime History: logged-in tab reuse, login/degraded copy, manual refresh, date mode.

## Release Checklist

- `git status --short --branch` and `jj status` show only intentional release changes before commit.
- `manifest.json` uses explicit host permissions only; no `<all_urls>`, `http://*/*`, or `https://*/*`.
- Credentials and local paths are absent from exported state, logs, docs, and package artifacts.
- Package from a clean tree and exclude VCS metadata, `.planning`, `.tmp`, `.worktrees`, and local connector `.env` files.
- Update `.planning/IMPROVEMENT_GOALS.md` with smoke evidence when a release candidate is promoted.

## Profile Sharing and Storage Conflicts

- Profile exports redact configured calendar ICS URLs in both widgets and presets. Private Google Calendar feed links and URL userinfo are also redacted when embedded in text. Imported profiles require calendar setup again; live settings are not changed by exporting.
- Writes to the dashboard storage key use an exclusive Web Lock across extension tabs, covering both the stored revision check and the write. If a newer revision is already saved, it is retained. If different user snapshots share a positive revision, the first saved snapshot is retained and the other tab receives a conflict message. Separate widget edits are not merged field by field.
- Background/cache writes may update the current revision but cannot overwrite a newer revision. Storage read errors block writes; failed mutations remain retryable.
- In a real extension context, unavailable Web Locks cause a save error instead of an unprotected write. The in-memory queue is only a fallback for local previews and unit tests.
