# Dock Spec

## 목표
- Dock은 하단(bottom) 고정 레이어다.
- Dock은 스크롤/보드 컨텐츠와 시각적으로 분리되어야 한다.
- Dock은 `DockItem` / `DockConfig` 모델과 `activeId` 상태로 렌더링한다.

## 데이터 모델

### DockItem
- `id: string` - Dock 항목 식별자
- `label: string` - 접근성/툴팁용 라벨
- `iconText: string` - 1~2 글자 아이콘 텍스트
- `badge: number | null` - 배지 값 (없으면 `null`)
- `page: number` - 항목의 연결 페이지

### DockConfig
- `enabled: boolean` - Dock 표시 여부
- `shape: "raised" | "flat"` - Dock 형태
- `visibility: "always" | "hover"` - 표시 모드
- `lengthUnits: number` - Dock 길이 유닛
- `heightPx: number` - Dock 터치 타겟 높이(최소 44px)
- `position: "bottom"` - 위치는 하단 고정

## 레이아웃/시각 규칙
- Dock은 항상 하단 중앙 고정이다.
- Dock은 `position: fixed`로 렌더링하고 콘텐츠와 z-index 레이어를 분리한다.
- Dock 높이 토큰(`--persistent-dock-height`)을 계산해 콘텐츠 하단 패딩(`--persistent-dock-content-padding`)에 반영한다.
- 터치 타겟 최소 크기는 44x44px이다.

## 구현 스텝 완료조건

### Step1 - 고정 바 + active 전환
- Dock이 하단 고정으로 렌더링된다.
- `activeId` 기반으로 활성 아이템 스타일이 바뀐다.

### Step2 - 아이콘 / 배지 / indicator
- `DockItem` 기반 아이콘이 보인다.
- 필요 시 배지가 표시된다.
- 활성 indicator가 노출된다.

### Step3 - 블러 / 그림자 / 라운드
- Dock 컨테이너에 blur/shadow/radius 스타일이 적용된다.
- shape(`raised`/`flat`) 차이가 유지된다.

### Step4 - overflow
- Dock 아이템이 길이를 초과하면 overflow 스크롤이 가능하다.
- overflow 시작/끝 시각 상태가 노출된다.
