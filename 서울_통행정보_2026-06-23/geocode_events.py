#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
[③ 지도연동 준비] 수집 이벤트(JSON) → 좌표 부여 → events_geo.json + map_preview.html(Leaflet).

동작 방식(키 유무에 따라 자동 단계화):
  - VWORLD_KEY 환경변수 있음 → 도로명/구간을 VWorld Geocoder로 WGS84 좌표화(도로 단위 정밀)
  - 키 없음/실패 → 25개 자치구 중심좌표(내장)로 폴백(구 단위). 즉, 키 없이도 지도가 바로 뜸.
  - JUSO_KEY 있으면 juso 좌표제공도 시도 가능(저장용 권장, EPSG:5179→WGS84 변환에 pyproj 필요)

실행:
  set VWORLD_KEY=발급키            (선택, 도로단위 정밀화)
  python geocode_events.py [events_balanced.json] [out_dir]
산출물:
  events_geo.json     (앱이 소비할 좌표 포함 데이터: lat/lng/precision/...)
  map_preview.html    (브라우저로 더블클릭 → 서울 지도 위 점 표시, 분류/자치구 필터)
"""
from __future__ import annotations

import json, os, re, sys
from pathlib import Path

VWORLD_KEY = os.environ.get("VWORLD_KEY", "")
JUSO_KEY = os.environ.get("JUSO_KEY", "")

# 25개 자치구 청사 근사 좌표(WGS84) — 키 없을 때 구 단위 폴백
GU_CENTROID = {
    "종로구": (37.5735, 126.9790), "중구": (37.5636, 126.9976), "용산구": (37.5384, 126.9655),
    "성동구": (37.5634, 127.0371), "광진구": (37.5385, 127.0823), "동대문구": (37.5744, 127.0396),
    "중랑구": (37.6063, 127.0927), "성북구": (37.5894, 127.0167), "강북구": (37.6396, 127.0257),
    "도봉구": (37.6688, 127.0471), "노원구": (37.6543, 127.0568), "은평구": (37.6027, 126.9291),
    "서대문구": (37.5791, 126.9368), "마포구": (37.5663, 126.9019), "양천구": (37.5169, 126.8665),
    "강서구": (37.5509, 126.8495), "구로구": (37.4954, 126.8874), "금천구": (37.4569, 126.8956),
    "영등포구": (37.5264, 126.8962), "동작구": (37.5124, 126.9393), "관악구": (37.4784, 126.9516),
    "서초구": (37.4836, 127.0327), "강남구": (37.5172, 127.0473), "송파구": (37.5145, 127.1059),
    "강동구": (37.5301, 127.1238),
}
SEOUL_CENTER = (37.5665, 126.9780)
CAT_COLOR = {"road": "#b91c1c", "occupy": "#c2410c", "maintenance": "#15803d",
             "water": "#1d4ed8", "event": "#7c3aed", "etc": "#9ca3af"}
_geocache: dict[str, tuple | None] = {}


def vworld_geocode(address: str):
    if not VWORLD_KEY:
        return None
    if address in _geocache:
        return _geocache[address]
    import urllib.request, urllib.parse, ssl
    params = {"service": "address", "request": "getcoord", "version": "2.0",
              "crs": "EPSG:4326", "type": "ROAD", "address": address, "format": "json", "key": VWORLD_KEY}
    url = "https://api.vworld.kr/req/address?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=10, context=ssl.create_default_context()) as r:
            data = json.loads(r.read().decode("utf-8"))
        if data.get("response", {}).get("status") == "OK":
            p = data["response"]["result"]["point"]
            out = (float(p["y"]), float(p["x"]))  # (lat, lng)
            _geocache[address] = out
            return out
    except Exception:
        pass
    # 지번(PARCEL)도 한번 시도
    _geocache[address] = None
    return None


def gu_of(ev) -> str | None:
    blob = f"{ev.get('source_name','')} {ev.get('region','')} {ev.get('dept','')} {ev.get('title','')}"
    for g in GU_CENTROID:
        if g in blob:
            return g
    return None


def jitter(lat, lng, i):
    # 같은 구 폴백 점들이 겹치지 않게 소량 분산(약 ±150m)
    import math
    a = (i * 0.7) % (2 * math.pi)
    return lat + 0.0014 * math.cos(a), lng + 0.0017 * math.sin(a)


def geocode(events: list[dict]) -> list[dict]:
    out = []
    road_n = gu_n = 0
    for i, ev in enumerate(events):
        gu = gu_of(ev)
        roads = ev.get("roads") or []
        coord, prec = None, "none"
        if VWORLD_KEY and roads and gu:
            coord = vworld_geocode(f"서울특별시 {gu} {roads[0]}")
            if coord:
                prec = "road"; road_n += 1
        if coord is None and gu:
            coord = jitter(*GU_CENTROID[gu], i); prec = "gu"; gu_n += 1
        if coord is None:
            coord = jitter(*SEOUL_CENTER, i); prec = "city"
        out.append({**ev, "lat": coord[0], "lng": coord[1], "precision": prec, "gu": gu})
    print(f"  좌표부여: 도로단위 {road_n} / 구단위 {gu_n} / 전체 {len(out)}  (VWORLD_KEY={'있음' if VWORLD_KEY else '없음→구단위'})")
    return out


def build_map(geo: list[dict]) -> str:
    pts = [{
        "lat": g["lat"], "lng": g["lng"], "cat": g.get("category", "etc"),
        "imp": 1 if (g.get("impacts_traffic") or g.get("category") in ("road", "occupy")) else 0,
        "gu": g.get("gu") or g.get("source_name", ""),
        "title": g.get("title", ""), "road": ", ".join(g.get("roads") or []) or "—",
        "gov": g.get("gov_class", ""), "ctrl": g.get("control", ""), "url": g.get("url", ""),
        "prec": g.get("precision", ""),
    } for g in geo]
    data = json.dumps(pts, ensure_ascii=False)
    colors = json.dumps(CAT_COLOR, ensure_ascii=False)
    return """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>서울 통행정보 지도 미리보기</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
