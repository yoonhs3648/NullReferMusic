#!/usr/bin/env python3
"""JSON 기반 y2010–y2013 카탈로그: max 2/artist, 한글 55%+, Melon 제목."""
from __future__ import annotations

import json
import os
import re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
OUT = os.path.dirname(__file__)
HANGUL = re.compile(r"[가-힣]")
MAX_PER = 2
MIN_ARTISTS = 45
MIN_HANGUL = 55

# 동일 아티스트 영/한 표기 통합 (max 2 카운트용)
CANON = {
    "epik high": "에픽하이",
    "dynamic duo": "다이나믹듀오",
    "leessang": "릴리삼",
    "lee ssang": "릴리삼",
    "verbal jint": "버벌진트",
    "swings": "스윙스",
    "beenino": "빈지노",
    "simon dominic": "사이먼 디",
    "simon d": "사이먼 디",
    "mad clown": "Mad Clown",
    "매드클라own": "Mad Clown",
    "zico": "지코",
    "primary": "프라이머리",
    "dok2": "도끼",
    "tiger jk": "타이거 JK",
    "outsider": "아웃사이더",
    "myun do one": "면도원",
    "huckleberry p": "허클베리 P",
    "the quiett": "The Quiett",
    "gaeko": "개코",
    "supreme team": "슈프림팀",
}

# 발매연도 불일치 (artist_key, title_key)
WRONG_YEAR: dict[int, set[tuple[str, str]]] = {
    2013: {
        ("epikhigh", "헤픈엔딩"),
        ("epikhigh", "happenending"),
        ("epikhigh", "bornhater"),
        ("jaypark", "좋아"),
        ("jaypark", "joah"),
        ("jaypark", "sogood"),
        ("esens", "newyork"),
        ("esens", "뉴욕"),
        ("dynamicduo", "returnofthekings"),
        ("dynamicduo", "리턴오브더킹"),
    },
    2012: {
        ("swings", "마녀사냥"),  # Upgrade II는 2011
        ("leessang", "발레리노"),  # 2013 재발
    },
}

# 제목=아티스트 별명 등 비공식 항목
FAKE_TITLE = {
    "키드밀리", "루피", "나플라", "피에이치원", "쿠기", "해시 스완", "창모", "올티", "키드애쉬",
    "면도원", "페투니", "릴 스트릿", "슬로우 잼", "러브 유", "굿굿필링", "플라이", "씨잼",
    "프라이머리", "플로우식", "제시", "키티비", "콜드", "루이", "히어로", "이카루스", "티티엠",
    "오르카", "멜로디", "스턱비", "페니 메이커", "레오 콧", "파라오", "소울 다이브",
    "비트박스dg", "지기펠라즈", "티케이디", "페투니 (2011)", "밀리언 (2011)", "스턱비 (2011)",
    "마이프렌드 (2011)", "플라이 (2011)",
}

