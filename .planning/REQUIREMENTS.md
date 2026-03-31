# Requirements: S3 New Tab Extension — Codex Usage Stability

**Defined:** 2026-03-30
**Core Value:** Codex Usage 위젯이 실제 ChatGPT Usage 화면과 일치하는 정보를 항상 안정적으로 보여준다.

## v1 Requirements

### Extraction

- [ ] **EXTR-01**: 위젯은 usage 페이지의 `5시간 사용 한도` 블록을 GPT-5.3-Codex 5시간 슬롯으로 파싱할 수 있어야 한다.
- [ ] **EXTR-02**: 위젯은 usage 페이지의 `주간 사용 한도` 블록을 GPT-5.3-Codex 주간 슬롯으로 파싱할 수 있어야 한다.
- [ ] **EXTR-03**: 위젯은 usage 페이지의 `GPT-5.3-Codex-Spark 5시간 사용 한도` 블록을 Spark 5시간 슬롯으로 파싱할 수 있어야 한다.
- [ ] **EXTR-04**: 위젯은 usage 페이지의 `GPT-5.3-Codex-Spark 주간 사용 한도` 블록을 Spark 주간 슬롯으로 파싱할 수 있어야 한다.

### Data Integrity

- [ ] **DATA-01**: 각 슬롯은 퍼센트 값을 숫자+`%` 형태로 표시해야 한다.
- [ ] **DATA-02**: 각 슬롯은 초기화 시간을 usage 페이지의 표현(예: `오후 6:30 초기화`, `2026. 4. 3. 오전 10:55 초기화`)으로 표시해야 한다.
- [ ] **DATA-03**: 하나의 슬롯에 다수 후보가 발견되면, `percent/reset/status` 정보가 더 풍부한 항목을 우선 채택해야 한다.

### Sync and UX

- [ ] **SYNC-01**: Open/Sync 흐름에서 usage 탭 미발견 시 탭을 열고 재시도 가능 상태를 명확히 안내해야 한다.
- [ ] **SYNC-02**: content script 수신자 부재 오류 발생 시 스크립트 재주입 후 1회 재시도해야 한다.
- [ ] **SYNC-03**: 하단 좌측 무의미 텍스트(`-`, 빈 placeholder, 불필요 상태문구)는 표시하지 않아야 한다.

## v2 Requirements

### Diagnostics and Forecast

- **DIAG-01**: 파서 confidence/high-partial-failed 상태를 사용자에게 노출한다.
- **DIAG-02**: 최근 동기화 이력 기반 사용량 소진 예측(ETA)을 제공한다.

## Out of Scope

| Feature | Reason |
|---------|--------|
| ChatGPT 내부 비공개 API 직접 호출 | 정책/유지보수 리스크가 높고 목표 범위를 벗어남 |
| provider UI 1:1 시각 복제 | 데이터 정확성/안정성이 우선이며 유지비용이 큼 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXTR-01 | Phase 1 | Pending |
| EXTR-02 | Phase 1 | Pending |
| EXTR-03 | Phase 1 | Pending |
| EXTR-04 | Phase 1 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| SYNC-01 | Phase 3 | Pending |
| SYNC-02 | Phase 3 | Pending |
| SYNC-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 after initial definition*
