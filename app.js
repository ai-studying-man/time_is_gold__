"use strict";
/* =====================================================================
 * 지자체 공사 알림 — 프론트엔드 로직
 *  - 지도: Kakao(키 있으면) ↔ Leaflet/OSM(폴백)
 *  - 내 위치 화살표 이동(시뮬/실제GPS) + 공사구역 근접 알림
 *  - 알림: 화면 토스트 + TTS 음성안내 + 텔레그램 푸시(/api/notify)
 *  - 접근성: 글자크기 조절, aria-live, 큰 터치영역
 *  키는 코드에 없음. /api/config (Vercel env) 또는 window.APP_CONFIG 로 주입.
 * ===================================================================== */

const $ = id => document.getElementById(id);
const PREF = {
  get(k, d){ try{ const v=localStorage.getItem('rwa_'+k); return v==null?d:JSON.parse(v); }catch(_){ return d; } },
  set(k, v){ try{ localStorage.setItem('rwa_'+k, JSON.stringify(v)); }catch(_){} }
};
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ---------------- 거리/방위 ---------------- */
const R = 6371000;
const toRad = d => d*Math.PI/180, toDeg = r => r*180/Math.PI;
function haversine(aLat,aLng,bLat,bLng){
  const dLat=toRad(bLat-aLat), dLng=toRad(bLng-aLng);
  const s=Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}
function bearing(aLat,aLng,bLat,bLng){
  const y=Math.sin(toRad(bLng-aLng))*Math.cos(toRad(bLat));
  const x=Math.cos(toRad(aLat))*Math.sin(toRad(bLat))-Math.sin(toRad(aLat))*Math.cos(toRad(bLat))*Math.cos(toRad(bLng-aLng));
  return (toDeg(Math.atan2(y,x))+360)%360;
}

/* ---------------- 데이터 ---------------- */
const EVENTS = (window.CONSTRUCTION_EVENTS || []).filter(e => isFinite(e.lat) && isFinite(e.lng));
const META = window.CONSTRUCTION_META || {};
if (META.source) {
  $('srcBadge').textContent = META.source + (META.count!=null?` (${META.count}건)`:'');
  if (/sample|샘플/i.test(META.source)) $('srcBadge').classList.add('warn');
} else $('srcBadge').textContent = `${EVENTS.length}건`;
if (EVENTS.length === 0) $('emptyWarn').style.display='flex';

/* ---------------- 글자 크기 ---------------- */
const FS_MIN=0.8, FS_MAX=2.4, FS_STEP=0.15;
let fs = PREF.get('fs', 1);
function applyFs(){
  fs = Math.min(FS_MAX, Math.max(FS_MIN, Math.round(fs*100)/100));
  document.documentElement.style.setProperty('--fs', fs);
  $('fsLabel').textContent = Math.round(fs*100)+'%';
  PREF.set('fs', fs);
}
$('fsUp').onclick=()=>{fs+=FS_STEP;applyFs();};
$('fsDown').onclick=()=>{fs-=FS_STEP;applyFs();};
$('fsReset').onclick=()=>{fs=1;applyFs();};
applyFs();

/* ---------------- TTS ---------------- */
let koVoice=null;
function loadVoices(){ if(!('speechSynthesis' in window))return; const vs=speechSynthesis.getVoices(); koVoice=vs.find(v=>/ko(-|_)?/i.test(v.lang))||vs.find(v=>/korean/i.test(v.name))||null; }
if ('speechSynthesis' in window){ loadVoices(); speechSynthesis.onvoiceschanged=loadVoices; }
else { $('tts').checked=false; $('tts').disabled=true; $('tts').parentElement.classList.add('disabled'); }
function speak(text){
  if(!('speechSynthesis' in window) || !$('tts').checked) return;
  try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='ko-KR'; u.rate=1.02; if(koVoice)u.voice=koVoice; speechSynthesis.speak(u); }catch(_){}
}
$('tts').onchange=()=>{ PREF.set('tts',$('tts').checked); if($('tts').checked) speak('음성 안내를 켰습니다.'); else try{speechSynthesis.cancel();}catch(_){} };