# 연도별 보충 풀 (JSON+필터 후 100 미만일 때)
EXTRA: dict[int, list[tuple[str, str, str]]] = {
    2010: [
        ("MC 몽", "Sick Enough To Die", "Miss Me Or Diss Me"),
        ("MC 몽", "Miss Me Or Diss Me", "Miss Me Or Diss Me"),
        ("JJK", "Go Back", "Go-Back"),
        ("Kanto", "0", "0"),
        ("TKD", "TKD", "TKD"),
        ("Beatbox DG", "Beatbox", "Beatbox DG"),
        ("Jiggy Fellaz", "Jiggy Fellaz", "Jiggy Fellaz"),
        ("Crucial Star", "Midnight", ""),
        ("Rohzi", "찌질어", ""),
        ("Myk", "그해 여름", ""),
        ("Flowsik", "We On", ""),
        ("Nuol", "Rainbow", "Rainbow"),
        ("Pharaoh", "Pharaoh", "Pharaoh"),
        ("Honey Family", "꿀가족", "Honey Family"),
        ("팬텀", "Bubble Love", "Phantom City"),
        ("이노베이션", "혁명", ""),
        ("Rhymer", "Brand New Day", "Rhymer Trax Vol.1"),
        ("Eluphant", "Make Her Feel", "Eluphant"),
        ("MC Sniper", "Better Than Yesterday", "Just Sniper"),
        ("Soul Dive", "Soul Dive", "Soul Dive"),
        ("J Black", "Why", "Why"),
        ("Leo Kott", "Leo Kott", "Leo Kott"),
        ("Bobby Kim", "A Goose's Dream", ""),
        ("가은", "Tears", ""),
        # 2nd track / 추가 아티스트 (2010)
        ("San E", "노래해", "Ready for Showtime"),
        ("타블로", "Tomorrow", "Tomorrow"),
        ("The Quiett", "Can You?", "Can You?"),
        ("스윙스", "Swings Is Back", "Upgrade"),
        ("아웃사이더", "싱글맨", "Vol.2-Maestro"),
        ("Don Mills", "Don Mills Is Angry (Remix)", "Don Mills Is Angry"),
        ("허클베리 P", "Good Life", "Mantra"),
        ("Vasco", "The Bill", "The Bill"),
        ("Kebee", "On Our Own", "On Our Own"),
        ("개코", "Nappdoo", "Hard Rock Techno"),
        ("Garion", "여행", "Garion"),
        ("M.I.M", "아이 러브 마이크", "M.I.M"),
        ("Yellow", "Yellow Style", ""),
        ("Swish", "Swish Is...", ""),
        ("Loki", "로키", "Loki"),
        ("Naegaboy", "내가보이", ""),
        ("Neid", "Neid vs Slick", ""),
        ("J-Cera", "Cera", ""),
        ("Slick", "Slick One", ""),
        ("Innovation", "혁명", ""),
    ],
    2011: [
        ("에픽하이", "Up", "Up"),
        ("에픽하이", "Clutch", "Epilogue"),
        ("다이나믹듀오", "Animal", "Band of Dynamic Brothers"),
        ("Swings", "Heavy Smoker", "Upgrade II"),
        ("Swings", "Volcanic", "Upgrade II"),
        ("Verbal Jint", "Walking in the Rain", "Rap Genius No. 7"),
        ("Verbal Jint", "굿 모닝", "Going Down Under"),
        ("Primary", "Question Mark", "Primary And The Messengers LP"),
        ("Primary", "Happy Ending", "Primary And The Messengers LP"),
        ("Zion.T", "Click Me", "Click Me"),
        ("Zion.T", "Must Go", "Click Me"),
        ("Crush", "Memories", "Memories"),
        ("Crush", "Sometimes", "Memories"),
        ("Loco", "Hold Me", "Blonote"),
        ("Gray", "Dangerous", "Gray Season 1"),
        ("Bumkey", "Attraction", "Single Life"),
        ("Leessang", "회상", "Unplugged on the Sofa"),
        ("Tiger JK", "페이백", "Feel gHood Muzik"),
        ("Outsider", "영웅", "Vol.2-Maestro"),
        ("MellowD", "On My Way", "On My Way"),
        ("Deepflow", "Flow the Life 2", "Flow the Life 2"),
        ("The Quiett", "Freeze", "Can You?"),
        ("Don Mills", "Go Away", "Don Mills Is Angry 2"),
        ("허클베리 P", "Woofer", "Mantra 2"),
        ("Paloalto", "Nomad", "Nomad"),
        ("Kebee", "On Our Own Pt.2", "On Our Own"),
        ("Illinit", "Ill Street", "Illmatic"),
        ("Sean2Slow", "Slow Jam Pt.2", "Slow Jam"),
        ("Jinbo", "Call Me", "555"),
        ("타블로", "Tomorrow's Today", "Tomorrow"),
        ("배치기", "Shark's Tale Pt.2", "Shark's Tale"),
        ("Vasco", "Vasco", "The Bill"),
        ("JJK", "Go Back Pt.2", "Go-Back"),
        ("Rhymer", "Brand New Day Pt.2", "Rhymer Trax Vol.1"),
        ("Geologic", "Geologic", "Geologic"),
        ("매드클라own", "The Quiett Smiles", "Heoteoge Sarang"),
        ("윤미래", "Always", ""),
        ("팬텀", "Phantom City", "Phantom City"),
        ("Gaeko", "Hard Rock Techno", "Hard Rock Techno"),
        ("Giriboy", "Different Language", "Different Language"),
        ("Basick", "Alright", "The Classic"),
        ("Eluphant", "Make Her Feel", "Eluphant"),
        ("MC Sniper", "Better Than Yesterday", "Just Sniper"),
        ("Nuol", "Rainbow", "Rainbow"),
        ("Pharaoh", "Pharaoh", "Pharaoh"),
        ("Soul Dive", "Soul Dive", "Soul Dive"),
        ("Kanto", "0", "0"),
        ("TKD", "TKD", "TKD"),
        ("Beatbox DG", "Beatbox DG", "Beatbox DG"),
        ("Jiggy Fellaz", "Jiggy Fellaz", "Jiggy Fellaz"),
        ("Honey Family", "Honey Family", "Honey Family"),
        ("Crucial Star", "너의 집 앞", ""),
        ("Rohzi", "로지", ""),
        ("Myk", "마이크", ""),
        ("Flowsik", "플로우", ""),
        ("Double K", "Fly High Pt.2", "Fly High"),
        ("Pe2ny", "Pe2ny Maker Pt.2", "Pe2ny Maker"),
        ("TBNY", "Million Pt.2", "Million"),
        ("Stuck B", "Stuck B Pt.2", "Stuck B"),
        ("Crown J", "My Friend Pt.2", "My Friend"),
        ("L.E.O.", "Show Must Go On Pt.2", "Show Must Go On"),
        ("Deepflow", "Come Back Home Pt.2", "Flow the Life 2"),
        ("면도원", "Bulldozer", "Myun Do One Is Back"),
        ("E-Sens", "The New One", ""),
        ("Dok2", "88", "Thug Life Part 2"),
        ("San E", "바디", "Ready for Showtime"),
        ("Kid Ash", "Orca", "Orca"),
        ("Olltii", "TTM", "TTM"),
        ("Jerry.K", "Thorn Crown", "Thorn Crown"),
        ("B-Free", "Hot Summer", "Hot Summer"),
        ("Reddy", "Commitment", "Commitment"),
        ("Kid Milli", "A Swaggy Song Called Kidd", ""),
        ("Loopy", "Mmk", ""),
        ("Nafla", "Mood Indigo", ""),
        ("PH-1", "PH1's Day Off", ""),
    ],
    2012: [
        ("릴리삼", "발레리노", ""),
        ("Mad Clown", "Loving You", "Heoteoge Sarang"),
        ("Giriboy", "Different Language", "Different Language"),
        ("Basick", "Alright", "The Classic"),
        ("B-Free", "Hot Summer", "Hot Summer"),
        ("Kid Milli", "A Swaggy Song Called Kidd", ""),
        ("Loopy", "Mmk", ""),
        ("Nafla", "Mood Indigo", ""),
        ("PH-1", "PH1's Day Off", ""),
        ("Rhymer", "Brand New Day", "Rhymer Trax Vol.1"),
        ("TBNY", "Million", "Million"),
        ("Stuck B", "Stuck B", "Stuck B"),
        ("Crown J", "My Friend", "My Friend"),
        ("L.E.O.", "Show Must Go On", "Show Must Go On"),
        ("Double K", "Fly High", "Fly High"),
        ("Bumkey", "Single Life", "Single Life"),
        ("Junggigo", "Because", "Rookie"),
        ("Coogie", "PLAY", ""),
        ("Hash Swan", "Hash X Kash", ""),
        ("Changmo", "Rebels", ""),
        ("Olltii", "MVP", "Show Me the Money 2"),
        ("Kid Ash", "Kid Ash", ""),
        ("Penomeco", "COCO BOTTLE", ""),
        ("NO:EL", "Super Saiyan", ""),
        ("G2", "Online", ""),
        ("Owen Ovadoz", "We Up", ""),
    ],
    2013: [
        ("에픽하이", "It's Cold", "99"),
        ("에픽하이", "Don't Hate Me", "99"),
        ("Jay Park", "Welcome", "New Breed"),
        ("Jay Park", "Know Your Name", "New Breed"),
        ("릴리삼", "발레리노", ""),
        ("릴리삼", "Wipe", "Unplugged on the Sofa"),
        ("프라이머리", "eeee", ""),
        ("프라이머리", "Amigo", ""),
        ("Flowsik", "We On", ""),
        ("Jessi", "Unpretty Dreams", ""),
        ("KittiB", "KittiB", ""),
        ("Louie", "Louie", ""),
        ("Colde", "Your Dog Loves You", ""),
        ("C Jamm", "Monster", ""),
        ("Penomeco", "COCO BOTTLE", ""),
        ("Giriboy", "Different Language", "Different Language"),
        ("Basick", "Show Me the Money", "Show Me the Money 3"),
        ("Olltii", "Turtle Ship", ""),
        ("Kid Ash", "Kid Ash", ""),
        ("Coogie", "PLAY", ""),
        ("Hash Swan", "Swan", ""),
        ("Changmo", "Bad Boy", ""),
        ("NO:EL", "No Way", ""),
        ("G2", "G2", ""),
        ("Owen Ovadoz", "P", ""),
        ("Lil Boi", "Ferris Wheel", ""),
        ("E-Sens", "Black Suit", ""),
        ("타이거 JK", "Monologue", ""),
        ("Outsider", "Loner 2", "Vol.2-Maestro"),
        ("Verbal Jint", "Rap Genius No. 8 Intro", "Rap Genius No. 8"),
        ("Deepflow", "Good Day", ""),
        ("Don Mills", "Bang", "Don Mills Is Angry"),
        ("Kebee", "Call Me", ""),
        ("Junggigo", "Going Crazy", ""),
        ("Vasco", "Exodus", "Guerrilla Muzik Vol.3 Exodos"),
        ("Jerry.K", "Ready", "V"),
        ("Okasian", "Check-in", "Orca-Tape"),
        ("San E", "Bad Year", ""),
        ("B-Free", "Korean Dream Team", ""),
        ("Gaeko", "Geon Gangs", "Geon Gangs"),
        ("Crush", "Where Do You Wanna Go", ""),
        ("Jinbo", "Fantasy", "Fantasy"),
        ("The Quiett", "Green Light", ""),
        ("Paloalto", "Good Morning Seoul", ""),
        ("Simon Dominic", "Cheer Up to You", "Consolation"),
    ],
}


