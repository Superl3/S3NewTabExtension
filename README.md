# S3 New Tab Extension

크로미움 기반 브라우저(Chrome, Edge, Brave, Vivaldi 등)에서 새 탭(New Tab)을 커스텀 대시보드로 바꿔주는 MV3 확장 프로그램입니다.

## 주요 기능

- New Tab Override (`chrome_url_overrides.newtab`)
- Edit / Use 모드 전환 (상단 hover 도크)
- 위젯 드래그 이동 + 리사이즈 + 자동 정렬(Arrange)
- 위젯 표시 모드
  - `Window` (타이틀 바 포함)
  - `Headless` (타이틀 바 없음)
  - 공통 투명도(Transparency) 조절
- 선택 위젯 설정 모달 (OK=적용, Cancel/X/오버레이 클릭=취소)
- 우측 설정 패널 탭
  - `Global` (테마/폰트)
  - `Background` (배경)
- 배경 모드
  - Gradient / Solid color / Wallpaper rotation / Loop video
  - Wallpaper 소스: Picsum, Unsplash Source, Wallhaven, Reddit
- 북마크 연동
  - 폴더 경로/ID 지정
  - 재귀 렌더링(하위 폴더 포함)
  - 항목별 표시명/아이콘/링크 오버라이드

## 포함 위젯

- Clock
- Search
- AI Chat
- Bookmarks
- TODO
- Notes
- Label

## 설치 방법 (개발자 모드)

1. 저장소를 클론하거나 소스 폴더를 준비합니다.
2. 브라우저 확장 페이지를 엽니다.
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. `개발자 모드`를 켭니다.
4. `압축해제된 확장 프로그램 로드`를 눌러 이 프로젝트 폴더를 선택합니다.
5. 새 탭을 열어 동작을 확인합니다.

## 업데이트 반영 방법

코드를 수정한 뒤에는 보통 새 탭 새로고침만으로 부족할 수 있습니다.

1. 확장 페이지에서 `새로고침(Reload)`
2. 새 탭을 다시 열거나 `Ctrl+R`

## 사용 가이드

### 1) Edit 모드 진입

- 화면 최상단에 커서를 올리면 편집 도크가 나타납니다.
- `Edit Mode` 버튼으로 편집 모드 전환

### 2) 위젯 배치

- Window 모드: 위젯 헤더를 드래그해서 이동
- Headless 모드: `Move` 아이콘을 드래그 핸들로 사용
- 우하단 핸들로 리사이즈
- `Arrange` 버튼으로 자동 재배치

### 3) 위젯 설정

- Edit 모드에서 위젯의 설정 아이콘 클릭
- 중앙 모달에서 설정 후 `OK`로 적용

### 4) 북마크 위젯

- `Folder path` 또는 `Folder ID` 설정
- 항목 연필 아이콘으로 표시명/아이콘/링크 개별 수정

## 권한/저장

- Manifest: MV3
- Permissions
  - `storage`: 사용자 설정/레이아웃 저장
  - `bookmarks`: 북마크 트리 조회/갱신 반영
- Host permissions: `http://*/*`, `https://*/*`

> 참고: AI Chat 위젯의 엔드포인트/API key를 설정하면 해당 값도 로컬 스토리지에 저장됩니다. 민감 정보 취급에 주의하세요.

## 프로젝트 구조

```
.
├── manifest.json
├── newtab.html
├── styles.css
├── app.js
├── storage.js
├── bookmarks.js
└── widgets/
    ├── index.js
    ├── clock.js
    ├── search.js
    ├── aiChat.js
    ├── bookmarks.js
    ├── todo.js
    ├── notes.js
    └── label.js
```

## 로컬 점검

빌드 도구 없이 동작하는 구조입니다. 문법 확인 예시:

```bash
node --check app.js
node --check widgets/index.js
```

## 아이콘 생성 (512 마스터 -> 다운사이징)

확장 아이콘은 `512x512` 마스터를 먼저 생성하고, 그 이미지를 기준으로 작은 사이즈를 다운사이징해서 만듭니다.

```bash
python tools/generate_icons.py
```

생성 파일:

- `icons/icon-512.png` (master)
- `icons/icon-256.png`
- `icons/icon-128.png`
- `icons/icon-48.png`
- `icons/icon-32.png`
- `icons/icon-16.png`

## 라이선스

필요 시 프로젝트 정책에 맞춰 추가하세요.
