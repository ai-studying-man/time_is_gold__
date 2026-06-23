/* =====================================================================
 * construction_events.js  —  앱이 사용하는 "크롤링 데이터" 계약 파일
 * ---------------------------------------------------------------------
 * 크롤러는 이 파일을 통째로 덮어쓰면 됩니다. 앱(index.html)은
 *   window.CONSTRUCTION_EVENTS  (배열)  — 공사/통제 이벤트
 *   window.CONSTRUCTION_META    (객체)  — 데이터 출처/생성시각 메타
 * 두 전역 변수만 사용합니다.  스키마는 README.md 참고.
 *
 * 아래는 앱이 키 없이 즉시 동작하도록 넣어둔 "샘플(서울 도심)" 데이터입니다.
 * 실제 크롤링 결과로 교체하세요.
 * ===================================================================== */

window.CONSTRUCTION_META = {
  source: "SAMPLE(서울 도심 예시)",   // 예: "ITS 돌발상황 API", "○○시 새올 고시공고"
  generatedAt: "2026-06-23T09:00:00+09:00",
  count: 4,
  note: "키 없이 데모용으로 포함된 샘플. 크롤러 출력으로 교체할 것."
};

window.CONSTRUCTION_EVENTS = [
  {
    id: "evt-0001",
    title: "세종대로 사거리 차로 부분통제",
    eventType: "부분통제",            // 예초/풀베기/부분통제/전면통제/굴착/보수/점용
    controlType: "차로통제",          // 화면 표시용 통제 유형
    lat: 37.5705, lng: 126.9769,
    radius: 130,                      // 알림 반경(m)
    startDate: "2026-06-15", endDate: "2026-07-10",
    timeText: "09:00~18:00",
    rawDateText: "2026.6.15.(월) ~ 7.10.(금) 주간",   // 원문 표기(있으면 우선 표시)
    roadName: "세종대로", location: "세종대로 사거리",
    agency: "서울특별시 종로구청",
    sourceName: "새올 고시공고", sourceUrl: "https://www.open.go.kr/",
    authority: "행정고시", extractionConfidence: 0.92, status: "진행중"
  },
  {
    id: "evt-0002",
    title: "청계광장 일대 가로수 예초 작업",
    eventType: "예초",
    controlType: "보행우회",
    lat: 37.5693, lng: 126.9789,
    radius: 110,
    startDate: "2026-06-20", endDate: "2026-06-27",
    timeText: "08:00~17:00",
    rawDateText: "2026.6.20. ~ 6.27. (우천 시 순연)",
    roadName: "청계천로", location: "청계광장",
    agency: "서울특별시 중구청",
    sourceName: "구청 공지사항", sourceUrl: "https://www.open.go.kr/",
    authority: "일반공고", extractionConfidence: 0.74, status: "진행중"
  },
  {
    id: "evt-0003",
    title: "종로2가 상수도관 굴착공사",
    eventType: "굴착",
    controlType: "부분통제",
    lat: 37.5703, lng: 126.9869,
    radius: 120,
    startDate: "2026-06-01", endDate: "2026-08-31",
    timeText: "전일",
    rawDateText: "2026.6.1. ~ 8.31.",
    roadName: "종로", location: "종로2가",
    agency: "서울특별시 상수도사업본부",
    sourceName: "점용허가 공고", sourceUrl: "https://www.open.go.kr/",
    authority: "점용허가", extractionConfidence: 0.88, status: "진행중"
  },
  {
    id: "evt-0004",
    title: "종로3가 보도블록 정비공사 (예정)",
    eventType: "보수",
    controlType: "보행우회",
    lat: 37.5705, lng: 126.9920,
    radius: 120,
    startDate: "2026-08-01", endDate: "2026-08-20",
    timeText: "09:00~18:00",
    rawDateText: "2026.8.1. ~ 8.20.",
    roadName: "종로", location: "종로3가",
    agency: "서울특별시 종로구청",
    sourceName: "입찰 후속 고시", sourceUrl: "https://www.open.go.kr/",
    authority: "착공신고", extractionConfidence: 0.81, status: "예정"
  }
];
