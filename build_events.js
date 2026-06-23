/* =====================================================================
 * build_events.js — 크롤링 결과 폴더(*통행정보*)를 앱 데이터로 변환
 *   1) 통행 관련(공사/정비/예초/굴착/점용/통제)만 선별 (행정문서 제외)
 *   2) 제목에서 도로명/지번을 뽑아 Nominatim으로 좌표 정밀화(실패 시 자치구 중심 폴백)
 *   입력: ./<...통행정보...>/events_geo.json | events.json
 *   출력: ./construction_events.js  (window.CONSTRUCTION_EVENTS / META)
 *   실행: node build_events.js     (정밀화 때문에 수십 초 소요 — Nominatim 1req/s 준수)
 *   끄려면: node build_events.js --no-geocode
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const today = new Date();
const NO_GEOCODE = process.argv.includes('--no-geocode');

/* ---------- 좌표 없는 이벤트용 기관/지역 중심 폴백 ---------- */
function geocodeByName(name, region) {
  const s = `${name || ''} ${region || ''}`;
  if (s.includes('고양') || s.includes('일산')) return { lat: 37.6700, lng: 126.7670, precision: 'city', gu: '고양시(일산)' };
  if (s.includes('중구')) return { lat: 37.5636, lng: 126.9970, precision: 'gu', gu: '중구' };
  if (s.includes('서울')) return { lat: 37.5665, lng: 126.9780, precision: 'city', gu: '서울' };
  return null;
}
const radiusFor = p => (p === 'road' ? 120 : p === 'city' ? 900 : p === 'gu' ? 350 : 250);
const ctrlByCat = { road: '부분통제', occupy: '도로점용', water: '굴착/단수', maintenance: '보수작업', event: '행사/통제', etc: '' };
const authorityOf = src => !src ? '' : (src.includes('원문공개') || src.includes('소통광장')) ? '원문공개' : (src.includes('고시') || src.includes('공고')) ? '고시·공고' : src;
function statusOf(e) { const ds = e.date_start ? new Date(e.date_start) : null, de = e.date_end ? new Date(e.date_end) : null; if (de && de < today) return '종료'; if (ds && ds > today) return '예정'; if (ds || de) return '진행중'; return '안내'; }
function rawDate(e) { if (e.date_text) return e.date_text; if (e.date_start || e.date_end) return `${e.date_start || '?'} ~ ${e.date_end || '?'}`; if (e.posted_at) return `게시 ${e.posted_at}`; return '일정 미상'; }

/* ---------- 관련성 필터 (제목 기준, 띄어쓰기 제거 후 매칭) ---------- */
const ALLOWED_CAT = new Set(['road', 'water', 'maintenance', 'occupy']);
const WORK   = /굴착|포장|가로수|예초|제초|전지|방제|제설|준설|보수공사|정비공사|도로공사|상수도공사|하수도공사|보도유지|보도보수|보도정비|차로|통제|통행제한|단수|점용|노면|굴착복구|관로보강|관로정비|관로교체|상수도관|하수관|누수복구|보수|정비/;
const ACTION = /시행|안내|통제|통행제한|우회|단수|예초|제초|작업|복구|준설|점용|굴착/;
const ADMIN  = /구매|출고|자재|설계변경|검토|기성검사|준공검사|물품검사|검사원|검사\(|지정요구|조서|복구비|납부|정산|낙찰|입찰|수의계약|계약안내|조례|개정|폐지|자문|회의|위원회|심의|결산|면접|채용|심사|명단|선발|연수|마켓|모집|공모|위수탁|협약|위촉|과태료|공시송달|위반|무단방치|홍보|예산|간주처리|급식|보조금|지원사업|소송|현장검증|업무지시|작업지시|이행상황|송부|보고서|연기보고|결과보고|계획보고|집행계획|활용계획|추진계획|개선계획|관리개선|점검계획|사업계획|점검|측량|조사서|시설자료|자료제출|보완|부담금|환급|부과|처리결과|회신|답변|바란다|기금|조치계획|피해|교육|아카데미|체험|공약|특정기술|신기술|납품|조달|응답서|접수|근거자료|자료요청|적용기준/;
function isRelevant(e) {
  if (!ALLOWED_CAT.has(e.category)) return false;
  const t = (e.title || '').replace(/\s+/g, '');
  if (!WORK.test(t)) return false;
  if (ADMIN.test(t)) return false;
  if (!(ACTION.test(t) || e.impacts_traffic === true)) return false;
  return true;
}

// 공문 제목 → 간단한 분류 라벨 (시행/협조요청/의뢰/통보 등 군더더기 제거)
function cleanTitle(raw, category) {
  const t = (raw || '').replace(/\s+/g, '');
  if (/예초|제초/.test(t)) return '예초·제초';
  if (/가로수/.test(t)) return '가로수 정비';
  if (/노면|미끄럼|교통안전|안전표지/.test(t)) return '노면·안전시설 정비';
  if (/굴착/.test(t) && /포장/.test(t)) return '도로 굴착·포장';
  if (/굴착/.test(t)) return '도로 굴착';
  if (/포장/.test(t)) return '도로 포장';
  if (/상수도/.test(t)) return '상수도 공사';
  if (/하수도|준설/.test(t)) return '하수도 공사';
  if (/관로/.test(t)) return '관로 보수';
  if (/누수/.test(t)) return '누수 복구';
  if (/보도/.test(t)) return '보도 정비';
  if (/단수/.test(t)) return '단수 안내';
  if (/점용/.test(t)) return '도로 점용';
  return ({ road: '도로 공사', water: '상수도 공사', maintenance: '시설 정비', occupy: '도로 점용' })[category] || '도로 공사';
}

function normalize(e, idx) {
  const clean = cleanTitle(e.title, e.category);
  let lat = e.lat, lng = e.lng, precision = e.precision, gu = e.gu;
  if (!(isFinite(lat) && isFinite(lng))) {
    const g = geocodeByName(e.source_name, e.region);
    if (!g) return null;
    lat = g.lat; lng = g.lng; precision = g.precision; gu = g.gu;
  }
  const road = e.road || (Array.isArray(e.roads) && e.roads[0]) || '';
  return {
    id: e.hash || e.doc_no || `evt-${idx}`,
    title: clean,
    rawTitle: e.title || '',
    eventType: clean,
    controlType: (e.control && e.control.trim()) || ctrlByCat[e.category] || '',
    lat, lng, radius: radiusFor(precision),
    startDate: e.date_start || '', endDate: e.date_end || '',
    timeText: '', rawDateText: rawDate(e),
    roadName: road, location: gu || e.region || e.source_name || '',
    agency: e.source_name || e.dept || '',
    sourceName: e.source || '', sourceUrl: e.url || '',
    authority: authorityOf(e.source), extractionConfidence: null,
    status: statusOf(e),
    category: e.category || '', precision: precision || '',
    impactsTraffic: e.impacts_traffic === true
  };
}

/* ---------- 제목에서 주소(도로명/지번) 추출 ---------- */
function extractAddr(title) {
  const t = (title || '').replace(/[\[\]()]/g, ' ');
  let m = t.match(/([가-힣]+(?:로|길)\s?\d+(?:-\d+)?)/);   // 도로명 + 번호 (예: 응암로1길 10)
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  m = t.match(/([가-힣]+동\s?\d+(?:-\d+)?)\s*번?지?/);      // 동 + 번지 (예: 신월동 530)
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  m = t.match(/([가-힣]{2,}(?:로|길))(?![가-힣])/);         // 도로명만 (예: 고산자로)
  if (m) return m[1];
  return null;
}

/* ---------- Nominatim 지오코딩 (1req/s, User-Agent 명시) ---------- */
const cache = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const inArea = (la, ln) => la > 37.40 && la < 37.80 && ln > 126.60 && ln < 127.30; // 서울+일산권
async function nominatim(q) {
  if (cache[q] !== undefined) return cache[q];
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=kr&accept-language=ko&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'roadwork-alert-mvp/1.0 (geocode build)' } });
    if (!r.ok) { cache[q] = null; return null; }
    const j = await r.json();
    cache[q] = (j && j[0]) ? { lat: +j[0].lat, lng: +j[0].lon } : null;
    return cache[q];
  } catch (_) { cache[q] = null; return null; }
}