/* ---------------- 날짜/활성 ---------------- */
function parseDate(s){ if(!s)return null; const d=new Date(s+'T00:00:00'); return isNaN(d)?null:d; }
function startOfToday(){ const n=new Date(); return new Date(n.getFullYear(),n.getMonth(),n.getDate()); }
function isActive(e){ if($('ignoreDates').checked)return true; const t=startOfToday(),s=parseDate(e.startDate),en=parseDate(e.endDate); if(!s&&!en)return true; if(s&&t<s)return false; if(en&&t>en)return false; return true; }
function isSoon(e){ const t=startOfToday(),s=parseDate(e.startDate); if(!s)return false; const d=(s-t)/86400000; return d>0&&d<=7; }
function fmtRange(e){ if(e.rawDateText)return e.rawDateText; const s=e.startDate||'?',en=e.endDate||'?'; return `${s} ~ ${en}`+(e.timeText?` (${e.timeText})`:''); }
function ttsDate(e){ const s=parseDate(e.startDate),en=parseDate(e.endDate); if(s&&en)return `${s.getMonth()+1}월 ${s.getDate()}일부터 ${en.getMonth()+1}월 ${en.getDate()}일까지`; return (e.rawDateText||fmtRange(e)).replace(/~/g,' 부터 '); }
function colorOf(e){ return isActive(e)?'#d32f2f':(isSoon(e)?'#f9a825':'#90a4ae'); }
function popupHtml(e){
  return `<div style="min-width:200px">
    <div style="font-weight:700;color:#d32f2f">${esc(e.eventType||'공사')} · ${esc(e.controlType||'')}</div>
    <div style="font-weight:800;font-size:1.15em;margin:4px 0">${esc(e.title||'')}</div>
    <div style="font-weight:800;color:#d32f2f">📅 ${esc(fmtRange(e))}</div>
    <div style="color:#555;margin-top:4px">📍 ${esc(e.roadName||e.location||'')}<br>🏛 ${esc(e.agency||'')}<br>
    ${e.sourceUrl?`🔗 <a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">원문 공고</a>`:''}
    ${e.authority?`<br>확정도: ${esc(e.authority)}`:''}</div></div>`;
}

/* =====================================================================
 * 지도 어댑터
 * ===================================================================== */
function loadKakao(key){
  return new Promise((res,rej)=>{
    if(window.kakao && window.kakao.maps){ res(); return; }
    const s=document.createElement('script'); s.async=true;
    s.src=`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    s.onload=()=>{ if(window.kakao&&kakao.maps) kakao.maps.load(()=>res()); else rej(new Error('kakao load fail')); };
    s.onerror=()=>rej(new Error('kakao script error'));
    document.head.appendChild(s);
  });
}
function KakaoAdapter(){
  let map, ov, ovEl, dragCb=null;
  const LL=(la,ln)=>new kakao.maps.LatLng(la,ln);
  function bindArrowDrag(){
    ovEl.style.cursor='grab'; ovEl.style.touchAction='none';
    let dragging=false;
    const toLatLng=(cx,cy)=>{ try{ const rect=$('map').getBoundingClientRect(); const pt=new kakao.maps.Point(cx-rect.left, cy-rect.top); return map.getProjection().coordsFromContainerPoint(pt); }catch(_){ return null; } };
    const down=ev=>{ dragging=true; ovEl.style.cursor='grabbing'; try{map.setDraggable(false);}catch(_){} ev.preventDefault(); ev.stopPropagation(); };
    const move=ev=>{ if(!dragging)return; const t=ev.touches&&ev.touches[0]?ev.touches[0]:ev; const ll=toLatLng(t.clientX,t.clientY); if(ll){ ov.setPosition(ll); if(dragCb)dragCb(ll.getLat(),ll.getLng()); } ev.preventDefault(); };
    const up=()=>{ if(!dragging)return; dragging=false; ovEl.style.cursor='grab'; try{map.setDraggable(true);}catch(_){} };
    ovEl.addEventListener('mousedown',down); ovEl.addEventListener('touchstart',down,{passive:false});
    document.addEventListener('mousemove',move); document.addEventListener('touchmove',move,{passive:false});
    document.addEventListener('mouseup',up); document.addEventListener('touchend',up);
  }
  return {
    name:'Kakao',
    init(c){ map=new kakao.maps.Map($('map'),{center:LL(c.lat,c.lng),level:4}); map.addControl(new kakao.maps.ZoomControl(),kakao.maps.ControlPosition.RIGHT); },
    circle(o){ const ci=new kakao.maps.Circle({center:LL(o.lat,o.lng),radius:o.radius,strokeWeight:2,strokeColor:o.color,strokeOpacity:.9,fillColor:o.color,fillOpacity:.15}); ci.setMap(map);
      return { setColor(col){ try{ci.setOptions({strokeColor:col,fillColor:col});}catch(_){} },
               emphasize(){ try{ci.setOptions({strokeWeight:5}); setTimeout(()=>{try{ci.setOptions({strokeWeight:2});}catch(_){}} ,1500);}catch(_){} } }; },
    marker(o){ const m=new kakao.maps.Marker({position:LL(o.lat,o.lng),map}); const iw=new kakao.maps.InfoWindow({content:`<div style="padding:8px;max-width:250px">${o.html}</div>`,removable:true}); kakao.maps.event.addListener(m,'click',()=>iw.open(map,m)); },
    polyline(pts,o){ new kakao.maps.Polyline({path:pts.map(p=>LL(p.lat,p.lng)),strokeWeight:3,strokeColor:o.color,strokeOpacity:.5,strokeStyle:'shortdash'}).setMap(map); },
    arrow(la,ln,brg){ const p=LL(la,ln);
      if(!ov){ ovEl=document.createElement('div'); ovEl.className='arrow-wrap'; ovEl.innerHTML='<div class="arrow-inner">➤</div>'; ov=new kakao.maps.CustomOverlay({position:p,content:ovEl,xAnchor:.5,yAnchor:.5,zIndex:10}); ov.setMap(map); bindArrowDrag(); }
      else ov.setPosition(p);
      if(brg!=null){ const i=ovEl.querySelector('.arrow-inner'); if(i)i.style.transform=`rotate(${brg-90}deg)`; } },
    setArrowDrag(cb){ dragCb=cb; },
    onMapClick(cb){ kakao.maps.event.addListener(map,'click',e=>{ const ll=e.latLng; cb(ll.getLat(),ll.getLng()); }); },
    panTo(la,ln){ map.panTo(LL(la,ln)); },
    setView(la,ln){ map.setCenter(LL(la,ln)); }
  };
}
function LeafletAdapter(){
  let map, am, dragCb=null;
  return {
    name:'Leaflet',
    init(c){ map=L.map('map',{zoomControl:true}).setView([c.lat,c.lng],c.zoom||16); L.control.scale({imperial:false}).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map); },
    circle(o){ const c=L.circle([o.lat,o.lng],{radius:o.radius,color:o.color,weight:2,fillColor:o.color,fillOpacity:.15}).addTo(map);
      return { setColor(col){c.setStyle({color:col,fillColor:col});}, emphasize(){c.setStyle({weight:5});setTimeout(()=>c.setStyle({weight:2}),1500);} }; },
    marker(o){ L.marker([o.lat,o.lng]).addTo(map).bindPopup(o.html); },
    polyline(pts,o){ L.polyline(pts.map(p=>[p.lat,p.lng]),{color:o.color,weight:3,opacity:.4,dashArray:'6 8'}).addTo(map); },
    arrow(la,ln,brg){ if(!am){ am=L.marker([la,ln],{icon:L.divIcon({className:'',iconSize:[40,40],iconAnchor:[20,20],html:'<div class="arrow-wrap"><div class="arrow-inner">➤</div></div>'}),zIndexOffset:1000,draggable:true,autoPan:false}).addTo(map);
        am.on('drag',()=>{ const p=am.getLatLng(); if(dragCb)dragCb(p.lat,p.lng); }); }
      else am.setLatLng([la,ln]); const el=am.getElement(); if(el&&brg!=null){ const i=el.querySelector('.arrow-inner'); if(i)i.style.transform=`rotate(${brg-90}deg)`; } },
    setArrowDrag(cb){ dragCb=cb; },
    onMapClick(cb){ map.on('click',e=>cb(e.latlng.lat,e.latlng.lng)); },
    panTo(la,ln){ map.panTo([la,ln],{animate:true,duration:.25}); },
    setView(la,ln,z){ map.setView([la,ln],z||16); }
  };
}