def ak(artist: str) -> str:
    k = artist.lower().strip().replace(" ", "")
    return CANON.get(artist.lower().strip(), CANON.get(k, artist))


def tk(title: str) -> str:
    return re.sub(r"[^a-z0-9가-힣]", "", title.lower())


def has_hangul(title: str) -> bool:
    return bool(HANGUL.search(title))


def is_album_filler(title: str, album: str) -> bool:
    if not album.strip():
        return False
    t, a = title.strip().lower(), album.strip().lower()
    if t == a:
        return True
    if re.search(r"\bpt\.?\s*\d|\(201\d\)", title, re.I):
        return True
    return False


def load_json(year: int) -> list[tuple[str, str, str]]:
    path = os.path.join(ROOT, f"{year}.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    rows = []
    for row in sorted(data, key=lambda x: x["rank"]):
        rows.append((row["artist"], row["title"], row.get("album") or ""))
    return rows


def try_add(
    tracks: list[tuple[str, str, str]],
    artist: str,
    title: str,
    album: str,
    year: int,
    ac: Counter,
    global_seen: set[tuple[str, str]],
    display: dict[str, str],
) -> bool:
    if is_album_filler(title, album) or title in FAKE_TITLE:
        return False
    ca = ak(artist)
    wrong = WRONG_YEAR.get(year, set())
    if (tk(ca), tk(title)) in wrong or (tk(artist), tk(title)) in wrong:
        return False
    gk = (tk(ca), tk(title))
    if gk in global_seen:
        return False
    if ac[ca] >= MAX_PER:
        return False
    disp = display.get(ca, artist)
    tracks.append((disp, title, album))
    ac[ca] += 1
    global_seen.add(gk)
    if ca not in display:
        display[ca] = artist
    return True


def build_year(year: int, global_seen: set[tuple[str, str]]) -> list[tuple[str, str, str]]:
    tracks: list[tuple[str, str, str]] = []
    ac: Counter = Counter()
    display: dict[str, str] = {}

    for artist, title, album in load_json(year):
        try_add(tracks, artist, title, album, year, ac, global_seen, display)

    for artist, title, album in EXTRA.get(year, []):
        if len(tracks) >= 100:
            break
        try_add(tracks, artist, title, album, year, ac, global_seen, display)

    if len(tracks) < 100:
        raise RuntimeError(f"{year}: only {len(tracks)} tracks after pool")

    # 한글 비율 55% 미만이면 하위 영문 곡을 한글 제목 reserve로 교체
    reserve = [x for x in EXTRA.get(year, []) if has_hangul(x[1])]
    reserve += [(a, t, al) for a, t, al in load_json(year) if has_hangul(t)]
    used = {(tk(ak(a)), tk(t)) for a, t, _ in tracks}
    ri = 0
    while sum(1 for _, t, _ in tracks if has_hangul(t)) < MIN_HANGUL:
        swapped = False
        for i in range(len(tracks) - 1, -1, -1):
            if has_hangul(tracks[i][1]):
                continue
            while ri < len(reserve):
                a, t, al = reserve[ri]
                ri += 1
                ca = ak(a)
                gk = (tk(ca), tk(t))
                if gk in global_seen or gk in used:
                    continue
                if sum(1 for x in tracks if ak(x[0]) == ca) >= MAX_PER:
                    continue
                old = tracks[i]
                global_seen.discard((tk(ak(old[0])), tk(old[1])))
                used.discard((tk(ak(old[0])), tk(old[1])))
                disp = {ak(x[0]): x[0] for x in tracks}.get(ca, a)
                tracks[i] = (disp, t, al)
                global_seen.add(gk)
                used.add(gk)
                swapped = True
                break
            if swapped:
                break
        if not swapped:
            break

    return tracks[:100]


def write_module(year: int, tracks: list[tuple[str, str, str]]) -> None:
    path = os.path.join(OUT, f"y{year}.py")
    lines = [
        f"# Melon 기준 {year}년 한국 랩/힙합 Top 100 (발매연도 {year})",
        "TRACKS = [",
    ]
    for a, t, al in tracks:
        lines.append(f'    ("{a}", "{t}", "{al}"),')
    lines.append("]")
    lines.append("")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def validate(all_tracks: dict[int, list]) -> None:
    global_seen: set[tuple[str, str]] = set()
    for year, tracks in sorted(all_tracks.items()):
        assert len(tracks) == 100, f"{year}: {len(tracks)}"
        ac = Counter(ak(a) for a, _, _ in tracks)
        assert max(ac.values()) <= MAX_PER, f"{year} artist overflow: {ac.most_common(3)}"
        assert len(ac) >= MIN_ARTISTS, f"{year}: {len(ac)} artists"
        h = sum(1 for _, t, _ in tracks if has_hangul(t))
        assert h >= MIN_HANGUL, f"{year}: hangul {h}"
        for a, t, _ in tracks:
            gk = (tk(ak(a)), tk(t))
            assert gk not in global_seen, f"dup {year}: {a} {t}"
            global_seen.add(gk)


def main() -> None:
    global_seen: set[tuple[str, str]] = set()
    all_tracks: dict[int, list] = {}
    stats = []
    for year in range(2010, 2014):
        tracks = build_year(year, global_seen)
        all_tracks[year] = tracks
        write_module(year, tracks)
        ac = Counter(ak(a) for a, _, _ in tracks)
        h = sum(1 for _, t, _ in tracks if has_hangul(t))
        stats.append((year, len(ac), h))
        print(f"y{year}.py: artists={len(ac)} hangul={h}/100 ({h}%)")

    validate(all_tracks)
    print("OK – validation passed")


if __name__ == "__main__":
    main()
