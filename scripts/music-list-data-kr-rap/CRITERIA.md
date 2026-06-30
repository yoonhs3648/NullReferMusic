# 한국 랩/힙합 큐레이션 순위 기준 (2010–2025)

**멜론·Bugs·genie·Flo 등 국내 플랫폼 차트는 사용하지 않습니다.**  
**힙합플레이야(힙플)·힙합플레이(힙플레이)·힙합엘이·음악 비평·전문가 평가**만으로 연도별 Top 100을 산정합니다. Spotify·Billboard 등 해외 차트도 미사용.

## 범위

- **포함:** 언더/메인스트림 한국 힙합·랩, R&B(Dean, Zion.T, Crush, Heize, Colde 등), 랩 실력이 인정되는 아이돌 래퍼(G-Dragon, Zico, Bobby, Mino, B.I 등)
- **배제:** 순수 K-pop 아이돌 곡(보컬·댄스 중심, 랩 파트만 있는 수록곡 등)
- **장르 컬럼:** `한국 랩/힙합` 고정

## 종합 점수 (100점)

| 항목 | 비중 | 설명 |
|------|------|------|
| 힙플·힙플레이·힙엘 연간 호평 | 40% | 연간 베스트·토론·추천 글 빈도, 앨범 오브 더 이어급 커뮤니티 합의 |
| 전문가·비평 평가 | 30% | 음악 매체·비평가 리뷰, 연간 앨범/EP 평가 |
| 힙합 씬·문화 임팩트 | 20% | SMTM 우승·언더 대표곡, THURSDAY CLUB·MADE IN SEOUL 등 씬 기준 |
| 작품성·장르 기여 | 10% | 실험성, 프로덕션·랩 기술, 후대 아티스트에 미친 영향 |

## 발매 연도 (필수)

- 싱글 → 싱글 발매 연도, `album` = `""`
- 앨범 수록 → 앨범 발매 연도, `album` = 공식 앨범명
- 선행 싱글 후 앨범 수록 → **앨범 발매 연도**에 기록
- 전년 발매곡의 당해 인기 → 전년도에만 포함

## 데이터 규칙

- artist+title 전 연도·연도 내 **유일**
- 연도당 아티스트 **최대 2곡**, **최소 45명**
- 제목·앨범·아티스트 = **Melon 등 공식 표기** (임의 영어 번역 금지)

## 빌드

```powershell
cd C:\NullReferMusic\scripts\music-list-data-kr-rap\_gen\catalog_v2
python rebuild_community.py
python boost_hangul_recent.py
cd ..
python rebuild_v2.py
cd ..
node build.mjs
cd C:\NullReferMusic
node scripts/generate-music-list-seed.mjs
```

`rebuild_community.py`는 동일 1,600곡 풀을 유지한 채 **커뮤니티·전문가 평가 순**으로만 재정렬합니다.
