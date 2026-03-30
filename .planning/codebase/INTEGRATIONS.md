# External Integrations

**Analysis Date:** 2026-03-30

## APIs & External Services

**AI / LLM APIs:**
- OpenAI API - AI Chat widget inference requests
  - SDK/Client: Native `fetch` in `widgets/aiChat.js` (default endpoints `https://api.openai.com/v1/chat/completions` and `https://api.openai.com/v1/responses`)
  - Auth: `OPENAI_ACCESS_TOKEN` (connector relay in `connector/server.mjs`) or per-widget `accessToken` in widget config (`widgets/aiChat.js`)

**Project Management APIs:**
- monday.com GraphQL API - Assigned issues and meeting note widgets
  - SDK/Client: Native `fetch` POST to `https://api.monday.com/v2` in `widgets/mondayAssigned.js` and `widgets/mondayMeetingNote.js`
  - Auth: `MONDAY_ACCESS_TOKEN` relay support + OAuth client vars `MONDAY_CLIENT_ID` / `MONDAY_CLIENT_SECRET` in `connector/server.mjs`

**Code Hosting APIs:**
- GitHub REST API - Pull request list widget
  - SDK/Client: Native `fetch` to `https://api.github.com/repos/{owner}/{repo}/pulls` in `widgets/githubPrList.js`
  - Auth: optional widget token field `accessToken` in `widgets/githubPrList.js` (Bearer header)

**Google Services (session-based read + optional OAuth via connector):**
- Gmail Atom feed - Unread mail widget data source
  - SDK/Client: Native `fetch` with `credentials: "include"` to `https://mail.google.com/mail/u/{N}/feed/atom` in `widgets/gmail.js`
  - Auth: Browser Google session cookies; optional connector token relay uses `GOOGLE_ACCESS_TOKEN` in `connector/server.mjs`
- Google Calendar ICS/settings pages - Calendar widget event feed and ICS auto-discovery
  - SDK/Client: Native `fetch` to Google Calendar settings and ICS URLs in `widgets/calendar.js`
  - Auth: Browser Google session cookies for auto-discovery; optional connector OAuth provider settings in `connector/server.mjs` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)

**Content/Data APIs:**
- Open-Meteo Geocoding + Forecast APIs - Weather widget location and forecast
  - SDK/Client: Native `fetch` to `https://geocoding-api.open-meteo.com/v1/search` and `https://api.open-meteo.com/v1/forecast` in `widgets/weather.js`
  - Auth: Not required
- Reddit JSON endpoints - Wallpaper and loop-video background sourcing
  - SDK/Client: Native `fetch` to `https://www.reddit.com/r/{subreddit}/top.json...` in `app.js`
  - Auth: Not required
- Unsplash Source and Picsum - Static image wallpaper URLs
  - SDK/Client: URL generation in `app.js` (`https://source.unsplash.com/...`, `https://picsum.photos/...`)
  - Auth: Not required

**Custom/Enterprise API Hooks:**
- Flex Worktime API mode - External worktime endpoint template support
  - SDK/Client: Native `fetch` GET in `widgets/flexWorktime.js`
  - Auth: Widget-configurable header name/prefix/token (`authHeaderName`, `authTokenPrefix`, `accessToken`)

## Data Storage

**Databases:**
- Not applicable (no server-side DB/ORM detected)
  - Connection: Not applicable
  - Client: Not applicable

**File Storage:**
- Local browser-managed storage only:
  - `chrome.storage.local` for primary app/widget state in `storage.js`, `widgets/aiChat.js`, `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`
  - `localStorage` for widget caches (for example weather cache in `widgets/weather.js`)
  - Cache Storage API for loop-video caching in `app.js`

**Caching:**
- In-browser caches only (`localStorage` and Cache Storage API); no Redis/Memcached/external cache service detected

## Authentication & Identity

**Auth Provider:**
- Mixed model: Browser session auth + OAuth via local connector + manual token entry
  - Implementation: `chrome.identity.launchWebAuthFlow` in widgets (`widgets/aiChat.js`, `widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`) and OAuth broker endpoints in `connector/server.mjs`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry/Datadog/etc. SDK)

**Logs:**
- Connector uses console logging at startup in `connector/server.mjs`
- Frontend primarily surfaces errors in-widget UI state/messages (for example `widgets/rss.js`, `widgets/calendar.js`, `widgets/githubPrList.js`)

## CI/CD & Deployment

**Hosting:**
- Extension is loaded/unpacked directly in a Chromium browser (`README.md` developer-mode install flow)
- Optional local auth service hosted on loopback (`connector/server.mjs` default bind `127.0.0.1`)

**CI Pipeline:**
- None detected (`.github/workflows/` not present)

## Environment Configuration

**Required env vars:**
- Connector network/security: `PORT`, `CONNECTOR_HOST`, `CONNECTOR_BASE_URL`, `ALLOWED_EXTENSION_IDS`, `ALLOW_CHROME_EXTENSION_REDIRECT`, `ALLOW_ANY_HTTPS_REDIRECT`, `ENABLE_TOKEN_RELAY`, `OAUTH_REQUEST_TIMEOUT_MS` (`connector/server.mjs`)
- Monday OAuth/token relay: `MONDAY_ACCESS_TOKEN`, `MONDAY_ACCOUNT_LABEL`, `MONDAY_CLIENT_ID`, `MONDAY_CLIENT_SECRET` (`connector/server.mjs`, `README.md`)
- Google OAuth/token relay: `GOOGLE_ACCESS_TOKEN`, `GOOGLE_ACCOUNT_LABEL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (`connector/server.mjs`)
- OpenAI token relay: `OPENAI_ACCESS_TOKEN`, `OPENAI_ACCOUNT_LABEL` (`connector/server.mjs`, `README.md`)

**Secrets location:**
- Local connector secrets are expected in `connector/.env` (template file `connector/.env.example` is present)
- Runtime-issued access tokens are persisted in `chrome.storage.local` session keys in `widgets/aiChat.js` and Monday widgets (`widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`)

## Webhooks & Callbacks

**Incoming:**
- Local OAuth callback endpoints handled by connector:
  - `GET /api/auth/callback/monday` in `connector/server.mjs`
  - `GET /api/auth/callback/google` in `connector/server.mjs`
- Auth start endpoint used by extension widgets:
  - `GET /api/auth/start` in `connector/server.mjs`

**Outgoing:**
- OAuth authorize/token exchange calls from connector to providers:
  - Monday authorize/token URLs in `connector/server.mjs`
  - Google authorize/token URLs in `connector/server.mjs`
- Widget outbound API/feed calls using `fetch`:
  - OpenAI (`widgets/aiChat.js`), Monday (`widgets/mondayAssigned.js`, `widgets/mondayMeetingNote.js`), GitHub (`widgets/githubPrList.js`), Gmail (`widgets/gmail.js`), Calendar ICS/settings (`widgets/calendar.js`), Weather (`widgets/weather.js`), RSS (`widgets/rss.js`), Reddit/wallpaper/video (`app.js`), Flex API template (`widgets/flexWorktime.js`)

---

*Integration audit: 2026-03-30*
