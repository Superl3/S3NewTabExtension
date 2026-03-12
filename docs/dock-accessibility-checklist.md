# Dock Accessibility Checklist

## 구조/라벨
- [ ] Dock 컨테이너에 `aria-label`이 있다.
- [ ] Dock item 버튼 각각에 고유한 `aria-label`이 있다.
- [ ] 페이지 상태 텍스트는 `aria-live="polite"`로 갱신된다.

## 키보드
- [ ] Tab으로 Dock item과 Dock 액션 버튼에 도달 가능하다.
- [ ] Arrow/Home/End 키로 Dock item 간 이동이 가능하다.
- [ ] Enter/Space로 아이템 활성 동작이 실행된다.

## 터치/포인터
- [ ] Dock item/액션 버튼 터치 타겟이 최소 44x44px이다.
- [ ] 포커스 상태가 시각적으로 구분된다.

## 시각 대비/테마
- [ ] 밝은 배경/어두운 배경에서 텍스트와 아이콘 대비가 유지된다.
- [ ] blur/shadow가 있어도 포커스 링/indicator 가독성이 유지된다.

## 컨텐츠 가림 방지
- [ ] `Always visible` 모드에서는 Dock 높이만큼 하단 padding이 적용되어 컨텐츠가 Dock에 가려지지 않는다.
- [ ] `Hover` 모드에서는 하단 padding이 0으로 유지되어 보드 사이즈 변화가 없다.
- [ ] 화면 크기 변경 시 Dock 높이 토큰이 다시 계산되어 필요한 padding이 갱신된다.