/* =====================================================================
 * 앱 본체
 * ===================================================================== */
let CONFIG={}, MAP=null;
const center = EVENTS.length
  ? { lat:EVENTS.reduce((a,e)=>a+e.lat,0)/EVENTS.length, lng:EVENTS.reduce((a,e)=>a+e.lng,0)/EVENTS.length }
  : { lat:37.5666, lng:126.9784 };

const eventLayers = {};   // id -> {ctrl, e}
const insideState = {};
const logged = [];

function renderMapContent(){
  EVENTS.forEach(e=>{
    const ctrl = MAP.circle({ lat:e.lat, lng:e.lng, radius:e.radius||120, color:colorOf(e) });
    MAP.marker({ lat:e.lat, lng:e.lng, html:popupHtml(e) });
    eventLayers[e.id] = { ctrl, e };
  });
  if (route.length>=2) MAP.polyline(route.map(p=>({lat:p[0],lng:p[1]})), { color:'#1565c0' });
}

let lastArrowPos=null, lastArrowBrg=90;
function setArrow(lat,lng,brg){
  MAP.arrow(lat,lng,brg);
  if ($('follow').checked) MAP.panTo(lat,lng);
  lastArrowPos=[lat,lng]; if(brg!=null) lastArrowBrg=brg;
  checkProximity(lat,lng);
}
// 데모: 화살표를 드래그(터치 포함)로 옮길 때
function onArrowDragged(lat,lng){
  stopSim();
  let brg=lastArrowBrg; if(lastArrowPos) brg=bearing(lastArrowPos[0],lastArrowPos[1],lat,lng)||brg;
  lastArrowBrg=brg; lastArrowPos=[lat,lng];
  MAP.arrow(lat,lng,brg);            // 위치만 갱신(드래그 중 패닝 안 함)
  checkProximity(lat,lng);
}
// 데모: 지도를 탭하면 화살표를 그 지점으로 이동(토글 ON일 때만)
function moveArrowTo(lat,lng){
  if(!$('tapMove').checked) return;
  stopSim();
  let brg=lastArrowBrg; if(lastArrowPos) brg=bearing(lastArrowPos[0],lastArrowPos[1],lat,lng)||brg;
  setArrow(lat,lng,brg);
}

