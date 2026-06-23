# 지자체 공사 알림 (Roadwork Alert)

지자체 소규모 공사·도로통제 정보를 **지도 위에 표시**하고, **내 위치(화살표)가 공사
알림범위에 들어오면** 화면·음성(TTS)·텔레그램으로 알려주는 모바일 친화 웹앱.

- 지도: **Kakao 지도**(키 설정 시) ↔ **Leaflet/OSM**(키 없으면 자동 폴백)
- 알림: **앱 자체 알림(화면 토스트 + 시스템 알림) + TTS 음성** + **텔레그램 푸시**(선택)
- 접근성: **글자 크기 조절(저시력자)**, 큰 터치영역, 핀치 줌, 스크린리더(aria-live)
- 데모: 화살표 **시뮬 주행 / 실제 GPS / 드래그·탭으로 임의 이동**
- 배포: **GitHub → Vercel**. 코드에 키 없음 → **다른 컴퓨터에서 환경변수만 넣으면 끝.**

---

## 📁 폴더 구조

```
roadwork-alert-mvp/
├─ index.html              # 화면/스타일
├─ app.js                  # 앱 로직(지도 어댑터, 근접판정, TTS, 알림, 텔레그램 호출)
├─ construction_events.js  # ★ 크롤러가 채우는 데이터(공사 목록). 기본은 서울 샘플
├─ api/
│  ├─ config.js            # GET  /api/config  → 공개설정(Kakao키, telegram on/off)
│  └─ notify.js            # POST /api/notify  → 서버에서 텔레그램 전송(토큰 비공개)
├─ vercel.json             # Vercel 설정
├─ package.json            # node>=18, scripts(dev: vercel dev)
├─ .env.example            # 환경변수 양식(.env 로 복사해서 사용)
├─ .gitignore             # .env, node_modules 등 제외
├─ run.bat                 # 로컬 실행 도우미(vercel dev 또는 정적 미리보기)
└─ README.md
```

---

## 🚀 배포 (GitHub → Vercel)

### 1) GitHub에 올리기
```bash
cd roadwork-alert-mvp
git init
git add .
git commit -m "지자체 공사 알림 MVP"
git branch -M main
git remote add origin https://github.com/<계정>/<레포>.git
git push -u origin main
```
> `.env` 는 `.gitignore` 로 제외됩니다. 실제 키가 깃에 올라가지 않습니다.

### 2) Vercel에 연결
1. https://vercel.com → **Add New… → Project → GitHub 레포 Import**
2. Framework Preset: **Other** (빌드 명령 없음, 정적 + `/api` 서버리스 자동 인식)
3. **Deploy** (이 시점엔 키가 없어 Leaflet 폴백 지도로 뜹니다 — 정상)

### 3) 환경변수 입력 → 재배포
Vercel 프로젝트 → **Settings → Environment Variables** 에 추가 후 **Redeploy**:

| 변수 | 값 | 용도 |
|------|----|------|
| `KAKAO_JS_KEY` | Kakao JavaScript 키 | 지도 |
| `TELEGRAM_BOT_TOKEN` | BotFather 봇 토큰 | 텔레그램 전송(서버 전용) |
| `TELEGRAM_CHAT_ID` | 알림 받을 chat id | 텔레그램 대상 |

> 셋 다 선택입니다. `KAKAO_JS_KEY` 없으면 Leaflet, 텔레그램 변수 없으면 텔레그램만 비활성
> (앱 자체 알림+TTS는 그대로 동작).

---

## 🔑 키 발급

### Kakao 지도 (JavaScript 키)
1. https://developers.kakao.com → 로그인 → **내 애플리케이션 → 애플리케이션 추가**
2. **앱 키 → JavaScript 키** 복사 → `KAKAO_JS_KEY` 에 입력
3. **플랫폼 → Web** 에 사이트 도메인 등록(필수, 없으면 지도 안 뜸):
   - `https://<프로젝트>.vercel.app`
   - `http://localhost:3000` (로컬 `vercel dev` 용)
4. **카카오맵** 사용 설정(활성화) ON

### Telegram 봇
1. 텔레그램에서 **@BotFather** → `/newbot` → 이름/유저명 입력 → **토큰** 복사 → `TELEGRAM_BOT_TOKEN`
2. **chat id 확인**: 만든 봇과 대화 시작(`/start`) → 브라우저에서
   `https://api.telegram.org/bot<토큰>/getUpdates` 열기 → `result[].message.chat.id` → `TELEGRAM_CHAT_ID`
   - 그룹: 봇을 그룹에 초대 후 아무 메시지 → 같은 방법으로 음수 chat id 확인
   - 채널: 봇을 관리자로 추가 후 채널 chat id 사용