(async () => {
  const dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory() && /통행정보/.test(d.name)).map(d => d.name);
  const seen = new Set(), out = [], srcLabels = [];
  let skipped = 0;
  for (const dir of dirs) {
    const cand = ['events_geo.json', 'events.json', 'events_balanced.json'].map(f => path.join(ROOT, dir, f)).find(fs.existsSync);
    if (!cand) continue;
    const arr = JSON.parse(fs.readFileSync(cand, 'utf8'));
    srcLabels.push(dir);
    let kept = 0, dropped = 0;
    arr.forEach((e, i) => {
      if (!isRelevant(e)) { dropped++; return; }
      const n = normalize(e, i);
      if (!n) { skipped++; return; }
      if (seen.has(n.id)) return;
      seen.add(n.id); out.push(n); kept++;
    });
    console.log(`· ${dir}/${path.basename(cand)} → ${arr.length}건 중 관련 ${kept}건 채택 (행정문서 ${dropped}건 제외)`);
  }

  // 좌표 정밀화
  let refined = 0;
  if (!NO_GEOCODE) {
    process.stdout.write('· 좌표 정밀화(Nominatim) ');
    for (const n of out) {
      const addr = extractAddr(n.rawTitle || n.title);
      if (!addr) { process.stdout.write('.'); continue; }
      const gu = /구$|시$/.test(n.location) ? n.location : '';
      const q = `서울특별시 ${gu} ${addr}`.replace(/\s+/g, ' ').trim();
      const hit = await nominatim(q);
      await sleep(1100);
      if (hit && inArea(hit.lat, hit.lng)) { n.lat = hit.lat; n.lng = hit.lng; n.precision = 'road'; n.radius = radiusFor('road'); refined++; process.stdout.write('o'); }
      else process.stdout.write('x');
    }
    process.stdout.write('\n');
  }

  const meta = {
    source: `크롤링(통행 관련만): ${srcLabels.join(' + ')}`,
    generatedAt: new Date().toISOString(),
    count: out.length,
    refined,
    note: `통행 영향(공사/정비/예초/굴착/점용/통제)만 선별. ${refined}건 도로단위 정밀화, 나머지는 자치구 중심 폴백.`
  };
  const banner = `/* 자동 생성 — build_events.js. 직접 수정 금지. (${meta.generatedAt}) */\n`;
  fs.writeFileSync(path.join(ROOT, 'construction_events.js'),
    banner +
    `window.CONSTRUCTION_META = ${JSON.stringify(meta, null, 2)};\n` +
    `window.CONSTRUCTION_EVENTS = ${JSON.stringify(out, null, 1)};\n`, 'utf8');

  console.log(`\n✅ construction_events.js: ${out.length}건 (정밀화 ${refined}건 / 폴백 ${out.length - refined}건, 제외 ${skipped})`);
})();