/* ---------- 근접 알림 ---------- */
function checkProximity(lat,lng){
  EVENTS.forEach(e=>{
    if(!isActive(e)){ insideState[e.id]=false; return; }
    const r=e.radius||120, d=haversine(lat,lng,e.lat,e.lng);
    if(d<=r && !insideState[e.id]){ insideState[e.id]=true; fireAlert(e,Math.round(d)); }
    else if(d>r*1.3) insideState[e.id]=false;
  });
}
function fireAlert(e,dist){
  if(navigator.vibrate) navigator.vibrate([180,80,180]);
  if($('sound').checked) beep();
  speak(`전방 ${dist}미터, ${e.title||e.eventType||'공사'} 구간입니다. ${e.controlType||''}. 기간 ${ttsDate(e)}.`);
  systemNotify(e,dist);   // 앱 자체 알림(텔레그램 유무와 무관)
  sendTelegram(e,dist);   // 텔레그램이 설정된 경우 추가 푸시
  const t=document.createElement('div'); t.className='toast'; t.setAttribute('role','alert');
  const tagCls=(isSoon(e)&&!$('ignoreDates').checked)?'tag amber':'tag';
  t.innerHTML=`<div class="head"><span class="${tagCls}">⚠ ${esc(e.controlType||'공사')} 구간 진입 (${dist}m)</span><button class="x" aria-label="알림 닫기">×</button></div>
    <h3>${esc(e.title||e.eventType||'공사')}</h3>
    <div class="dates">📅 ${esc(fmtRange(e))}</div>
    <div class="meta">유형: ${esc(e.eventType||'-')} · ${esc(e.controlType||'-')}<br>📍 ${esc(e.roadName||e.location||'-')}<br>
    🏛 ${esc(e.agency||'-')} ${e.authority?`· 확정도 ${esc(e.authority)}`:''}<br>
    ${e.sourceUrl?`🔗 <a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">원문 공고 확인</a>`:'출처 정보 없음'}</div>`;
  t.querySelector('.x').onclick=()=>t.remove();
  $('toasts').prepend(t); setTimeout(()=>t.remove(),10000);
  logged.unshift({t:new Date(),name:e.title||e.eventType,dist}); renderList();
  const lyr=eventLayers[e.id]; if(lyr&&lyr.ctrl.emphasize) lyr.ctrl.emphasize();
}

