# Roadmap: S3 New Tab Extension — Codex Usage Stability

## Overview

이 로드맵은 Codex Usage 위젯의 신뢰성을 우선으로, 사용자가 ChatGPT usage 페이지와 일치하는 4개 한도 슬롯을 안정적으로 확인하고(Open/Sync 실패 상황 포함) 스스로 복구 가능한 경험을 만드는 순서로 구성된다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Quota Block Extraction Coverage** - usage 페이지의 4개 한도 블록을 누락 없이 슬롯에 매핑한다.
- [ ] **Phase 2: Data Integrity Rendering** - 퍼센트/초기화/상태 정보를 신뢰 가능한 형식으로 표시한다.
- [ ] **Phase 3: Sync Recovery & Noise-Free UX** - Open/Sync 실패를 자동 복구하고 불필요 텍스트를 제거한다.

## Phase Details

### Phase 1: Quota Block Extraction Coverage
**Goal**: 사용자는 Sync 후 Codex/Spark의 5시간·주간 한도 4개 슬롯을 누락 없이 확인할 수 있다.
**Depends on**: Nothing (first phase)
**Requirements**: EXTR-01, EXTR-02, EXTR-03, EXTR-04
**Success Criteria** (what must be TRUE):
  1. 사용자가 Sync를 실행하면 위젯에 GPT-5.3-Codex 5시간 슬롯이 표시된다.
  2. 사용자가 Sync를 실행하면 위젯에 GPT-5.3-Codex 주간 슬롯이 표시된다.
  3. 사용자가 Sync를 실행하면 위젯에 GPT-5.3-Codex-Spark 5시간/주간 슬롯이 각각 표시된다.
  4. usage 페이지에 4개 블록이 존재할 때 위젯도 4개 슬롯을 빠짐없이 보여준다.
**Plans**: TBD
**UI hint**: yes

### Phase 2: Data Integrity Rendering
**Goal**: 사용자는 각 슬롯의 수치와 초기화 시점을 usage 페이지 표현과 일치하게 신뢰할 수 있다.
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. 각 슬롯 퍼센트가 항상 `숫자%` 형식으로 표시된다.
  2. 각 슬롯 초기화 시간이 usage 페이지 표기(시간만/날짜+시간 포함)를 그대로 반영해 표시된다.
  3. 동일 슬롯 후보가 여러 개일 때 사용자에게는 percent/reset/status 정보가 가장 완전한 항목이 표시된다.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Sync Recovery & Noise-Free UX
**Goal**: 사용자는 Open/Sync 과정에서 실패가 발생해도 자동 복구 경로를 통해 다시 동기화할 수 있고, 위젯은 노이즈 없는 보조 텍스트만 보여준다.
**Depends on**: Phase 2
**Requirements**: SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):
  1. usage 탭이 없는 상태에서 사용자가 Open/Sync를 실행하면 탭이 열리고 재시도 가능 안내를 확인할 수 있다.
  2. content script 수신자 부재 오류가 나도 자동 재주입+1회 재시도 후 동기화 결과를 확인할 수 있다.
  3. 위젯 하단에는 `-`, 빈 placeholder, 불필요 상태문구가 노출되지 않는다.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Quota Block Extraction Coverage | 0/TBD | Not started | - |
| 2. Data Integrity Rendering | 0/TBD | Not started | - |
| 3. Sync Recovery & Noise-Free UX | 0/TBD | Not started | - |
## Active /goal Roadmap

- [x] **Step 1: Strict 30 USD Buyer Gate** - eliminate paid-user refund pressure from first launch, default configuration, setup states, modal/edit basics, degraded browser/API states, and visible polish issues.
- [x] **Step 2: Strict Senior Developer Gate** - after Step 1 passes, improve implementation quality through bounded internal refactors, stronger platform wrappers, normalized error handling, and smoke/unit coverage for product contracts.

**Gate rule:** Step 2 must not start until the current Step 1 iteration has no unresolved paid-buyer P0/P1 findings. After any Step 2 change, return to Step 1 for regression confirmation before considering the iteration complete. Current iteration is complete; future iterations restart at Step 1.

---
