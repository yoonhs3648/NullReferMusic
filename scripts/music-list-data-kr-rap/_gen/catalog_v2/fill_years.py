#!/usr/bin/env python3
"""2023–2025 풀 자동 보강: 전역 dedupe 후 부족분 EXTRA 후보 추가."""
from __future__ import annotations

import os
import sys

from build_master import HERE, load_global_exclude, load_module, norm_key
from gen_spare import build_through

EXTRA: dict[int, list[tuple[str, str, str]]] = {
    2023: [
        ("Beenzino", "In Bed/막걸리", "NOWITZKI"),
        ("Beenzino", "Travel Again", "NOWITZKI"),
        ("Don Malik", "49", "49"),
        ("Don Malik", "MADE IN SEOUL", "MADE IN SEOUL"),
        ("Lil Moshpit", "Money Only Shows Hustle", ""),
        ("Lil Moshpit", "TO GO", ""),
        ("PLT", "Way Back Home", "Way Back Home"),
        ("82MAJOR", "Sure Thing", "ON"),
        ("82MAJOR", "FIRST CLASS", "ON"),
        ("Epik High", "On My Way", "Strawberry"),
        ("Epik High", "Catch", "Strawberry"),
        ("Epik High", "Strawberry", "Strawberry"),
        ("Kid Milli", "BEIGE theme", "BEIGE"),
        ("Kid Milli", "HONDA!", "BEIGE"),
        ("Coogie", "Buck", "DIFF"),
        ("Coogie", "Just For Fun", "DIFF"),
        ("Leellamarz", "모른 척", "DAYDATE"),
        ("Leellamarz", "Money dance", "DAYDATE"),
        ("Zico", "Earthquake", ""),
        ("Zico", "SPOT!", ""),
        ("Crush", "Hmm-cheat", "wonderego"),
        ("Crush", "UP ALL NITE", "FANG"),
        ("Loco", "VOLVO", ""),
        ("Loco", "INEEDYOURLOVE", ""),
        ("Loco", "work++", "SCRAPS"),
        ("Dean", "NO FUN", "howlin' 404"),
        ("Heize", "Perhaps Happy Ending", "Last Winter"),
        ("Heize", "From Autumn to Winter", "Last Winter"),
        ("Zion.T", "UNLOVE", "Zip"),
        ("Zion.T", "Happy Ending", "Zip"),
        ("Bobby", "Drowning", "S.i.R"),
        ("Mino", "Smoke", "BODY"),
        ("Changmo", "VOOM", ""),
        ("Changmo", "FWB", ""),
        ("Changmo", "Wonderful Days", ""),
        ("Changmo", "HOLDUP", "Op.1"),
        ("PH-1", "Rosario", "But For Now Leave Me Alone 2"),
        ("PH-1", "Final Bout", "But For Now Leave Me Alone 2"),
        ("PH-1", "GOSHA", "WHAT HAVE WE DONE"),
        ("Gray", "Summer Surf", "Summer Surf"),
        ("Punchnello", "Motive", ""),
        ("Colde", "Wave", ""),
        ("Giriboy", "Girlfriend", ""),
        ("The Quiett", "King Is Back", "Luxury Flow"),
        ("The Quiett", "Mercedes", "Luxury Flow"),
        ("Paloalto", "GONE", ""),
        ("Lee Young Ji", "O.K?", "O.K?"),
        ("BIG Naughty", "Você", "Você"),
        ("Jay Park", "McNasty", ""),
        ("Beenzino", "Trippy", "NOWITZKI"),
        ("Beenzino", "Train", ""),
        ("Lil Moshpit", "K-FLIP", "K-FLIP+"),
        ("Qwala", "ㅍㅍㅍㅍ (Feat. Kid Milli)", "ㅍㅍㅍㅍ"),
        ("G-Dragon", "HOME SWEET HOME (Feat. 태양, 대성)", "Übermensch"),
        ("G-Dragon", "POWER", "Übermensch"),
        ("G-Dragon", "Too Bad", "Übermensch"),
        ("DeVita", "Flowers", ""),
        ("Polodared", "Multiverse", ""),
        ("Hej!", "Drive", ""),
        ("Knoxx", "Knoxx", ""),
        ("Futuristic Swaver", "Villain", ""),
        ("Hodaky", "Yellow", ""),
        ("Chillin Homie", "Good Day", ""),
        ("Ahn Se-min", "물", "Show Me the Money 11"),
        ("Bluso", "Fade Away", ""),
        ("LeyonC", "Fall", ""),
        ("Hyunsang", "Take Care", ""),
        ("Woo", "Rain Drop", "Rain Drop"),
        ("meenoi", "What Do You Think?", ""),
        ("meenoi", "Malfunction", ""),
        ("CAMO", "Life is Wet", ""),
        ("CAMO", "Wifey", ""),
        ("Uneducated Kid", "UNEDUCATED KID", ""),
        ("Superbee", "Superbee", ""),
        ("BIG Naughty", "Vogue", "Vogue"),
        ("Rohann", "Sunday", ""),
        ("Thama", "Long Time No See", "Long Time No See"),
        ("Trade L", "Rush", "Rush"),
        ("Blued", "Blue", "Blue"),
        ("Queenpia", "Queenpia", "Queenpia"),
        ("PLT", "Summer", "Summer"),
        ("Sumin", "Mirrorball", "Mirrorball"),
        ("Rad Museum", "Life", "Life"),
        ("Rad Museum", "Girls", "Life"),
        ("Woo Won Jae", "Hourglass", "Hourglass"),
        ("Woo Won Jae", "We Are", "We Are"),
        ("B.I", "Lover", ""),
        ("B.I", "One and Only", ""),
        ("GwangilJo", "VVS (비비에스)", "Show Me the Money 8"),
        ("Flowsik", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
        ("BIG Naughty", "Relationship", "Relationship"),
        ("Jvcki Wai", "Mood", "Exposure"),
        ("DPR LIVE", "Jasmine", "Jasmine"),
        ("GroovyRoom", "Champion", "Champion"),
        ("Zion.T", "No Make Up (feat. Wonstein)", "No Make Up"),
        ("Woo Won Jae", "Hourglass", "Hourglass"),
        ("Rohann", "Problem", "Problem"),
        ("Thama", "In My Room", "In My Room"),
        ("MoonMoon", "Tourist", "Tourist"),
        ("E Sens", "Mona Lisa", "Mona Lisa"),
        ("Hanhae", "003", "003"),
        ("Penomeco", "Famous", ""),
        ("Code Kunst", "Rain (비)", "Code Kunst Archive Pack 02"),
        ("YUMDDA", "Shake (쉐이크)", "I'm Good"),
        ("Okasian", "Celebration", ""),
        ("Nucksal", "Skill", ""),
        ("Killagramz", "Good Morning (굿 모닝)", "Good Morning"),
        ("Tabber", "RUN CHICKEN (런 치킨)", "RUN CHICKEN"),
        ("Khundi Panda", "Medicine (약)", "Medicine"),
        ("Roh Yun Ha", "IF I (이프 아이)", "Show Me the Money 10"),
        ("Paul Blanco", "Summer (썸머)", "Summer"),
        ("Wonstein", "10 Minutes (10분)", "Show Me the Money 10"),
        ("Trade L", "Leave It (두고 가)", "Show Me the Money 10"),
        ("BE'O", "Countdown (카운트다운)", "Show Me the Money 10"),
        ("Lil Boi", "Good Day", "Show Me the Money 10"),
        ("Koonta", "KOONTA (쿤타)", "Show Me the Money 10"),
        ("Sokodomo", "SIGNATURE (시그니처)", "Show Me the Money 10"),
        ("Mudd the student", "Nectar (넥타)", "Show Me the Money 10"),
        ("Bobby", "감동 (Secret)", "SECRET"),
        ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
        ("Mirani", "Villain (빌런)", "Show Me the Money 10"),
        ("Woodie Gochild", "Mud (머드)", "Show Me the Money 10"),
        ("Owen Ovadoz", "Diana (디ana)", "Show Me the Money 10"),
        ("Blase", "ONOFF", "Show Me the Money 10"),
        ("Coq", "Tweaker", ""),
    ],
    2024: [
        ("G-Dragon", "HOME SWEET HOME (Feat. 태양, 대성)", "Übermensch"),
        ("G-Dragon", "POWER", "Übermensch"),
        ("G-Dragon", "Too Bad", "Übermensch"),
        ("Beenzino", "Train", ""),
        ("Changmo", "Wonderful Days", ""),
        ("Lil Moshpit", "K-FLIP", "K-FLIP+"),
        ("Qwala", "ㅍㅍㅍㅍ (Feat. Kid Milli)", "ㅍㅍㅍㅍ"),
        ("Jay Park", "Need To Know", "THE ONE YOU WANTED"),
        ("Crush", "UP ALL NITE", "FANG"),
        ("Loco", "work++", "SCRAPS"),
        ("Changmo", "HOLDUP", "Op.1"),
        ("PH-1", "GOSHA", "WHAT HAVE WE DONE"),
        ("Zico", "SPOT!", ""),
        ("Epik High", "Strawberry", "Strawberry"),
        ("Don Malik", "MADE IN SEOUL", "MADE IN SEOUL"),
        ("Lil Moshpit", "TO GO", ""),
        ("PLT", "Summer", "Summer"),
        ("82MAJOR", "FIRST CLASS", "ON"),
        ("Beenzino", "Trippy", "NOWITZKI"),
        ("Jay Park", "McNasty", ""),
        ("DeVita", "Flowers", ""),
        ("Polodared", "Multiverse", ""),
        ("Hej!", "Drive", ""),
        ("Knoxx", "Knoxx", ""),
        ("Futuristic Swaver", "Villain", ""),
        ("Hodaky", "Yellow", ""),
        ("Chillin Homie", "Good Day", ""),
        ("Ahn Se-min", "물", "Show Me the Money 11"),
        ("Bluso", "Fade Away", ""),
        ("LeyonC", "Fall", ""),
        ("Hyunsang", "Take Care", ""),
        ("Woo", "Rain Drop", "Rain Drop"),
        ("meenoi", "Malfunction", ""),
        ("CAMO", "Wifey", ""),
        ("Uneducated Kid", "UNEDUCATED KID", ""),
        ("Superbee", "Superbee", ""),
        ("BIG Naughty", "Vogue", "Vogue"),
        ("Rohann", "Sunday", ""),
        ("Coq", "Tweaker", ""),
        ("Killagramz", "Good Morning (굿 모닝)", "Good Morning"),
        ("Tabber", "RUN CHICKEN (런 치킨)", "RUN CHICKEN"),
        ("Khundi Panda", "Medicine (약)", "Medicine"),
        ("Roh Yun Ha", "IF I (이프 아이)", "Show Me the Money 10"),
        ("Paul Blanco", "Summer (썸머)", "Summer"),
        ("Wonstein", "10 Minutes (10분)", "Show Me the Money 10"),
        ("Trade L", "Leave It (두고 가)", "Show Me the Money 10"),
        ("BE'O", "Countdown (카운트다운)", "Show Me the Money 10"),
        ("Lil Boi", "Good Day", "Show Me the Money 10"),
        ("Koonta", "KOONTA (쿤타)", "Show Me the Money 10"),
        ("Sokodomo", "SIGNATURE (시그니처)", "Show Me the Money 10"),
        ("Mudd the student", "Nectar (넥타)", "Show Me the Money 10"),
        ("Bobby", "감동 (Secret)", "SECRET"),
        ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
        ("Mirani", "Villain (빌런)", "Show Me the Money 10"),
        ("Woodie Gochild", "Mud (머드)", "Show Me the Money 10"),
        ("Owen Ovadoz", "Diana (디ana)", "Show Me the Money 10"),
        ("Blase", "ONOFF", "Show Me the Money 10"),
        ("Penomeco", "Famous", ""),
        ("Code Kunst", "Rain (비)", "Code Kunst Archive Pack 02"),
        ("YUMDDA", "Shake (쉐이크)", "I'm Good"),
        ("Okasian", "Celebration", ""),
        ("Nucksal", "Skill", ""),
        ("Hanhae", "003", "003"),
        ("B.I", "Lover", ""),
        ("B.I", "One and Only", ""),
        ("GwangilJo", "VVS (비비에스)", "Show Me the Money 8"),
        ("Flowsik", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
        ("BIG Naughty", "Relationship", "Relationship"),
        ("Jvcki Wai", "Mood", "Exposure"),
        ("DPR LIVE", "Jasmine", "Jasmine"),
        ("GroovyRoom", "Champion", "Champion"),
        ("Zion.T", "No Make Up (feat. Wonstein)", "No Make Up"),
        ("Rohann", "Problem", "Problem"),
        ("Thama", "In My Room", "In My Room"),
        ("MoonMoon", "Tourist", "Tourist"),
        ("E Sens", "Mona Lisa", "Mona Lisa"),
        ("Rad Museum", "Girls", "Life"),
        ("Woo Won Jae", "We Are", "We Are"),
        ("Trade L", "Rush", "Rush"),
        ("Blued", "Blue", "Blue"),
        ("Queenpia", "Queenpia", "Queenpia"),
        ("Sumin", "Mirrorball", "Mirrorball"),
        ("Rad Museum", "Life", "Life"),
        ("Woo Won Jae", "Hourglass", "Hourglass"),
    ],
    2025: [
        ("G-Dragon", "Too Bad", "Übermensch"),
        ("Crush", "UP ALL NITE", "FANG"),
        ("Loco", "work++", "SCRAPS"),
        ("Changmo", "HOLDUP", "Op.1"),
        ("PH-1", "GOSHA", "WHAT HAVE WE DONE"),
        ("Lil Moshpit", "K-FLIP", "K-FLIP+"),
        ("Beenzino", "Train", ""),
        ("Changmo", "Wonderful Days", ""),
        ("Qwala", "ㅍㅍㅍㅍ (Feat. Kid Milli)", "ㅍㅍㅍㅍ"),
        ("G-Dragon", "HOME SWEET HOME (Feat. 태양, 대성)", "Übermensch"),
        ("G-Dragon", "POWER", "Übermensch"),
        ("Zico", "SPOT!", ""),
        ("Jay Park", "McNasty", ""),
        ("Don Malik", "MADE IN SEOUL", "MADE IN SEOUL"),
        ("Lil Moshpit", "TO GO", ""),
        ("PLT", "Summer", "Summer"),
        ("82MAJOR", "FIRST CLASS", "ON"),
        ("Beenzino", "Trippy", "NOWITZKI"),
        ("Epik High", "Strawberry", "Strawberry"),
        ("DeVita", "Flowers", ""),
        ("Polodared", "Multiverse", ""),
        ("Hej!", "Drive", ""),
        ("Knoxx", "Knoxx", ""),
        ("Futuristic Swaver", "Villain", ""),
        ("Hodaky", "Yellow", ""),
        ("Chillin Homie", "Good Day", ""),
        ("Ahn Se-min", "물", "Show Me the Money 11"),
        ("Bluso", "Fade Away", ""),
        ("LeyonC", "Fall", ""),
        ("Hyunsang", "Take Care", ""),
        ("Woo", "Rain Drop", "Rain Drop"),
        ("meenoi", "Malfunction", ""),
        ("CAMO", "Wifey", ""),
        ("Uneducated Kid", "UNEDUCATED KID", ""),
        ("Superbee", "Superbee", ""),
        ("BIG Naughty", "Vogue", "Vogue"),
        ("Rohann", "Sunday", ""),
        ("Coq", "Tweaker", ""),
        ("Killagramz", "Good Morning (굿 모닝)", "Good Morning"),
        ("Tabber", "RUN CHICKEN (런 치킨)", "RUN CHICKEN"),
        ("Khundi Panda", "Medicine (약)", "Medicine"),
        ("Roh Yun Ha", "IF I (이프 아이)", "Show Me the Money 10"),
        ("Paul Blanco", "Summer (썸머)", "Summer"),
        ("Wonstein", "10 Minutes (10분)", "Show Me the Money 10"),
        ("Trade L", "Leave It (두고 가)", "Show Me the Money 10"),
        ("BE'O", "Countdown (카운트다운)", "Show Me the Money 10"),
        ("Lil Boi", "Good Day", "Show Me the Money 10"),
        ("Koonta", "KOONTA (쿤타)", "Show Me the Money 10"),
        ("Sokodomo", "SIGNATURE (시그니처)", "Show Me the Money 10"),
        ("Mudd the student", "Nectar (넥타)", "Show Me the Money 10"),
        ("Bobby", "감동 (Secret)", "SECRET"),
        ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
        ("Mirani", "Villain (빌런)", "Show Me the Money 10"),
        ("Woodie Gochild", "Mud (머드)", "Show Me the Money 10"),
        ("Owen Ovadoz", "Diana (디ana)", "Show Me the Money 10"),
        ("Blase", "ONOFF", "Show Me the Money 10"),
        ("Penomeco", "Famous", ""),
        ("Code Kunst", "Rain (비)", "Code Kunst Archive Pack 02"),
        ("YUMDDA", "Shake (쉐이크)", "I'm Good"),
        ("Okasian", "Celebration", ""),
        ("Nucksal", "Skill", ""),
        ("Hanhae", "003", "003"),
        ("B.I", "Lover", ""),
        ("B.I", "One and Only", ""),
        ("GwangilJo", "VVS (비비에스)", "Show Me the Money 8"),
        ("Flowsik", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
        ("BIG Naughty", "Relationship", "Relationship"),
        ("Jvcki Wai", "Mood", "Exposure"),
        ("DPR LIVE", "Jasmine", "Jasmine"),
        ("GroovyRoom", "Champion", "Champion"),
        ("Zion.T", "No Make Up (feat. Wonstein)", "No Make Up"),
        ("Rohann", "Problem", "Problem"),
        ("Thama", "In My Room", "In My Room"),
        ("MoonMoon", "Tourist", "Tourist"),
        ("E Sens", "Mona Lisa", "Mona Lisa"),
        ("Rad Museum", "Girls", "Life"),
        ("Woo Won Jae", "We Are", "We Are"),
        ("Trade L", "Rush", "Rush"),
        ("Blued", "Blue", "Blue"),
        ("Queenpia", "Queenpia", "Queenpia"),
        ("Sumin", "Mirrorball", "Mirrorball"),
        ("Rad Museum", "Life", "Life"),
        ("Woo Won Jae", "Hourglass", "Hourglass"),
        ("Jay Park", "Need To Know", "THE ONE YOU WANTED"),
        ("BIG Naughty", "Você", "Você"),
        ("Lee Young Ji", "O.K?", "O.K?"),
        ("Don Malik", "49", "49"),
        ("Lil Moshpit", "Money Only Shows Hustle", ""),
        ("PLT", "Way Back Home", "Way Back Home"),
        ("82MAJOR", "Sure Thing", "ON"),
        ("Epik High", "On My Way", "Strawberry"),
        ("Epik High", "Catch", "Strawberry"),
        ("Kid Milli", "BEIGE theme", "BEIGE"),
        ("Kid Milli", "HONDA!", "BEIGE"),
        ("Coogie", "Buck", "DIFF"),
        ("Coogie", "Just For Fun", "DIFF"),
        ("Leellamarz", "모른 척", "DAYDATE"),
        ("Leellamarz", "Money dance", "DAYDATE"),
        ("Zico", "Earthquake", ""),
        ("Crush", "Hmm-cheat", "wonderego"),
        ("Loco", "VOLVO", ""),
        ("Loco", "INEEDYOURLOVE", ""),
        ("Dean", "NO FUN", "howlin' 404"),
        ("Heize", "Perhaps Happy Ending", "Last Winter"),
        ("Heize", "From Autumn to Winter", "Last Winter"),
        ("Zion.T", "UNLOVE", "Zip"),
        ("Zion.T", "Happy Ending", "Zip"),
        ("Bobby", "Drowning", "S.i.R"),
        ("Mino", "Smoke", "BODY"),
        ("Changmo", "VOOM", ""),
        ("Changmo", "FWB", ""),
        ("PH-1", "Rosario", "But For Now Leave Me Alone 2"),
        ("PH-1", "Final Bout", "But For Now Leave Me Alone 2"),
        ("Gray", "Summer Surf", "Summer Surf"),
        ("Punchnello", "Motive", ""),
        ("Colde", "Wave", ""),
        ("Giriboy", "Girlfriend", ""),
        ("The Quiett", "King Is Back", "Luxury Flow"),
        ("The Quiett", "Mercedes", "Luxury Flow"),
        ("Paloalto", "GONE", ""),
    ],
}


def simulate(year: int, pool: list[tuple[str, str, str]], head: list[tuple[str, str, str]]) -> int:
    gs = build_through(year)
    ex = load_global_exclude()
    ordered: list[tuple[str, str, str]] = []
    sl: set[str] = set()
    for a, t, al in head:
        k = norm_key(a, t)
        if k not in sl:
            ordered.append((a, t, al))
            sl.add(k)
    for a, t, al in pool:
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
    return len(result)


def greedy_fill(year: int) -> list[tuple[str, str, str]]:
    b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
    head = list(b2225.HEAD.get(year, []))
    pool = list(b2225.POOLS.get(year, []))
    picked: list[tuple[str, str, str]] = []
    for item in EXTRA.get(year, []):
        trial = pool + picked + [item]
        if simulate(year, trial, head) > simulate(year, pool + picked, head):
            picked.append(item)
        if simulate(year, pool + picked, head) >= 100:
            break
    return picked


def append_to_pool(year: int, picks: list[tuple[str, str, str]]) -> None:
    path = os.path.join(HERE, "pools_2022_2025.py")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    marker = f"    {year}: ["
    idx = text.find(marker)
    if idx < 0:
        raise RuntimeError(f"year {year} not found")
    close = text.find("\n    ],", idx)
    if close < 0:
        raise RuntimeError(f"year {year} close not found")
    lines = "".join(f"\n        ({a!r}, {t!r}, {al!r})," for a, t, al in picks)
    text = text[:close] + lines + text[close:]
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def main() -> None:
    years = [int(x) for x in sys.argv[1:]] if len(sys.argv) > 1 else [2023, 2024, 2025]
    b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
    for year in years:
        picked = greedy_fill(year)
        n = simulate(year, b2225.POOLS[year] + picked, b2225.HEAD[year])
        print(f"{year}: +{len(picked)} extras -> {n}/100")
        if picked and n < 100:
            append_to_pool(year, picked)
            print(f"  appended to pools_2022_2025.py")
        elif picked:
            append_to_pool(year, picked)
            print(f"  appended to pools_2022_2025.py")


if __name__ == "__main__":
    main()
