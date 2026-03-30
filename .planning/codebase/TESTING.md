# Testing Patterns

**Analysis Date:** 2026-03-30

## Test Framework

**Runner:**
- Not detected (no `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or `cypress.config.*` in repository root).
- Config: Not applicable

**Assertion Library:**
- Not detected

**Run Commands:**
```bash
node --check app.js                  # Syntax-check main runtime entry
node --check widgets/index.js        # Syntax-check widget registry module
node --check widgets/calendar.js     # Syntax-check individual widget module
```

## Test File Organization

**Location:**
- No automated test directories or co-located test files detected.
- Validation guidance is documented in `README.md` and manual QA checklists under `docs/`.

**Naming:**
- Automated test naming pattern: Not detected (`*.test.*` / `*.spec.*` not present).
- Manual checklist naming pattern uses kebab-case docs (examples: `docs/dock-manual-test-checklist.md`, `docs/dock-accessibility-checklist.md`).

**Structure:**
```
docs/
  dock-manual-test-checklist.md
  dock-accessibility-checklist.md
  dock-interaction-spec.md
```

## Test Structure

**Suite Organization:**
```markdown
# Dock Manual Test Checklist

## 1) 스크롤 고정
- [ ] 페이지 스크롤/컨텐츠 이동 중에도 Dock은 하단 고정 위치를 유지한다.

## 4) 키보드
- [ ] Tab으로 Dock item과 Dock 액션 버튼에 순차 접근 가능하다.
- [ ] ArrowLeft/ArrowRight, Home/End 이동이 동작한다.
```

**Patterns:**
- Setup pattern: run extension in Chromium with developer mode and reload extension before verification (`README.md`).
- Teardown pattern: manual reset/reload workflow via extension reload and tab refresh (`README.md`).
- Assertion pattern: checkbox-driven expected behaviors in `docs/dock-manual-test-checklist.md` and `docs/dock-accessibility-checklist.md`.

## Mocking

**Framework:** Not used

**Patterns:**
```typescript
// Not applicable: no automated test harness or mocking utilities detected.
```

**What to Mock:**
- Not applicable in current repository state.

**What NOT to Mock:**
- Not applicable in current repository state.

## Fixtures and Factories

**Test Data:**
```typescript
// No dedicated test fixture/factory modules detected.
// Runtime sample state exists at config/startup-state.json for manual initialization checks.
```

**Location:**
- Runtime baseline snapshot: `config/startup-state.json`
- Export/sanitization snippet used for manual state verification: `scripts/export-current-state-snippet.md`

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
# Not available: no coverage tooling configured.
```

## Test Types

**Unit Tests:**
- Not used (no unit test files or runner configuration detected).

**Integration Tests:**
- Manual integration checks documented for Dock behavior and accessibility in `docs/dock-manual-test-checklist.md` and `docs/dock-accessibility-checklist.md`.

**E2E Tests:**
- Framework: Not used
- Current E2E verification is manual through browser interaction checklists and behavior specs (`docs/dock-interaction-spec.md`).

## Common Patterns

**Async Testing:**
```typescript
// Current pattern is manual runtime validation of async flows:
// - OAuth/connect flows in widgets/aiChat.js
// - API fetch + fallback flows in widgets/weather.js and widgets/gmail.js
// Verified through extension UI behavior, not automated assertions.
```

**Error Testing:**
```typescript
// Current pattern is manual negative-path verification:
// - Invalid/missing auth and connector states handled in widgets/aiChat.js
// - Feed/auth parse failures handled in widgets/gmail.js
// - Storage fallback behavior in storage.js
```

---

*Testing analysis: 2026-03-30*