body{margin:0;font-family:"Malgun Gothic",sans-serif;}
#bar{padding:10px 14px;background:#0f172a;color:#fff;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
#bar b{font-size:15px;} #bar label{font-size:13px;cursor:pointer;}
#map{height:calc(100vh - 96px);} .lg{font-size:12px;}
.note{padding:6px 14px;background:#fef3c7;color:#92400e;font-size:12px;}
.leaflet-popup-content{font-size:13px;line-height:1.5;} .leaflet-popup-content a{color:#1d4ed8;}
</style></head><body>
<div id="bar"><b>🗺️ 서울 통행·보행 정보 지도</b>
 <label><input type="checkbox" id="impOnly"> 통행영향만</label>
 <span class="lg" id="cats"></span>
 <span class="lg" id="cnt"></span></div>
<div class="note">※ 미리보기: VWORLD_KEY가 없으면 <b>구(區) 중심 좌표</b>로 표시됩니다(점 분산). 키를 넣고 geocode_events.py를 재실행하면 <b>도로 단위</b>로 정밀화됩니다.</div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const PTS=__DATA__, COL=__COLORS__;
const map=L.map('map').setView([37.5665,126.9780],11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
const LBL={road:'도로공사',occupy:'점용',maintenance:'예초/녹지',water:'상수도',event:'행사',etc:'기타'};
let impOnly=false; const layer=L.layerGroup().addTo(map);
function draw(){layer.clearLayers();let n=0;
 PTS.forEach(p=>{ if(impOnly&&!p.imp)return;
  const m=L.circleMarker([p.lat,p.lng],{radius:p.imp?7:5,color:'#fff',weight:1,fillColor:COL[p.cat]||'#999',fillOpacity:.85});
  let html='<b>'+esc(p.title)+'</b><br>['+esc(p.gu)+'] '+LBL[p.cat]+(p.prec==='gu'?' · <i>구단위 추정</i>':'')+'<br>도로: '+esc(p.road);
  if(p.gov)html+='<br>공식분류: '+esc(p.gov); if(p.ctrl)html+='<br><b style=color:#b91c1c>통제: '+esc(p.ctrl)+'</b>';
  if(p.url)html+='<br><a href="'+p.url+'" target="_blank">원문 열기</a>';
  m.bindPopup(html); m.addTo(layer); n++; });
 document.getElementById('cnt').textContent='표시 '+n+'건';}
function esc(s){return (s||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
document.getElementById('impOnly').addEventListener('change',e=>{impOnly=e.target.checked;draw();});
document.getElementById('cats').innerHTML=Object.keys(LBL).map(k=>'<span style="color:'+(COL[k])+'">●</span>'+LBL[k]).join(' ');
draw();
</script></body></html>""".replace("__DATA__", data).replace("__COLORS__", colors)


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("events_balanced.json")
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else src.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    events = json.loads(src.read_text(encoding="utf-8"))
    print(f"입력 {len(events)}건  ({src})")
    geo = geocode(events)
    (out_dir / "events_geo.json").write_text(json.dumps(geo, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "map_preview.html").write_text(build_map(geo), encoding="utf-8")
    print("저장:", out_dir / "events_geo.json")
    print("저장:", out_dir / "map_preview.html", "(더블클릭으로 지도 확인)")


if __name__ == "__main__":
    main()
