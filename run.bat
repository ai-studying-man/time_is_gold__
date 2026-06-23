@echo off
REM 로컬 실행 도우미.
REM  - vercel CLI 가 있으면: vercel dev (Kakao 지도 + 텔레그램 + /api 전부 동작)
REM  - 없으면: 정적 미리보기 (Leaflet 폴백 지도, 텔레그램 비활성 / 화살표·알림·TTS·드래그는 동작)
cd /d "%~dp0"
where vercel >nul 2>nul && (
  echo [vercel dev] http://localhost:3000  ^(전체 기능: Kakao/Telegram/api^)
  vercel dev
) || (
  echo [정적 미리보기] http://localhost:8000  ^(Leaflet 폴백, 텔레그램 비활성^)
  echo  전체 기능은  npm i -g vercel  후  vercel dev  권장
  start "" "http://localhost:8000/index.html"
  python -m http.server 8000
)
