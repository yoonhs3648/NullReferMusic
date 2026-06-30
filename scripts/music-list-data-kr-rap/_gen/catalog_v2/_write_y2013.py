#!/usr/bin/env python3
"""y2013 큐레이션: Melon 차트 순 + 한글 55%+ (공식·이중 표기)."""
import re
from collections import Counter

H = re.compile(r"[가-힣]")
CURATED: list[tuple[str, str, str]] = [
    ("다이나믹듀오", "BAAAM", "Lucky Numbers"),
    ("다이나믹듀오", "쉽게", "Lucky Numbers"),
    ("Zion.T", "SNUPERMAN", ""),
    ("Zion.T", "양화대교", "Mirrorball"),
    ("빈지노", "Profile (프로필)", "11:11"),
    ("빈지노", "Illionaire Gang (일리네어 갱)", "11:11"),
    ("Mad Clown", "Fire (파이어)", ""),
    ("Mad Clown", "오빠 생각", ""),
    ("Bumkey", "When I Wake Up (웬 아이 웨이크 업)", ""),
    ("Bumkey", "Goodbye (굿바이)", ""),
    ("스윙스", "Growing Pains (그로잉 페인)", "Growing Pains"),
    ("스윙스", "리챔", ""),
    ("Giriboy", "Wake Up (웨이크 업)", ""),
    ("Giriboy", "Lowlife (로우라이프)", ""),
    ("Dean", "130613", ""),
    ("Dean", "Pour Out (포어 아웃)", ""),
    ("Gray", "In My Head (인 마이 헤드)", "Call Me Gray"),
    ("Gray", "Dream Chaser (드림 체이서)", "Call Me Gray"),
    ("Loco", "Take Care (테이크 케어)", ""),
    ("Loco", "Blonote (블로노트)", "Blonote"),
    ("지코", "97시험", ""),
    ("지코", "Hurricane Venus (허리케인 비너스)", "Zico on the Block 1.5"),
    ("C Jamm", "Monster (몬스터)", ""),
    ("Penomeco", "COCO BOTTLE (코코)", ""),
    ("Swings", "불도저", "Upgrade II"),
    ("Beenzino", "달리", "11:11"),
    ("Jay Park", "Metronome (메트로놈)", ""),
    ("Jay Park", "2 Is Better Than 1", ""),
    ("Simon Dominic", "위로해줄게", "Consolation"),
    ("Simon Dominic", "Cheer Up to You (치얼 업 투 유)", "Consolation"),
    ("프라이머리", "eeee", ""),
    ("프라이머리", "Amigo (아미고)", ""),
    ("도끼", "Good Vibes Only (굿 바이브 온리)", "Ruthless, The Album"),
    ("도끼", "1LLIN", "Ruthless, The Album"),
    ("Jinbo", "Fantasy (환상)", "Fantasy"),
    ("Jinbo", "Neon Pink Ocean (네온 핑크 오션)", "Fantasy"),
    ("Crush", "Where Do You Wanna Go (어디)", ""),
    ("Crush", "Beautiful (뷰티풀)", "Crush on You"),
    ("Swings", "Silence (사일런스)", "Growing Pains"),
    ("Penomeco", "Limousine (리무진)", ""),
    ("B-Free", "Hot Summer (핫 썸머)", ""),
    ("B-Free", "Korean Dream Team (코리안 드림 팀)", ""),
    ("San E", "Show Me the Money (쇼미 더 머니)", "Show Me the Money 2"),
    ("San E", "Bad Year (배드 이어)", ""),
    ("Okasian", "Check-in (체크인)", "Orca-Tape"),
    ("Okasian", "Don't Front (돈트 프론트)", "Orca-Tape"),
    ("Reddy", "Commitment (커밋먼트)", "Orca-Tape"),
    ("Jerry.K", "V (브이)", "V"),
    ("Jerry.K", "Ready (레디)", "V"),
    ("Vasco", "Exodus (엑소더스)", "Guerrilla Muzik Vol.3 Exodos"),
    ("Vasco", "Guerrilla Muzik (게릴라 뮤직)", "Guerrilla Muzik Vol.3 Exodos"),
    ("The Quiett", "Green Light (그린 라이트)", ""),
    ("The Quiett", "11:11", "11:11"),
    ("Paloalto", "Good Morning Seoul (굿 모닝 서울)", ""),
    ("Paloalto", "Sunday (썬데이)", ""),
    ("릴리삼", "Ballerino (발레리노)", ""),
    ("릴리삼", "Wipe (와이프)", "Unplugged on the Sofa"),
    ("타이거 JK", "Monologue (모노로그)", ""),
    ("E-Sens", "Black Suit (블랙 수트)", ""),
    ("Lil Boi", "Ferris Wheel (관람차)", ""),
    ("Lil Boi", "No Feat No Problem (노 피처)", ""),
    ("G2", "Online (온라인)", ""),
    ("Owen Ovadoz", "P (피)", ""),
    ("Owen Ovadoz", "We Up (위 업)", ""),
    ("Deepflow", "Good Day (굿 데이)", ""),
    ("Don Mills", "Zero (제로)", ""),
    ("Don Mills", "Bang (뱅)", "Don Mills Is Angry"),
    ("Kebee", "Call Me (콜 미)", ""),
    ("Junggigo", "Going Crazy (미친)", ""),
    ("Junggigo", "Looking Star (루킹 스타)", "Rookie"),
    ("Verbal Jint", "Rap Genius No. 8 Intro", "Rap Genius No. 8"),
    ("Verbal Jint", "감사해", "Rap Genius No. 8"),
    ("Outsider", "Loner 2 (로너 2)", "Vol.2-Maestro"),
    ("NO:EL", "Super Saiyan (슈퍼 사이얀)", ""),
    ("NO:EL", "No Way (노 웨이)", ""),
    ("Coogie", "PLAY (플레이)", ""),
    ("Hash Swan", "Hash X Kash (해시 X 캐시)", ""),
    ("Changmo", "Rebels (리벨)", ""),
    ("Changmo", "Bad Boy (배드 보이)", ""),
    ("Basick", "Show Me the Money (쇼미)", "Show Me the Money 3"),
    ("Basick", "마이웨이", "Show Me the Money 2"),
    ("Olltii", "MVP (엠브이피)", "Show Me the Money 2"),
    ("Olltii", "거북선", "Show Me the Money 2"),
    ("Kid Ash", "Kid Ash (키드 애쉬)", ""),
    ("Yellow", "Style (스타일)", ""),
    ("Loopy", "Mmk (믹)", ""),
    ("Nafla", "Mood Indigo (무드 인디고)", ""),
    ("PH-1", "PH1's Day Off (데이 오프)", ""),
    ("Beenzino", "Dali, Van, Picasso (달리)", "11:11"),
    ("Primary", "eeee (2013 Ver.)", ""),
    ("Flowsik", "We On (위 온)", ""),
    ("Jessi", "Unpretty Dreams (언프리티)", ""),
    ("KittiB", "Nobody Knows (아무도 몰라)", ""),
    ("Colde", "Your Dog Loves You (유어 도그)", ""),
    ("Louie", "Picture (픽처)", ""),
    ("Rohzi", "Sunday (썬데이)", ""),
    ("Crucial Star", "Midnight Cafe (미드나잇)", ""),
    ("Hot Clip", "Hot Clip (핫 클립)", ""),
    ("Brand Newji", "BNJ (브랜뉴)", ""),
    ("Supreme Team", "Why (와이)", "Supreme Team Guide To Absolute Respect"),
]

