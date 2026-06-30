#!/usr/bin/env python3
"""전역 dedupe 후 연도 풀에서 OK 트랙만 추출·빌드 시뮬레이션."""
from __future__ import annotations

import os
import sys

from build_master import HERE, load_global_exclude, load_module, norm_key
from gen_spare import build_through


def filter_year(year: int) -> None:
    b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
    gs = build_through(year)
    ex = load_global_exclude()
    head = b2225.HEAD[year]
    pool = b2225.POOLS[year]
    ok: list[tuple[str, str, str]] = []
    for a, t, al in head + pool:
        k = norm_key(a, t)
        if k not in gs and k not in ex:
            ok.append((a, t, al))
    artists = sorted({a for a, _, _ in ok})
    print(f"{year}: OK {len(ok)} tracks, {len(artists)} artists")
    ordered: list[tuple[str, str, str]] = []
    sl: set[str] = set()
    for a, t, al in head:
        k = norm_key(a, t)
        if k not in sl:
            ordered.append((a, t, al))
            sl.add(k)
    for a, t, al in ok:
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
    print(f"  simulate: {len(result)}/100, {len(ac)} artists, need {100 - len(result)}")


if __name__ == "__main__":
    for y in map(int, sys.argv[1:] or [2022]):
        filter_year(y)