/* ---------- 앱 자체 알림(시스템 알림) ----------
 * 텔레그램이 없어도 동작하는 기본 알림 경로. 화면 토스트 + TTS(상단 fireAlert) 와 함께
 * 브라우저 시스템 알림으로도 표시 → 다른 탭/화면에 있어도 알림. 권한은 토글 시 요청. */
function systemNotify(e,dist){
  if(!('Notification' in window) || Notification.permission!=='granted' || !$('appnotif').checked) return;
  try{
    const n=new Notification(`🚧 ${e.title||e.eventType||'공사'} (${dist}m)`, {
      body:`${e.controlType||''} · ${fmtRange(e)}\n📍 ${e.roadName||e.location||''}`,
      tag:String(e.id||e.title), renotify:false
    });
    n.onclick=()=>{ try{ window.focus(); }catch(_){} n.close(); };
  }catch(_){}
}

/* ---------- 텔레그램 푸시 ---------- */
function sendTelegram(e,dist){
  if(!CONFIG.telegramEnabled || !$('telegram').checked) return;
  const text =
    `🚧 <b>${esc(e.title||e.eventType||'공사')}</b>\n`+
    `전방 ${dist}m · ${esc(e.controlType||'')} (${esc(e.eventType||'')})\n`+
    `📅 ${esc(fmtRange(e))}\n`+
    `📍 ${esc(e.roadName||e.location||'')}\n`+
    `🏛 ${esc(e.agency||'')}`+
    (e.sourceUrl?`\n🔗 ${esc(e.sourceUrl)}`:'');
  fetch('/api/notify',{ method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ text }) })
    .then(r=>r.json()).then(d=>{ if(!d.ok) console.warn('telegram notify 실패',d); })
    .catch(err=>console.warn('telegram notify 오류',err));
}

let beepCtx;
function beep(){ try{ beepCtx=beepCtx||new (window.AudioContext||window.webkitAudioContext)(); const o=beepCtx.createOscillator(),g=beepCtx.createGain(); o.type='sine'; o.frequency.value=880; o.connect(g); g.connect(beepCtx.destination); g.gain.setValueAtTime(.15,beepCtx.currentTime); g.gain.exponentialRampToValueAtTime(.0001,beepCtx.currentTime+.3); o.start(); o.stop(beepCtx.currentTime+.3);}catch(_){} }

