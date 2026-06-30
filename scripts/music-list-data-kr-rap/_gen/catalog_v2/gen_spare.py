#!/usr/bin/env python3
"""연도별 spare 후보에서 부족분 자동 추출."""
from __future__ import annotations

import os
import sys

from build_master import (
    GEN,
    HERE,
    build_from_pool,
    load_global_exclude,
    load_module,
    norm_key,
)

CANDIDATES: dict[int, list[tuple[str, str, str]]] = {
    2022: [
        ("Beenzino", "MONET", ""),
        ("Zico", "Being Human", "Grown Ass Kid"),
        ("Zico", "Curriculum", "Grown Ass Kid"),
        ("Zico", "OMJT", "Grown Ass Kid"),
        ("Epik High", "그래서 그래 (Feat. 윤하)", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Here", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Prequel", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Gray So Gray", "Epik High Is Here 下, Part 2"),
        ("Epik High", "BRB", "Epik High Is Here 下, Part 2"),
        ("Epik High", "Rain Song", "Epik High Is Here 下, Part 2"),
        ("Crush", "Rush Hour (Feat. j-hope of BTS)", "Rush Hour"),
        ("Jessi", "Zoom", ""),
        ("Zion.T", "Lonely Christmas", ""),
        ("Primary", "BILLING", "BILLING"),
        ("Gaeko", "Sturgis", "Sturgis"),
        ("Simon Dominic", "Make Her Dance", "Simon Dominic Part 3"),
        ("Mino", "안녕", "To Infinity"),
        ("Tablo", "Stop the Rain", ""),
        ("Jvcki Wai", "Taxi Blurr", "Taxi Blurr"),
        ("Lil Moshpit", "ACHOO", "ACHOO"),
        ("Killagramz", "Good Morning (굿 모닝)", "Good Morning"),
        ("Hanhae", "003", "003"),
        ("B.I", "Waterfall (워터폴)", "Waterfall"),
        ("Tabber", "RUN CHICKEN (런 치킨)", "RUN CHICKEN"),
        ("Khundi Panda", "Medicine (약)", "Medicine"),
        ("Roh Yun Ha", "IF I (이프 아이)", "Show Me the Money 10"),
        ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
        ("Wonstein", "10 Minutes (10분)", "Show Me the Money 10"),
        ("Trade L", "Leave It (두고 가)", "Show Me the Money 10"),
        ("Blase", "ONOFF", "Show Me the Money 10"),
        ("Mirani", "Villain (빌런)", "Show Me the Money 10"),
        ("Woodie Gochild", "Mud (머드)", "Show Me the Money 10"),
        ("Owen Ovadoz", "Diana (디ana)", "Show Me the Money 10"),
        ("Paul Blanco", "Summer (썸머)", "Summer"),
        ("NSW yoon", "Therapy + 으리으리 (Feat. 호미들)", "Show Me the Money 11"),
        ("이영지", "WITCH (Feat. 밸재범, 황소윤)", "Show Me the Money 11"),
        ("Lee Young Ji", "O.K?", "O.K?"),
        ("QM", "Come To My Stu (Feat. 릴러말즈)", "Show Me the Money 11"),
        ("노윤하", "Flick (Feat. BE'O, HAON)", "Show Me the Money 11"),
        ("잠비노", "Bingo (Feat. 미노이, George)", "Show Me the Money 11"),
        ("JUSTHIS", "마이웨이 (MY WAY) (Prod. by Alti)", "Show Me the Money 11"),
        ("Lee Young Ji", "낫 쏘리 (Feat. pH-1)", "Show Me the Money 11"),
        ("Kid Milli", "가볍게", ""),
        ("Coogie", "굿나잇", "Re:Up"),
        ("Leellamarz", "그러지마", "Toystory3"),
        ("PH-1", "TGIF", "BUT FOR NOW LEAVE ME ALONE"),
        ("PH-1", "Yuppie Ting", "BUT FOR NOW LEAVE ME ALONE"),
        ("PH-1", "Tipsy", "BUT FOR NOW LEAVE ME ALONE"),
        ("Nafla", "Freestyle", ""),
        ("Loopy", "Freestyle", ""),
        ("Dean", "4:44", ""),
        ("Sik-K", "Brought the Heat Back (더운데)", "Brought the Heat Back"),
        ("Paloalto", "Valentina", ""),
        ("Swings", "우리를 기억해", "Growing Pains"),
        ("Bobby", "감동 (Secret)", "SECRET"),
        ("Mudd the student", "Nectar (넥타)", "Show Me the Money 10"),
        ("BE'O", "Countdown (카운트다운)", "Show Me the Money 10"),
        ("Sokodomo", "SIGNATURE (시그니처)", "Show Me the Money 10"),
        ("Lil Boi", "Good Day", "Show Me the Money 10"),
        ("Koonta", "KOONTA (쿤타)", "Show Me the Money 10"),
    ],
}


def build_through(year_before: int) -> set[str]:
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
            ypath = os.path.join(HERE, f"y{year}.py")
            if os.path.isfile(ypath):
                ymod = load_module(f"y{year}", ypath)
                build_from_pool(year, ymod.TRACKS, global_seen, exclude)
            else:
                b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
                pool = b2225.POOLS[year] + getattr(spare, "SPARE", {}).get(year, [])
                build_from_pool(
                    year, pool, global_seen, exclude, head=b2225.HEAD.get(year)
                )
    return global_seen


def simulate(year: int, extra: list[tuple[str, str, str]]) -> tuple[int, list[tuple[str, str, str]]]:
    b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
    b1821 = load_module("b1821", os.path.join(GEN, "_write_catalog_v2_2018_2021.py"))
    spare = load_module("spare", os.path.join(GEN, "spare_tracks.py"))
    exclude = load_global_exclude()
    global_seen = build_through(year)

    if year < 2022:
        pool = list(b1821.CATALOG[year]) + extra
        head = None
    else:
        pool = b2225.POOLS[year] + extra
        head = b2225.HEAD.get(year)

    ordered: list[tuple[str, str, str]] = []
    sl: set[str] = set()
    for a, t, al in head or []:
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
        if k in global_seen or k in exclude:
            continue
        result.append((a, t, al))
        ac[a] = ac.get(a, 0) + 1
    return len(result), result


def pick_spare(year: int) -> None:
    cands = CANDIDATES.get(year, [])
    picked: list[tuple[str, str, str]] = []
    for item in cands:
        trial = picked + [item]
        n, _ = simulate(year, trial)
        if n > simulate(year, picked)[0]:
            picked.append(item)
        if simulate(year, picked)[0] >= 100:
            break
    n, _ = simulate(year, picked)
    print(f"# {year}: {n}/100 with {len(picked)} spare picks\n")
    for a, t, al in picked:
        print(f"        ({a!r}, {t!r}, {al!r}),")


if __name__ == "__main__":
    pick_spare(int(sys.argv[1] if len(sys.argv) > 1 else 2022))
