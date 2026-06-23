# ③ 지도 연동 — 준비 자료 (앱 폴더 확인 전 사용 가이드)

수집·정제된 통행 이벤트(`events_balanced.json`)를 **지도 위에 표시**하기 위한 준비물입니다.
앱 코드 위치를 알려주시면 이 파이프라인을 앱에 맞게 연결합니다. 지금은 **단독으로도 동작**합니다.

## 들어있는 것
| 파일 | 설명 |
|---|---|
| `geocode_events.py` | 이벤트의 도로/구간 텍스트 → 좌표(WGS84) 부여 → `events_geo.json` + `map_preview.html` 생성 |
| `map_preview.html` | (생성물) 브라우저로 더블클릭하면 **서울 지도 위에 점 표시**. 분류 색상·‘통행영향만’ 필터 |
| `events_geo.json` | (생성물) 앱이 그대로 소비할 좌표 포함 데이터(lat/lng/precision/category/통제/원문…) |

## 2단계 정밀도 설계 (키 없이도 바로 보임)
- **키 없음** → 25개 자치구 **중심 좌표로 폴백**(구 단위, 점 분산). 즉시 지도 확인 가능.
- **VWORLD_KEY 설정** → 도로명/구간을 **VWorld Geocoder로 도로 단위 정밀화**.

## 실행
```bat
:: (선택) 도로 단위 정밀화 — VWorld 키 발급 후
set VWORLD_KEY=발급받은키
python geocode_events.py events_balanced.json
:: → events_geo.json, map_preview.html 생성. map_preview.html 더블클릭.
```

## 지도/지오코딩 키 (둘 다 무료·당일)
- **VWorld**(국토부): 지도 + 지오코딩. https://www.vworld.kr → 인증키 발급(요청 도메인 등록 필요).
- **도로명주소 API(juso, 행안부)**: 좌표 **저장용 권장**(VWorld 지오코더는 저장금지 조항). 좌표가 EPSG:5179라 `pip install pyproj` 변환 필요.
- 회피(경로) 라우팅은 상용 API로 불가 → 표준노드링크/OSM + Valhalla 셀프호스팅(후순위).

## 앱 연동 포인트 (앱 폴더 확인 후)
1. 백엔드: 크롤 결과 → `geocode_events.py` 로직을 서비스화(주기 실행) → `events_geo.json`을 API로 제공.
2. 프런트: 지도(VWorld JS 또는 Leaflet/Kakao)에서 `events_geo.json`을 마커/폴리라인으로 렌더(분류 색상·필터·팝업은 `map_preview.html` 참고).
3. 알림/회피: `impacts_traffic`/`category`/좌표를 기준으로 근접 알림·경로 회피에 활용(앞선 설계의 Phase1).

> ⚠️ 좌표 저장 시 VWorld 지오코더(data.go.kr판) 저장금지 조항 주의 → 저장용은 juso 좌표 사용 권장.