---

## 💻 로컬 개발

전체 기능(Kakao/텔레그램/`/api`)을 로컬에서 보려면 **Vercel CLI** 사용:
```bash
npm i -g vercel
cp .env.example .env      # 값 채우기 (Windows: copy .env.example .env)
vercel dev                # http://localhost:3000
```
또는 `run.bat` 더블클릭(있으면 vercel dev, 없으면 정적 미리보기로 자동 전환).

> 키 없이 빠르게 화면만 보려면 `python -m http.server` 등으로 띄워도 됩니다.
> 이 경우 지도는 Leaflet, 텔레그램은 비활성이지만 화살표·근접 알림·TTS·드래그는 모두 동작합니다.

---

## 🔔 알림 동작

공사 알림범위(지오펜스)에 화살표가 들어오면 한 번에:
1. **화면 토스트**(공사명·시행날짜 강조·통제유형·원문 링크)
2. **TTS 음성**: "전방 ○○미터, △△ 구간입니다. 기간 …"
3. **시스템 알림**(앱 자체) — 토글 ON + 권한 허용 시, 다른 탭/화면에서도 표시
4. **텔레그램 푸시** — 환경변수 설정 + 토글 ON 시

→ **텔레그램이 없어도 1·2·3 으로 항상 알림**이 갑니다. 재진입 방지(히스테리시스) 적용.

---

## 🧪 데모 시연 — 화살표 이동
- **▶ 시뮬 주행**: 모든 공사구역을 자동 순회
- **📍 GPS**: 실제 위치로 이동(https/localhost 권장)
- **드래그**: 화살표를 마우스/손가락으로 끌어 임의 위치로 이동(모바일 터치 지원)
- **🎯 탭하여 이동**: 토글 ON 시 지도를 탭하면 그 지점으로 화살표 이동

---

## 🗂 데이터 연결 = `construction_events.js` 덮어쓰기

앱은 `window.CONSTRUCTION_EVENTS`(배열)와 `window.CONSTRUCTION_META`(메타)만 사용합니다.
크롤러는 이 파일을 통째로 생성/덮어쓰고 커밋하면 Vercel이 자동 재배포합니다.

필수 필드는 **`id`, `lat`, `lng`(WGS84)**. 나머지는 채울수록 알림이 풍부해집니다.

| 필드 | 필수 | 설명 |
|------|:---:|------|
| `id` | ✅ | 고유 ID(공고번호 등), 알림 중복 판정 |
| `lat`,`lng` | ✅ | WGS84 위/경도 |
| `radius` | 권장 | 알림 반경(m), 기본 120 |
| `title` | 권장 | 공사명(알림 제목) |
| `eventType` / `controlType` | 권장 | 예초·부분통제·굴착·보수 / 차로통제·보행우회 |
| `startDate`,`endDate` | 권장 | `YYYY-MM-DD`, 활성기간 판정 |
| `timeText`,`rawDateText` | 선택 | 시간대 / 원문 날짜표기(우선 표시) |
| `roadName`,`location`,`agency` | 선택 | 도로명/위치/기관 |
| `sourceName`,`sourceUrl` | 권장 | 출처/원문 링크(알림에 노출) |
| `authority`,`extractionConfidence`,`status` | 선택 | 확정도/신뢰도/상태 |

좌표가 없는 공고는 크롤러 단계에서 VWorld/juso 지오코딩으로 `lat/lng`를 채우세요.

---

## 🔒 보안 메모
- **텔레그램 봇 토큰은 서버(`/api/notify`)에서만** 사용 — 클라이언트로 전송하지 않음.
- **Kakao JS 키는 공개키**(도메인 제한으로 보호). `/api/config`로 전달되어도 안전.
- 실제 키는 **Vercel 환경변수 / 로컬 `.env`** 에만. 깃에 커밋 금지(`.gitignore` 처리됨).

## 다음 단계(2차)
경로 검색 기반 사전 알림, 디바이스 백그라운드 지오펜스, 신뢰도/확정도 배지·다국어,
텔레그램 음성 메시지(서버 TTS) 등은 별도 단계에서 확장.
