#!/usr/bin/env python3
"""연도별 spare 부족 진단 + 후보 OK 목록."""
from __future__ import annotations

import os
import sys

from build_master import (
    load_global_exclude,
    load_module,
    norm_key,
    build_from_pool,
    GEN,
    HERE,
)

EXTRA_CANDIDATES: dict[int, list[tuple[str, str, str]]] = {
    2020: [
        ("Paul Blanco", "Click Like", "Click Like"),
        ("Paul Blanco", "Summer", "Summer"),
        ("Rad Museum", "Life", "Life"),
        ("Woo Won Jae", "Hourglass", "Hourglass"),
        ("GwangilJo", "VVS (비비에스)", "Show Me the Money 8"),
        ("Sumin", "Mirrorball", "Mirrorball"),
        ("B.I", "One and Only", ""),
        ("The Quiett", "Nike (나이키)", ""),
        ("The Quiett", "Glow", ""),
        ("Don Mills", "Don Mills Is Angry 5", "Don Mills Is Angry 5"),
        ("Huckleberry P", "Mantra 5", "Mantra 5"),
        ("Woodie Gochild", "WaRRior (워리어)", "Show Me the Money 8"),
        ("YunB", "VVS", "Show Me the Money 8"),
        ("Mirani", "VVS", "Show Me the Money 8"),
        ("Lil Boi", "VVS", "Show Me the Money 8"),
        ("Mudd the student", "Do You Like Haeseon", "Show Me the Money 9"),
        ("Deepflow", "Flow the Life 5", "Flow the Life 5"),
        ("Simon Dominic", "GOTT", "GOTT"),
        ("PH-1", "MEET N GREET", "X"),
        ("Coogie", "Up!", "Up!"),
        ("Kid Milli", "Beige 0.5", "Beige 0.5"),
        ("Beenzino", "Reset (리셋)", "Reset"),
        ("Ash Island", "Melodies", "Melodies"),
        ("HAON", "You and I", "Melodies"),
        ("Leellamarz", "Ale", "Marz & Ale"),
        ("Giriboy", "Lonely (론리)", "Lonely"),
        ("Nafla", "understand", "understand"),
        ("Loopy", "ON THE Radar", "ON THE Radar"),
        ("Jay Park", "Forget About Tomorrow", "Forget About Tomorrow"),
        ("Loco", "Hello (헬로)", "Hello"),
        ("Gray", "summer (썸머)", "summer"),
        ("Sik-K", "Bungee (번지)", "Bungee"),
        ("Crush", "Click Like (클릭해)", "Click Like"),
        ("Dean", "Peace (피스)", "Peace"),
        ("Punchnello", "Loveseat (러브시트)", "Winter Blossom"),
        ("Colde", "Star (스타)", "Star"),
        ("Swings", "Shook Ones", "Shook Ones"),
        ("Gaeko", "West Coast (웨스트 코스트)", "Redingray"),
        ("Bobby", "Lalala (라라라)", "Lalala"),
        ("Mino", "Booker (부커)", "Booker"),
        ("Tablo", "Tomorrow (내일)", "Birthday"),
        ("Code Kunst", "Buckle Up (버클 업)", "Code Kunst Archive Pack 02"),
        ("Zion.T", "Spring Dream (봄꿈)", "Zionic"),
        ("TOIL", "MAZE (메이즈)", "MAZE"),
        ("Blase", "Quote That", ""),
        ("Don Mills", "돈밀리 5", "Don Mills Is Angry 5"),
        ("Huckleberry P", "Mantra 5", "Mantra 5"),
        ("Mirani", "VANS", "Show Me the Money 8"),
        ("Koonta", "VVS", "Show Me the Money 8"),
        ("Sokodomo", "coffee", "Show Me the Money 8"),
        ("Giriboy", "on my way", "Show Me the Money 8"),
        ("Changmo", "Thrift Shop (쓰리프트 샵)", "Ghetto Kids"),
        ("Epik High", "Rosario", "Sleepless in __________"),
        ("DPR LIVE", "Jasmine", "Jasmine"),
        ("GroovyRoom", "Champion", "Champion"),
        ("E Sens", "Mona Lisa", "Mona Lisa"),
        ("MoonMoon", "Tourist", "Tourist"),
        ("Thama", "In My Room", "In My Room"),
        ("Rohann", "Problem", "Problem"),
        ("BIG Naughty", "Relationship", "Relationship"),
        ("Flowsik", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
        ("Jvcki Wai", "Mood", "Exposure"),
        ("Woo Won Jae", "We Are", "We Are"),
    ],
    2021: [
        ("Changmo", "MORAESIGYE", "UNDERGROUND ROCKSTAR"),
        ("Changmo", "TAIJI", "UNDERGROUND ROCKSTAR"),
        ("Kid Milli", "Cliché", "Cliché"),
        ("Coogie", "I Got A Feeling", "I Got A Feeling"),
        ("Beenzino", "Reset", "Nowitzki"),
        ("Beenzino", "Nowitzki", "Nowitzki"),
        ("Epik High", "Breathe", "Epilogue Pt.2"),
        ("Epik High", "Sleep Tight", "Epilogue Pt.2"),
        ("Paul Blanco", "Summer", "Summer"),
        ("Rad Museum", "Girls", "Life"),
        ("Woo Won Jae", "We Are", "We Are"),
        ("GwangilJo", "VVS", "Show Me the Money 8"),
        ("Sumin", "Mirrorball", "Mirrorball"),
        ("B.I", "Lover", ""),
        ("The Quiett", "Nike (나이키)", ""),
        ("Don Malik", "MADE IN SEOUL", "MADE IN SEOUL"),
        ("Lil Moshpit", "TO GO", ""),
        ("PLT", "Summer", "Summer"),
        ("Don Mills", "Don Mills Is Angry 6", "Don Mills Is Angry 6"),
        ("Huckleberry P", "Mantra 6", "Mantra 6"),
        ("Deepflow", "Flow the Life 6", "Flow the Life 6"),
        ("Woodie Gochild", "Money Wave (머니 웨이브)", "Show Me the Money 8"),
        ("YunB", "Piano (피아노)", "Show Me the Money 8"),
        ("Mirani", "Ticket (티켓)", "Ticket"),
        ("Koonta", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
        ("Sokodomo", "Gamble (겜블)", "Show Me the Money 8"),
        ("Giriboy", "SEOUL CITY G", "heat"),
        ("Epik High", "Rosario (로사리오)", "Epilogue Pt.2"),
        ("DPR LIVE", "Martini Blue", "Martini Blue"),
        ("GroovyRoom", "Wavy", "Champion"),
        ("E Sens", "Mona Lisa", "Mona Lisa"),
        ("MoonMoon", "Tourist", "Tourist"),
        ("Thama", "Long Time No See", "Long Time No See"),
        ("Rohann", "Problem", "Problem"),
        ("BIG Naughty", "Relationship", "Relationship"),
        ("Flowsik", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
        ("Jvcki Wai", "Mood", "Exposure"),
        ("Woo Won Jae", "Hourglass", "Hourglass"),
    ],
}


def build_global_through(year_before: int) -> set[str]:
    b1013 = load_module("b1013", os.path.join(HERE, "_build_2010_2013.py"))
    b1417 = load_module("b1417", os.path.join(HERE, "_build_2014_2017.py"))
    b1821 = load_module("b1821", os.path.join(GEN, "_write_catalog_v2_2018_2021.py"))
    spare = load_module("spare", os.path.join(GEN, "spare_tracks.py"))
    exclude = load_global_exclude()
    global_seen: set[str] = set()
    for year in range(2010, year_before):
        if year < 2014:
            pool = b1013.POOLS[year] + getattr(spare, "SPARE", {}).get(year, [])
            build_from_pool(year, pool, global_seen, exclude)
        elif year < 2018:
            scored = b1417.load_scored()
            extra = b1417.EXTRA.get(year, []) + getattr(spare, "SPARE", {}).get(year, [])
            pool = b1417.merge_pool(year, scored[year], extra)
            build_from_pool(
                year, pool, global_seen, exclude, head=b1417.MUST_HEAD.get(year)
            )
        elif year < 2022:
            pool = list(b1821.CATALOG[year]) + getattr(spare, "SPARE", {}).get(year, [])
            build_from_pool(year, pool, global_seen, exclude)
        else:
            b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
            pool = b2225.POOLS[year]
            build_from_pool(
                year, pool, global_seen, exclude, head=b2225.HEAD.get(year)
            )
    return global_seen


def diagnose(year: int) -> None:
    b1821 = load_module("b1821", os.path.join(GEN, "_write_catalog_v2_2018_2021.py"))
    spare = load_module("spare", os.path.join(GEN, "spare_tracks.py"))
    global_seen = build_global_through(year)
    exclude = load_global_exclude()

    if year < 2022:
        pool = list(b1821.CATALOG[year]) + getattr(spare, "SPARE", {}).get(year, [])
    else:
        b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
        pool = b2225.POOLS[year]

    ordered: list[tuple[str, str, str]] = []
    sl: set[str] = set()
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
        if k in global_seen or k in exclude:
            continue
        result.append((a, t, al))
        ac[a] = ac.get(a, 0) + 1

    need = 100 - len(result)
    print(f"\n=== {year}: {len(result)}/100 (need {need}) ===")
    in_catalog = {a for a, _, _ in b1821.CATALOG.get(year, [])} if year < 2022 else set()

    ok: list[tuple[str, str, str]] = []
    for a, t, al in EXTRA_CANDIDATES.get(year, []):
        k = norm_key(a, t)
        if k in global_seen or k in exclude:
            continue
        if ac.get(a, 0) >= 2:
            continue
        if (a, t, al) in result:
            continue
        ok.append((a, t, al))

    seen_a: set[str] = set()
    picks: list[tuple[str, str, str]] = []
    for a, t, al in ok:
        if a in seen_a and ac.get(a, 0) >= 1:
            continue
        if len(picks) >= need:
            break
        picks.append((a, t, al))
        seen_a.add(a)

    for a, t, al in picks:
        print(f"  PICK: ({a!r}, {t!r}, {al!r}),")
    if len(picks) < need:
        print(f"  ... still short {need - len(picks)}")


if __name__ == "__main__":
    for y in map(int, sys.argv[1:] or [2020]):
        diagnose(y)
