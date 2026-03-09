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
  - `Profile` (프리셋/기본 프로필)
- 배경 모드
  - Gradient / Solid color / Wallpaper rotation / Loop video
  - Wallpaper 소스: Picsum, Unsplash Source, Reddit
  - Loop video는 수동 URL 또는 Reddit loop 영상(무료 서브레딧)을 쓰며, 가져온 클립을 로컬에 캐시한 뒤 재생합니다.
- 북마크 연동
  - 폴더 경로/ID 지정
  - 재귀 렌더링(하위 폴더 포함)
  - 항목별 표시명/아이콘/링크 오버라이드

## 포함 위젯

- Clock
- Search
- AI Chat
- Bookmarks
- Shortcut
- TODO
- Notes
- Label
- Gmail
- Calendar
- RSS Feed
- Monday Assigned Issues
- Monday Meeting Note
- Weather
- Widget Folder (Container)

## AI Chat 위젯

- 위젯 설정에서 `Auth connector URL`에 인증 백엔드 시작 엔드포인트를 입력하세요.
- `Connect` 버튼(채팅 기록 위 도구 모음)을 누르면 `chrome.identity.launchWebAuthFlow`로 OAuth가 시작되고, 리다이렉트에서 `access_token`과 선택적으로 `account`/`email`/`user`를 받아옵니다.
- 연결된 액세스 토큰이 자동으로 API 요청에 쓰입니다. `Disconnect` 버튼으로 세션을 지울 수 있고, 연결되지 않으면 채팅 전송 시 안내 메시지가 표시됩니다.

## RSS Feed 위젯

- Feed URL을 입력하면 최신 항목 목록을 표시합니다.
- RSS(2.0)와 Atom 포맷을 지원합니다.

## Weather 위젯

- Open-Meteo API를 사용해 현재 날씨와 온도를 표시합니다.
- `Use current location`이 켜져 있으면 브라우저 위치를 우선 사용하고, 실패하면 설정된 좌표를 사용합니다.

## Widget Folder (Container) 위젯

- 기본 크기는 `1x1`이며, 위젯 카드를 클릭하면 확장/축소됩니다.
- 확장 크기는 `Expanded columns`, `Expanded rows`로 설정하며, 현재 위젯 위치를 기준으로 펼쳐집니다.
- 위젯 추가는 **드래그해서 열린 컨테이너 영역에 드롭** 방식만 지원합니다.
- 위젯 꺼내기는 **컨테이너 내부 위젯을 바깥으로 드래그 드롭** 방식만 지원합니다.

## Gmail 위젯

- 브라우저에 로그인된 Gmail 세션의 Atom feed(읽기 전용)를 사용합니다.
- 안 읽은 메일 목록을 보여주며, 항목 클릭 시 해당 Gmail 메일로 바로 이동합니다.
- `Account index (u/N)`으로 여러 Gmail 로그인 계정 중 표시 대상을 선택할 수 있습니다.

## Calendar 위젯

- Google Calendar의 비공개 ICS URL(읽기 전용)로 일정을 불러옵니다.
- 월간 달력과 다가오는 일정 목록을 함께 표시하며, 뷰를 `Monthly` / `Weekly`로 전환할 수 있습니다.
- 편집 기능 없이 조회만 지원하고, 일정 항목 클릭 시 이벤트 링크(없으면 캘린더 홈)로 이동합니다.

## Monday Assigned Issues 위젯

- 위젯 설정의 `Auth connector URL`은 기본값 `http://localhost:8787/api/auth/start`가 자동 적용됩니다.
- 위젯 설정의 `Access token (optional)`에 토큰을 넣으면 Connect 시 해당 토큰을 바로 사용합니다.
- `Board ID`만 입력해도 바로 연결을 시작할 수 있습니다.
- 위젯의 `Connect` 버튼을 눌러 Monday OAuth 인증을 진행합니다.
- `People column ID`는 선택값이며, 비워두면 보드의 첫 번째 People 계열 컬럼을 자동으로 사용합니다.
- `Board ID`는 Monday 보드 URL의 숫자 ID에서 확인할 수 있습니다. 예: `/boards/123456789`
- Auth connector 콜백은 확장 프로그램 redirect URL로 `access_token`(선택: `account`/`email`)을 반환해야 합니다.
- OAuth 결과 토큰은 브라우저 로컬 스토리지에 저장되므로 민감 정보로 관리하세요.

## Monday Meeting Note 위젯

- 특정 보드의 최신 아이템 1개와 해당 아이템의 `Meeting note column ID`에 해당하는 노트 텍스트 1개를 표시합니다.
- 기본 그리드 크기는 `1x2`입니다.
- 위젯 설정의 컬럼 입력은 `Meeting note column ID` 또는 컬럼명(예: `미팅 노트`) 둘 다 사용할 수 있습니다.
- 데이터 갱신은 캐시 우선이며, 자동 갱신은 평일 `09:00`, `13:00` 슬롯 또는 수동 Refresh에서만 실행됩니다.
- Monday Assigned Issues 위젯과 동일한 로컬 스토리지 세션 키를 사용하므로 페이지 내에서 Monday 인증을 공유합니다.

