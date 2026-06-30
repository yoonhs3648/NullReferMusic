#!/usr/bin/env python3
"""연도 풀에서 전역 중복 트랙 제거 후 OK 트랙만 유지."""
from __future__ import annotations

import os
import re

from build_master import HERE, load_global_exclude, load_module, norm_key
from gen_spare import build_through

EXTRA_BY_YEAR: dict[int, list[tuple[str, str, str]]] = {
    2023: [
        ("Heize", "Perhaps Happy Ending (아마도 해피 엔딩)", "Last Winter"),
        ("Heize", "From Autumn to Winter (가을에서 겨울로)", "Last Winter"),
        ("Simon Dominic", "GOTT", "GOTT"),
        ("Simon Dominic", "make her dance (메이크 허 댄스)", "GOTT"),
        ("Huckleberry P", "Mantra 6", "Mantra 6"),
        ("Don Mills", "Don Mills Is Angry 6", "Don Mills Is Angry 6"),
        ("Deepflow", "Flow the Life 6", "Flow the Life 6"),
        ("Blase", "City Life", ""),
        ("Ahn Se-min", "물", "Show Me the Money 11"),
        ("Bluso", "Fade Away", ""),
        ("LeyonC", "Fall", ""),
        ("Hyunsang", "Take Care", ""),
        ("Woo", "Rain Drop", "Rain Drop"),
        ("Rohann", "Sunday", ""),
        ("Thama", "Long Time No See", "Long Time No See"),
        ("Knoxx", "Knoxx", ""),
        ("Polodared", "Multiverse", ""),
        ("Hej!", "Drive", ""),
        ("Futuristic Swaver", "Villain", ""),
        ("Hodaky", "Yellow", ""),
        ("Chillin Homie", "Good Day", ""),
        ("Uneducated Kid", "UNEDUCATED KID", ""),
        ("Superbee", "Superbee", ""),
        ("Basick", "Nice Day (나이스 데이)", "The Classic"),
        ("Mad Clown", "Maximum", "Potato"),
        ("Tabber", "RUN CHICKEN (런 치킨)", "RUN CHICKEN"),
        ("Khundi Panda", "Medicine (약)", "Medicine"),
        ("Roh Yun Ha", "IF I (이프 아이)", "Show Me the Money 10"),
        ("Killagramz", "Good Morning (굿 모닝)", "Good Morning"),
        ("Paul Blanco", "Summer (썸머)", "Summer"),
        ("Wonstein", "10 Minutes (10분)", "Show Me the Money 10"),
        ("Trade L", "Leave It (두고 가)", "Show Me the Money 10"),
        ("BE'O", "Luxury (럭셔리)", "Show Me the Money 10"),
        ("Hanhae", "003", "003"),
        ("Okasian", "Celebration", ""),
        ("Nucksal", "Skill", ""),
        ("Penomeco", "Famous", ""),
        ("Code Kunst", "Rain (비)", "Code Kunst Archive Pack 02"),
        ("YUMDDA", "Shake (쉐이크)", "I'm Good"),
        ("Illinit", "Real Talk Live (리얼 토크)", ""),
        ("B-Free", "Best Seller (베스트 셀러)", "Best Seller"),
        ("Vasco", "The Vasco", "The Vasco"),
        ("Outsider", "Vol.2-Maestro 4", "Vol.2-Maestro 4"),
        ("G2", "G2 (지투)", "G2"),
        ("Cheetah", "I'll Be Back (아일 비 백)", ""),
        ("J'Kyun", "Fly Away (플라이 어웨이)", "Ready to Fly"),
        ("Myun Do One", "Bulldozer", "Myun Do One Is Back"),
        ("Jerry.K", "V", "V"),
        ("Bumkey", "Single Life", "Single Life"),
        ("Junggigo", "Rookie", "Rookie"),
        ("E-Sens", "이상형", "The Anecdote"),
        ("San E", "a SONG of ICE and FIRE", "a SONG of ICE and FIRE"),
        ("Rhymer", "Brand New Day", "Rhymer Trax Vol.1"),
        ("Double K", "Fly High", "Fly High"),
        ("Pe2ny", "Pe2ny Maker", "Pe2ny Maker"),
        ("Sean2Slow", "Slow Jam", "Slow Jam"),
        ("MC Meta", "On My Own", "The Blue Printz"),
        ("Geologic", "Blaze", "Blaze"),
        ("Mighty Mouth", "San", "San"),
        ("Skull", "I'm Your Man", "I'm Your Man"),
        ("Phantom", "Bubble Love", "Phantom City"),
        ("MellowD", "On My Way", "On My Way"),
        ("Kid Ash", "Orca-Tape", "Orca-Tape"),
        ("C Jamm", "RED", ""),
        ("D.Ark", "Genius", "Genius"),
        ("BewhY", "Day Day", "The Movie Star"),
        ("Flowsik", "We On (위 온)", "Show Me the Money 777"),
        ("Reddy", "THINK (띵)", "Show Me the Money 777"),
        ("KittiB", "Nobody Knows", "Show Me the Money 777"),
        ("Olltii", "Creative Control", "Creative Control"),
        ("Kid Milli", "Cliché (클리셰)", "Cliché"),
        ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
        ("Ash Island", "Floating", "ISLAND"),
        ("HAON", "You and I", "Melodies"),
        ("Leellamarz", "Ale", "Marz & Ale"),
        ("Nafla", "understand", "understand"),
        ("Loopy", "ON THE Radar", "ON THE Radar"),
        ("Jay Park", "Forget About Tomorrow", "Forget About Tomorrow"),
        ("Loco", "Hello (헬로)", "Hello"),
        ("Gray", "summer (썸머)", "summer"),
        ("Sik-K", "Bungee (번지)", "Bungee"),
        ("Dean", "Peace (피스)", "Peace"),
        ("Colde", "Star (스타)", "Star"),
        ("Swings", "Shook Ones", "Shook Ones"),
        ("Gaeko", "West Coast (웨스트 코스트)", "Redingray"),
        ("Bobby", "Lalala (라라라)", "Lalala"),
        ("Mino", "Booker (부커)", "Booker"),
        ("Tablo", "Tomorrow (내일)", "Birthday"),
        ("Code Kunst", "Buckle Up (버클 업)", "Code Kunst Archive Pack 02"),
        ("Zion.T", "Spring Dream (봄꿈)", "Zionic"),
        ("TOIL", "MAZE (메이즈)", "MAZE"),
        ("Mirani", "VANS", "Show Me the Money 8"),
        ("Koonta", "VVS", "Show Me the Money 8"),
        ("Giriboy", "on my way", "Show Me the Money 8"),
        ("Changmo", "Thrift Shop (쓰리프트 샵)", "Ghetto Kids"),
        ("Flowsik", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
        ("BIG Naughty", "Vogue", "Vogue"),
        ("Rohann", "Problem", "Problem"),
        ("Thama", "In My Room", "In My Room"),
        ("MoonMoon", "Tourist", "Tourist"),
        ("E Sens", "Mona Lisa", "Mona Lisa"),
        ("DPR LIVE", "Jasmine", "Jasmine"),
        ("GroovyRoom", "Champion", "Champion"),
        ("Zion.T", "No Make Up (feat. Wonstein)", "No Make Up"),
        ("Woo Won Jae", "Hourglass", "Hourglass"),
        ("Rad Museum", "Life", "Life"),
        ("Trade L", "Rush", "Rush"),
        ("Queenpia", "Queenpia", "Queenpia"),
        ("Sumin", "Mirrorball", "Mirrorball"),
        ("PLT", "Summer", "Summer"),
        ("Blued", "Blue", "Blue"),
        ("Woo Won Jae", "We Are", "We Are"),
        ("B.I", "One and Only", ""),
        ("Andup", "U", "The Last"),
        ("Kid Milli", "Benzo", ""),
        ("Leellamarz", "DAYDATE", "DAYDATE"),
        ("82MAJOR", "ON", "ON"),
        ("meenoi", "3MAN", ""),
        ("DeVita", "Ride or Die", ""),
        ("Ourealgoat", "Maybe", ""),
        ("Blued", "Tears", ""),
        ("Owen Ovadoz", "Drama", ""),
        ("Mirani", "Baby", ""),
        ("Woodie Gochild", "Mood", ""),
        ("Crush", "wonderego", "wonderego"),
        ("Epik High", "Fade Away", "Strawberry"),
        ("Epik High", "Kill", "Strawberry"),
        ("Epik High", "Love Song", "Strawberry"),
        ("Epik High", "You Are The One For Me", "Strawberry"),
        ("Beenzino", "NOWITZKI", "NOWITZKI"),
        ("Beenzino", "Modiversity", "Modiversity"),
        ("Don Malik", "SEOUL", "MADE IN SEOUL"),
        ("Don Malik", "Malik", "MADE IN SEOUL"),
        ("Don Malik", "Wave", "49"),
        ("Zico", "Curriculum", "Grown Ass Kid"),
        ("Zico", "OMJT", "Grown Ass Kid"),
        ("Zico", "Trash Talk", "Grown Ass Kid"),
        ("Zico", "That Guy", "Grown Ass Kid"),
        ("PH-1", "TGIF", "BUT FOR NOW LEAVE ME ALONE"),
        ("PH-1", "Yuppie Ting", "BUT FOR NOW LEAVE ME ALONE"),
        ("PH-1", "Tipsy", "BUT FOR NOW LEAVE ME ALONE"),
        ("PH-1", "Mr. Bad", "BUT FOR NOW LEAVE ME ALONE"),
        ("PH-1", "Juliette!", "BUT FOR NOW LEAVE ME ALONE"),
        ("Epik High", "Here", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Gray So Gray", "Epik High Is Here 下, Part 2"),
        ("Epik High", "BRB", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Rain Song", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Rich Kids Anthem", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Family Portrait", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Champagne", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Piano for Sale", "Epik High Is Here 下, Part 2"),
        ("Olltii", "Turtle Ship Remix", ""),
        ("Reddy", "Well (잘)", "Show Me the Money 777"),
        ("KittiB", "Nobody (누구 없소)", "Show Me the Money 777"),
        ("Jvcki Wai", "Exposure", "Exposure"),
        ("Jessi", "NUNU NANA", "NUNU NANA"),
        ("Lee Young Ji", "낫 쏘리 (Feat. pH-1)", "Show Me the Money 11"),
        ("NSW yoon", "Therapy + 으리으리 (Feat. 호미들)", "Show Me the Money 11"),
        ("허성현", "미운오리새끼 (Prod. R.Tee)", "Show Me the Money 11"),
        ("Kan", "나침반 (Feat. UNEDUCATED KID, Superbee)", "Show Me the Money 11"),
        ("Blase", "Holiday (Feat. Lil Boi, 기리보이)", "Show Me the Money 11"),
        ("QM", "Come To My Stu (Feat. 릴러말즈)", "Show Me the Money 11"),
        ("노윤하", "Flick (Feat. BE'O, HAON)", "Show Me the Money 11"),
        ("잠비노", "Bingo (Feat. 미노이, George)", "Show Me the Money 11"),
        ("JUSTHIS", "마이웨이 (MY WAY) (Prod. by Alti)", "Show Me the Money 11"),
        ("Don Malik", "빡 (Feat. JUSTHIS, Paloalto)", "Show Me the Money 11"),
        ("Don Malik", "눈 (EYE) (Feat. BIG Naughty, JUSTHIS)", "Show Me the Money 11"),
        ("이영지", "WITCH (Feat. 밸재범, 황소윤)", "Show Me the Money 11"),
    ],
}


def ok_tracks(year: int) -> list[tuple[str, str, str]]:
    gs = build_through(year)
    ex = load_global_exclude()
    b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
    seen: set[str] = set()
    out: list[tuple[str, str, str]] = []
    for a, t, al in b2225.HEAD.get(year, []) + b2225.POOLS.get(year, []) + EXTRA_BY_YEAR.get(year, []):
        k = norm_key(a, t)
        if k in seen or k in gs or k in ex:
            continue
        seen.add(k)
        out.append((a, t, al))
    return out


def rewrite_pool(year: int, tracks: list[tuple[str, str, str]]) -> None:
    path = os.path.join(HERE, "pools_2022_2025.py")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    start = text.find(f"    {year}: [")
    if start < 0:
        raise RuntimeError(f"year {year} not found")
    end = text.find("\n    ],", start)
    if end < 0:
        raise RuntimeError(f"year {year} end not found")
    body = "\n".join(f"        ({a!r}, {t!r}, {al!r})," for a, t, al in tracks)
    text = text[:start] + f"    {year}: [\n{body}" + text[end:]
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def simulate(year: int, pool: list[tuple[str, str, str]]) -> tuple[int, int]:
    gs = build_through(year)
    ex = load_global_exclude()
    b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
    head = b2225.HEAD.get(year, [])
    ordered: list[tuple[str, str, str]] = []
    sl: set[str] = set()
    for a, t, al in head + pool:
        k = norm_key(a, t)
        if k in sl:
            continue
        sl.add(k)
        ordered.append((a, t, al))
    result: list[tuple[str, str, str]] = []
    ac: dict[str, int] = {}
    for a, t, al in ordered:
        if len(result) >= 100:
            break
        if ac.get(a, 0) >= 2:
            continue
        k = norm_key(a, t)
        if k in gs or k in ex:
            continue
        result.append((a, t, al))
        ac[a] = ac.get(a, 0) + 1
    return len(result), len(ac)


def main() -> None:
    year = 2023
    tracks = ok_tracks(year)
    n, artists = simulate(year, tracks)
    print(f"before rewrite {year}: {len(tracks)} ok tracks, simulate {n}/100 ({artists} artists)")
    if n < 100:
        print(f"WARNING: still short {100 - n} after clean")
    rewrite_pool(year, tracks)
    print(f"rewrote POOLS[{year}] with {len(tracks)} tracks")


if __name__ == "__main__":
    main()