/* ---------- 목록 ---------- */
function renderList(){
  const items=EVENTS.map(e=>{ const act=isActive(e),soon=isSoon(e);
    const pill=act?'<span class="pill active">진행중</span>':soon?'<span class="pill soon">예정</span>':'<span class="pill">종료/대기</span>';
    return `<div class="item"><div class="name">${esc(e.title||e.eventType||'공사')} ${pill}</div><div class="d">📅 ${esc(fmtRange(e))}</div><div style="color:#666">${esc(e.eventType||'')} · ${esc(e.controlType||'')} · ${esc(e.roadName||e.location||'')}</div></div>`;
  }).join('');
  const recent=logged.slice(0,5).map(l=>`<div class="item" style="color:#b71c1c">🔔 ${l.t.toLocaleTimeString('ko-KR')} — ${esc(l.name)} (${l.dist}m)</div>`).join('');
  $('list').innerHTML=(recent?`<div style="font-weight:700;margin-bottom:4px">최근 알림</div>${recent}<hr style="border:0;border-top:1px solid #eee;margin:8px 0">`:'')+items;
}
function refreshStyles(){
  EVENTS.forEach(e=>{ const lyr=eventLayers[e.id]; if(lyr) lyr.ctrl.setColor(colorOf(e)); });
  $('activeCount').textContent=EVENTS.filter(isActive).length;
  renderList();
}

/* ---------- 시뮬 주행 ---------- */
function buildRoute(){ if(EVENTS.length===0)return []; const pts=EVENTS.map(e=>[e.lat,e.lng]).sort((a,b)=>a[1]-b[1]); const f=pts[0]; return [[f[0],f[1]-0.004],...pts]; }
let route=buildRoute();
let segIndex=0, segProg=0, lastBearing=90, simTimer=null;
function advance(m){
  while(m>0&&segIndex<route.length-1){ const a=route[segIndex],b=route[segIndex+1],L=haversine(a[0],a[1],b[0],b[1]),rem=L-segProg; if(m<rem){segProg+=m;m=0;}else{m-=rem;segIndex++;segProg=0;} }
  if(segIndex>=route.length-1){ segIndex=0;segProg=0; return {lat:route[0][0],lng:route[0][1],brg:lastBearing}; }
  const a=route[segIndex],b=route[segIndex+1],L=haversine(a[0],a[1],b[0],b[1])||1,t=segProg/L; lastBearing=bearing(a[0],a[1],b[0],b[1]);
  return {lat:a[0]+(b[0]-a[0])*t,lng:a[1]+(b[1]-a[1])*t,brg:lastBearing};
}
function startSim(){ if(route.length<2){alert('경로를 만들 공사 데이터가 부족합니다.');return;} stopGps(); if(simTimer)return; $('btnSim').textContent='⏸ 일시정지'; $('btnSim').classList.add('on'); simTimer=setInterval(()=>{const p=advance(+$('speed').value); setArrow(p.lat,p.lng,p.brg);},250); }
function stopSim(){ if(simTimer){clearInterval(simTimer);simTimer=null;} $('btnSim').textContent='▶ 시뮬 주행'; $('btnSim').classList.remove('on'); }
function resetSim(){ stopSim(); segIndex=0;segProg=0; if(route.length) setArrow(route[0][0],route[0][1],90); MAP.setView(center.lat,center.lng,16); }

/* ---------- 실제 GPS ---------- */
let gpsId=null,lastGps=null;
function startGps(){ if(!navigator.geolocation){alert('이 브라우저는 위치 기능을 지원하지 않습니다.');return;} stopSim(); $('modeBadge').style.display='inline-block'; $('btnGps').classList.add('on');
  gpsId=navigator.geolocation.watchPosition(pos=>{ const {latitude:lat,longitude:lng}=pos.coords; let brg=pos.coords.heading; if(brg==null&&lastGps)brg=bearing(lastGps[0],lastGps[1],lat,lng); setArrow(lat,lng,(brg||0)); lastGps=[lat,lng]; }, err=>alert('위치 가져오기 실패: '+err.message), {enableHighAccuracy:true,maximumAge:1000}); }
function stopGps(){ if(gpsId!=null){navigator.geolocation.clearWatch(gpsId);gpsId=null;} $('modeBadge').style.display='none'; $('btnGps').classList.remove('on'); }

