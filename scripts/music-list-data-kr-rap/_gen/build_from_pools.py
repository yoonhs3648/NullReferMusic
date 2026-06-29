#!/usr/bin/env python3
"""Rebuild year catalog files from candidate pools (dedupe-safe)."""
from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from fix_and_emit import load_mjs_tracks, load_global_exclude, norm_key, has_bad_suffix, DATA
from real_catalog_data import REAL_CATALOG

POOLS: dict[int, list[tuple[str, str, str]]] = {}


def register_pools() -> None:
    exec(open(os.path.join(os.path.dirname(__file__), "candidate_pools.py"), encoding="utf-8").read(), globals())


def build_used_through(year_end: int) -> tuple[set[str], set[str]]:
    exclude = load_global_exclude()
    used: set[str] = set()
    for y in (2010, 2011):
        for a, t, _ in load_mjs_tracks(os.path.join(DATA, f"{y}.mjs")):
            used.add(norm_key(a, t))
    for year in range(2012, year_end):
        src = REAL_CATALOG.get(year)
        if not src:
            continue
        for a, t, al in src:
            if has_bad_suffix(t):
                continue
            k = norm_key(a, t)
            if k in used or k in exclude:
                continue
            used.add(k)
    return used, exclude


def pick_year(year: int, candidates: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    used, exclude = build_used_through(year)
    picked: list[tuple[str, str, str]] = []
    for a, t, al in candidates:
        k = norm_key(a, t)
        if k in used or k in exclude:
            continue
        used.add(k)
        picked.append((a, t, al))
        if len(picked) == 100:
            break
    return picked


def write_year(year: int, tracks: list[tuple[str, str, str]]) -> None:
    lines = ["TRACKS = ["]
    for a, t, al in tracks:
        lines.append(f"    ({a!r}, {t!r}, {al!r}),")
    lines.append("]")
    lines.append("")
    path = os.path.join(os.path.dirname(__file__), "real_catalog_data", f"y{year}.py")
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines))


def main() -> None:
    register_pools()
    for year, pool in POOLS.items():
        if year in (2010, 2011):
            continue
        picked = pick_year(year, pool)
        print(f"{year}: picked {len(picked)}")
        if len(picked) != 100:
            raise SystemExit(f"{year}: need 100, got {len(picked)}")
        write_year(year, picked)


if __name__ == "__main__":
    main()