## Design Memory

- Monday 위젯 UI 스타일 메모: `DESIGN_MEMORY.md`

## Gmail / Calendar 최소 조회 설정 (선택)

Gmail/Calendar 위젯은 OAuth 없이 조회 전용으로 동작합니다.

1. Gmail: 브라우저에서 Gmail 로그인 후 위젯의 `Account index (u/N)`를 계정 탭 번호와 맞춥니다.
2. Gmail: 목록 항목을 클릭하면 해당 메일로 바로 이동합니다.
3. Calendar: `Calendar ICS URL`을 비워두고 `Refresh`를 누르면, 로그인된 Google Calendar 세션에서 ICS를 자동 탐지합니다.
4. Calendar 자동 설정이 실패하면 `Open Google Calendar`를 눌러 설정 페이지를 연 뒤 다시 `Refresh`를 누르거나, `Secret address in iCal format`을 직접 붙여 넣습니다.

> 참고: ICS URL은 비밀키처럼 취급해야 하며, URL이 유출되면 일정 정보가 노출될 수 있습니다.

## Local Auth Connector (Recommended)

1. Copy `connector/.env.example` to `connector/.env` and set at least one token or OAuth client.
2. Provide tokens/credentials for the providers you use (Monday / AI Chat).
3. Run `node connector/server.mjs` to start the local connector on port `8787` (override `PORT` in `.env` if needed).
4. Reload the extension and use `Connect` in Monday 관련 위젯 또는 AI Chat 위젯.

| Provider | Quick token env | OAuth client envs |
|----------|----------------|------------------|
| Monday Assigned | `MONDAY_ACCESS_TOKEN`, optional `MONDAY_ACCOUNT_LABEL` | `MONDAY_CLIENT_ID`, `MONDAY_CLIENT_SECRET` |
| AI Chat / OpenAI | `OPENAI_ACCESS_TOKEN`, optional `OPENAI_ACCOUNT_LABEL` | n/a |

Supplying OAuth client IDs/secrets lets the connector perform OAuth for Monday. You can also paste tokens directly into each widget's `Access token (optional)` field to skip popup-based auth.

Security defaults (Q3 hardening):
- connector bind host defaults to loopback (`CONNECTOR_HOST=127.0.0.1`)
- `/api/auth/start?mode=token` is disabled by default (`ENABLE_TOKEN_RELAY=1` required, loopback-only)
- `chrome-extension://` redirect is allowed only when both `ALLOW_CHROME_EXTENSION_REDIRECT=1` and the extension ID is listed in `ALLOWED_EXTENSION_IDS`
- `https://<extension-id>.chromiumapp.org` redirect also requires the extension ID to be listed in `ALLOWED_EXTENSION_IDS`

If Edge reports `chrome.identity.launchWebAuthFlow is not available` for Monday OAuth, set `MONDAY_ACCESS_TOKEN` (and optional `MONDAY_ACCOUNT_LABEL`) in `connector/.env`. Token relay fallback is not automatic: it only works when `ENABLE_TOKEN_RELAY=1` is set and the connector remains loopback-only.

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
- `Shortcut URL`과 `RSS Feed URL`은 `http/https`만 허용되며, 비웹 스킴은 차단됩니다.

### 4) 북마크 위젯

- `Folder path` 또는 `Folder ID` 설정
- 항목 연필 아이콘으로 표시명/아이콘/링크 개별 수정
- 링크 override는 http/https만 허용되고 유효하지 않으면 비활성 처리됨.

## 권한/저장

- Manifest: MV3
- Permissions
  - `storage`: 사용자 설정/레이아웃 저장
  - `bookmarks`: 북마크 트리 조회/갱신 반영
  - `identity`: connector OAuth redirect 처리
  - 저장소 로드 실패/손상 데이터 시 기본 상태 안전 복구.
- Host permissions: `http://*/*`, `https://*/*`

> 참고: AI Chat / Monday 위젯의 Auth connector 세션 토큰이 chrome.storage.local에 저장됩니다. 민감 정보 취급에 주의하세요.

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
    ├── shortcut.js
    ├── todo.js
    ├── notes.js
    ├── label.js
    ├── gmail.js
    ├── calendar.js
    ├── rss.js
    ├── weather.js
    └── container.js
```

## 로컬 점검

빌드 도구 없이 동작하는 구조입니다. 문법 확인 예시:

```bash
node --check app.js
node --check widgets/index.js
node --check widgets/calendar.js
```

## 라이선스

필요 시 프로젝트 정책에 맞춰 추가하세요.