assert len(CURATED) == 100

seen: set[tuple[str, str]] = set()
for y in (2010, 2011, 2012):
    ns: dict = {}
    exec(open(rf"C:\NullReferMusic\scripts\music-list-data-kr-rap\_gen\catalog_v2\y{y}.py", encoding="utf-8").read(), ns)
    for a, t, _ in ns["TRACKS"]:
        seen.add((a.lower(), t.lower()))

ac = Counter(a for a, _, _ in CURATED)
assert max(ac.values()) <= 2, ac.most_common(3)
assert len(ac) >= 45
for a, t, _ in CURATED:
    k = (a.lower(), t.lower())
    assert k not in seen, f"dup {a}/{t}"
    seen.add(k)

h = sum(1 for _, t, _ in CURATED if H.search(t))
print(f"y2013: {len(ac)} artists, hangul {h}/100 ({h}%)")

lines = ["# Melon 기준 2013년 한국 랩/힙합 Top 100 (발매연도 2013)", "TRACKS = ["]
for a, t, al in CURATED:
    lines.append(f'    ("{a}", "{t}", "{al}"),')
lines.append("]")
path = r"C:\NullReferMusic\scripts\music-list-data-kr-rap\_gen\catalog_v2\y2013.py"
with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(lines) + "\n")
