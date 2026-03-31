# Feature Landscape

**Domain:** Usage/quota dashboard widget for authenticated AI web UIs (Codex Usage focus)
**Researched:** 2026-03-31

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-model quota rows (used / total / %) | Competitor trackers consistently show model-segmented counters (GPT-5, thinking/pro variants, etc.). | Med | Must support multiple windows (e.g., 3h, 5h, weekly) in one widget. |
| Remaining allowance + reset time | Users care most about “Can I keep using this model now?” and “When does it reset?” | Med | Show both absolute remaining and human-readable reset ETA. |
| One-click **Open source page** + **Sync now** | Authenticated pages are stateful; users expect manual recovery when session/login/rendering blocks scrape. | Low | Matches current project direction (`Open`/`Sync`). |
| Freshness metadata (`Last synced`) | Scraped data can go stale; users need visibility into recency. | Low | Should be visible without expanding details. |
| Clear empty/error/auth-required states | In this domain, failures are normal (logged out, DOM changed, tab closed). | Med | Distinguish “not logged in” vs “parse failed” vs “no data yet.” |
| Privacy-first behavior (local processing, no credential export) | Chrome Web Store policy and user trust expectations for extensions reading authenticated pages. | Med | Publicly declare local-only handling where possible. |
| Minimal permission footprint | Users reject over-privileged quota widgets; policy guidance favors narrow scope. | Med | Prefer specific host permissions + optional grants over broad access. |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| DOM-drift resilience with parser confidence signal | Reduces silent breakage when provider UI text/layout changes. | High | Show confidence badge (High/Partial/Failed) per sync. |
| Ground-truth mode from official usage page text (vs inferred request counting) | More trustworthy than request-count-only trackers when provider logic changes. | High | Key differentiator for Codex Usage widget. |
| Quota burn-rate forecast | Helps planning (“you’ll hit limit in ~N minutes/hours at current pace”). | Med | Needs short history window and smoothing. |
| Cross-provider normalized view (Codex/Claude/Grok) | Single dashboard for multiple AI quotas; strong daily-driver value. | High | Defer for post-MVP; schema must normalize different limit windows. |
| Threshold alerts (e.g., 80/90/100%) with quiet hours | Prevents hard stops during work sessions. | Med | Must avoid notification spam. |
| Sync diagnostics panel | Fast self-serve debugging (which field failed, source timestamp, parse path). | Med | Valuable for maintenance-heavy DOM scraping workflows. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| “Limit remover” / quota bypass behavior | Policy risk and trust damage; violates ecosystem norms and likely store enforcement. | Keep widget observational only (read + display). |
| Hidden background scraping of unrelated pages/data | Breaks single-purpose/privacy expectations and increases permissions risk. | Restrict collection strictly to declared usage pages and user-invoked sync paths. |
| Heavy visual clone of provider usage UI | High churn cost with little value; project scope targets data accuracy over mimicry. | Use compact native widget UI emphasizing accuracy + status clarity. |
| Mandatory always-on polling at high frequency | Wasteful, fragile, may hit throttling and produce stale/duplicate noise. | Hybrid model: manual sync + conservative scheduled refresh + explicit freshness label. |
| Cloud account/linking for basic quota display | Adds auth/security burden not needed for core utility. | Keep MVP local-first; revisit optional cloud later only if justified. |

## Feature Dependencies

```text
Open source page + authenticated session detection -> Reliable Sync
Reliable Sync -> Freshness + Error states
Reliable Sync + parser normalization -> Per-model quota rows
Per-model quota rows -> Remaining/Reset UX
Stable historical snapshots -> Burn-rate forecast + Alerts
```

## MVP Recommendation

Prioritize:
1. Per-model quota rows (used/total/percent) for Codex + Codex-Spark windows
2. Remaining + reset time with explicit `Last synced`
3. Open/Sync flow with robust auth/error/degraded states

Defer:
- Cross-provider normalized quota board: valuable but introduces schema + parser surface area too early.
- Forecasting/alerts: useful after sync correctness is proven stable.

## Sources

- Chrome Web Store listing: **Chatterclock — a ChatGPT message tracking extension** (model-segmented counters, quota-window framing, usage expectation) — https://chromewebstore.google.com/detail/chatterclock-%E2%80%94-a-chatgpt/mepflplnjbngmgakdefimlgbfpmhonoj *(MEDIUM confidence: official listing content)*
- Chrome Web Store listing: **ChatGPT Usage Limit Tracker** (quota display, plan switcher, privacy disclosure pattern) — https://chromewebstore.google.com/detail/chatgpt-usage-limit-track/pbgiljgknpehngkimlhaemngkgglnden *(MEDIUM confidence: official listing content)*
- GitHub README: **andyli0123/chatgpt-usage-limit-tracker** (common feature set: plan switcher/progress bars/local storage/update cadence) — https://github.com/andyli0123/chatgpt-usage-limit-tracker *(MEDIUM confidence: project-maintainer source)*
- Chrome Extensions docs: **Content scripts** (authenticated page DOM extraction mechanics, injection scope) — https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts *(HIGH confidence: official docs)*
- Chrome Extensions docs: **Message passing** (content script <-> extension sync architecture, error handling) — https://developer.chrome.com/docs/extensions/develop/concepts/messaging *(HIGH confidence: official docs; updated 2025-12-03)*
- Chrome Extensions docs: **chrome.storage** (local/sync/session tradeoffs and quotas) — https://developer.chrome.com/docs/extensions/reference/api/storage *(HIGH confidence: official docs; updated 2025-12-19)*
- Chrome docs: **Protect user privacy** + CWS **Program Policies** (minimum permissions, user-data handling, single-purpose constraints) — https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy, https://developer.chrome.com/docs/webstore/program-policies/policies *(HIGH confidence: official policy docs)*

### Confidence notes

- **HIGH:** extension architecture/security/policy constraints (official Chrome docs).
- **MEDIUM:** market feature expectations (Chrome Web Store listings + one public OSS tracker).
- **LOW / gap:** I could not reliably obtain a broad ranked dataset of all quota widgets across stores; competitive breadth beyond sampled listings should be re-validated during requirements freeze.
