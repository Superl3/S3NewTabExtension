# S3 New Tab Extension — Codex Usage Stability

## What This Is

Chromium 기반 New Tab 대시보드 확장 프로그램에서 ChatGPT Codex 사용량을 안정적으로 표시하는 개선 프로젝트입니다. 현재 목표는 `https://chatgpt.com/codex/settings/usage` 화면 기준으로 GPT-5.3-Codex / GPT-5.3-Codex-Spark의 5시간/주간 한도를 정확히 파싱하고 위젯 UI를 일관되게 렌더링하는 것입니다. 1차 대상 사용자는 이 확장을 개인 업무 대시보드로 사용하는 개발자 자신입니다.

## Core Value

Codex Usage 위젯이 실제 ChatGPT Usage 화면과 일치하는 정보를 항상 안정적으로 보여준다.

## Requirements

### Validated

- ✓ 새 탭 오버라이드 기반 대시보드 렌더링 — existing
- ✓ 위젯 추가/이동/리사이즈 및 설정 편집 흐름 — existing
- ✓ 다수 데이터 소스 위젯(메일/캘린더/RSS/Weather 등) 동작 기반 — existing
- ✓ 전역 모달 닫힘 불변식 고정 (Cancel/Primary/Enter 항상 닫힘, apply 예외 시에도 닫힘) — project-wide lock

### Active

- [ ] Codex Usage에서 GPT-5.3-Codex 5시간/주간 한도를 누락 없이 파싱한다.
- [ ] Codex Usage에서 GPT-5.3-Codex-Spark 5시간/주간 한도를 누락 없이 파싱한다.
- [ ] 각 항목의 퍼센트, 상태(남음), 초기화 시간을 신뢰 가능하게 렌더링한다.
- [ ] 위젯 하단/보조 텍스트는 노이즈 없이 최소 정보만 표시한다.
- [ ] Open/Sync 흐름에서 탭 탐색/메시징 실패를 자동 복구한다.

### Out of Scope

- ChatGPT 내부 API 역공학/비공식 네트워크 호출 연동 — 정책/유지보수 리스크가 큼
- Usage 페이지의 완전한 시각 복제(프로그레스 바/레이아웃 1:1 구현) — 현재 목표는 정확한 데이터 표시

## Context

- 기존 프로젝트는 MV3 기반 확장으로 widget registry + per-widget create lifecycle 패턴을 사용합니다.
- Codex Usage는 공식 공개 API가 아닌 로그인 UI DOM 기반 추출이 필요합니다.
- ChatGPT UI 변경 빈도가 있어 파서는 구조 변화에 견고해야 하고, 실패 시 명확히 degrade 해야 합니다.

## Constraints

- **Security**: 인증 정보는 브라우저 세션 내부에서만 사용, 외부 전송 금지 — 보안/정책 준수
- **Compatibility**: Chrome/Edge Chromium MV3 동작 보장 — 사용자 환경 일관성
- **Maintainability**: 과도한 선택자 의존을 피하고 텍스트 블록 기반 파싱 유지 — UI 변경 내성 확보

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Content script + storage 방식 사용 | iframe/fetch 방식은 권한/CORS로 제한됨 | ✓ Good |
| Codex Usage는 4 슬롯 고정 렌더 | 사용자가 원하는 핵심 지표가 명확함 | — Pending |
| 파서 단순화(헤더-블록 기반) 우선 | 복잡한 heuristic은 누락/오탐을 늘림 | — Pending |
| Global modal close contract is fail-safe and uniform | Prevents repeat regressions where Cancel closes but OK/Enter does not. | ✓ Locked |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-07 — modal close contract locked project-wide.*