/* ---------- 바인딩 ---------- */
$('btnSim').onclick=()=>simTimer?stopSim():startSim();
$('btnReset').onclick=resetSim;
$('btnGps').onclick=()=>gpsId!=null?stopGps():startGps();
$('speed').oninput=e=>$('speedVal').textContent=e.target.value;
$('ignoreDates').onchange=refreshStyles;
$('sound').checked=PREF.get('sound',false); $('sound').onchange=()=>PREF.set('sound',$('sound').checked);
$('tts').checked=PREF.get('tts',true)&&!$('tts').disabled;
// 앱 자체(시스템) 알림 토글 — 토글 켤 때 권한 요청
if(!('Notification' in window)){ $('appnotif').disabled=true; $('appnotifWrap').classList.add('disabled'); }
$('appnotif').checked = PREF.get('appnotif',false) && ('Notification' in window) && Notification.permission==='granted';
$('appnotif').onchange=()=>{
  PREF.set('appnotif',$('appnotif').checked);
  if($('appnotif').checked && 'Notification' in window && Notification.permission==='default')
    Notification.requestPermission().then(p=>{ if(p!=='granted'){ $('appnotif').checked=false; PREF.set('appnotif',false); } });
};
// 데모: 탭하여 화살표 이동 토글
$('tapMove').checked=PREF.get('tapMove',false); $('tapMove').onchange=()=>PREF.set('tapMove',$('tapMove').checked);
function togglePanel(){ const p=$('panel'); p.classList.toggle('collapsed'); $('panelHead').setAttribute('aria-expanded',String(!p.classList.contains('collapsed'))); }
$('panelHead').onclick=togglePanel;
$('panelHead').onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();togglePanel();} };
setInterval(()=>{ $('clock').textContent=new Date().toLocaleString('ko-KR',{dateStyle:'medium',timeStyle:'medium'}); },1000);
if (window.matchMedia('(max-width:720px)').matches) $('panel').classList.add('collapsed');

/* ---------- 부트스트랩: config → 지도 선택 → 시작 ---------- */
function setTelegramUi(){
  const on = !!CONFIG.telegramEnabled;
  $('tgBadge').style.display = on ? 'inline-block' : 'none';
  const tg=$('telegram'), wrap=$('telegramWrap');
  tg.disabled = !on; wrap.classList.toggle('disabled', !on);
  tg.checked = on && PREF.get('telegram', true);
  tg.onchange=()=>PREF.set('telegram',tg.checked);
  if(!on) wrap.title = '배포 후 Vercel 환경변수(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) 설정 시 활성화';
}
async function boot(){
  try{ const r=await fetch('/api/config',{cache:'no-store'}); if(r.ok) CONFIG=await r.json(); }catch(_){}
  if((!CONFIG||!CONFIG.kakaoJsKey) && window.APP_CONFIG) CONFIG=Object.assign({}, window.APP_CONFIG, CONFIG);

  if (CONFIG.kakaoJsKey){
    try{ await loadKakao(CONFIG.kakaoJsKey); MAP=KakaoAdapter(); }
    catch(e){ console.warn('Kakao 지도 로드 실패 → Leaflet 폴백:', e.message); }
  }
  if (!MAP){ MAP=LeafletAdapter(); }

  $('mapBadge').textContent = MAP.name + (MAP.name==='Leaflet' ? (CONFIG.kakaoJsKey?'(폴백)':'(키없음)') : '');
  if (MAP.name==='Leaflet') $('mapBadge').classList.add('warn');

  MAP.init({ lat:center.lat, lng:center.lng, zoom:16 });
  renderMapContent();
  setTelegramUi();
  refreshStyles();
  resetSim();
  // 데모 이동: 화살표 드래그(터치 포함) + 탭하여 이동
  if(MAP.setArrowDrag) MAP.setArrowDrag(onArrowDragged);
  if(MAP.onMapClick) MAP.onMapClick(moveArrowTo);
}
boot();
