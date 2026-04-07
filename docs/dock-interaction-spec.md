# Dock Interaction Spec

## 상태
- `activeId: string`
  - Dock 렌더의 단일 활성 상태 소스다.
  - 활성 항목 스타일과 탭 포커스 기준으로 사용한다.

## 드래그/드롭 규칙
- 위젯 드래그 종료 시 포인터가 Dock hit-area 안이면 해당 위젯은 보드가 아니라 Dock에 배치한다.
- Dock 배치 시 `dockOrder`를 할당/정규화한다.
- Dock 배치된 위젯은 보드 자동 정렬/페이지 확장 계산에서 제외한다.

## 클릭/탭 규칙
- Dock item 클릭:
  - `activeId`를 해당 item id로 갱신한다.
  - Edit 모드에서는 위젯 설정 오픈 동작을 유지한다.
  - Use 모드에서는 연결된 page로 이동한다.

## 키보드 규칙
- Dock item 영역은 좌/우 화살표 이동(로빙 tabindex)을 지원한다.
- `Home`은 첫 항목, `End`는 마지막 항목으로 이동한다.
- `Enter`/`Space`는 활성 동작을 실행한다.

## overflow 규칙
- Dock item strip은 가로 overflow를 허용한다.
- overflow 시작/끝 상태를 data attribute로 반영해 시각적 fade 힌트를 제공한다.
- 마우스 휠 세로 입력은 가로 스크롤로 변환한다.

## Global Invariant Conformance
- Dock drag/drop must conform to global DropPlan precedence (`DELETE_ZONE > SPACE.CONTAINER > SPACE.BOARD > NONE`).
- Dock silhouette/hover interpretation and final commit must use the same resolver as board/folder flows.
- Dock-related page transitions (click/keyboard/wheel when applicable) must follow the shared launcher page normalization rules.
- Dock delete outcomes must preserve deterministic cleanup and state normalization contracts.
