#!/usr/bin/env python3
"""catalog_v2 연도별 파일 생성·검증 (한글 제목·아티스트 다양성)."""
from __future__ import annotations

import importlib.util
import os
import re
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
YEAR_MIN, YEAR_MAX = 2010, 2025
MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
MIN_HANGUL = 55
HANGUL = re.compile(r"[가-힣]")


def load_tracks(year: int) -> list[tuple[str, str, str]]:
    path = os.path.join(DIR, f"y{year}.py")
    spec = importlib.util.spec_from_file_location(f"y{year}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return list(mod.TRACKS)


def validate_year(year: int, tracks: list[tuple[str, str, str]], seen: set[tuple[str, str]]) -> list[str]:
    errs: list[str] = []
    if len(tracks) != 100:
        errs.append(f"{year}: count {len(tracks)} != 100")
    ac: dict[str, int] = {}
    hangul = 0
    for a, t, al in tracks:
        ac[a] = ac.get(a, 0) + 1
        if HANGUL.search(t):
            hangul += 1
        key = (a.lower(), t.lower())
        if key in seen:
            errs.append(f"{year}: cross-year dup {a} - {t}")
        seen.add(key)
    for a, c in ac.items():
        if c > MAX_PER_ARTIST:
            errs.append(f"{year}: {a} has {c} tracks")
    if len(ac) < MIN_ARTISTS:
        errs.append(f"{year}: {len(ac)} artists (min {MIN_ARTISTS})")
    if hangul < MIN_HANGUL:
        errs.append(f"{year}: hangul {hangul}/100 (min {MIN_HANGUL})")
    return errs


def main() -> None:
    seen: set[tuple[str, str]] = set()
    all_errs: list[str] = []
    stats: list[str] = []
    for year in range(YEAR_MIN, YEAR_MAX + 1):
        path = os.path.join(DIR, f"y{year}.py")
        if not os.path.isfile(path):
            all_errs.append(f"missing y{year}.py")
            continue
        tracks = load_tracks(year)
        errs = validate_year(year, tracks, seen)
        all_errs.extend(errs)
        if not errs:
            ac = len({a for a, _, _ in tracks})
            hangul = sum(1 for _, t, _ in tracks if HANGUL.search(t))
            stats.append(f"  {year}: {ac} artists, hangul {hangul}/100")
    if stats:
        print("OK:\n" + "\n".join(stats))
    if all_errs:
        print("\nERRORS:\n" + "\n".join(all_errs), file=sys.stderr)
        sys.exit(1)
    print(f"\nAll {YEAR_MAX - YEAR_MIN + 1} years valid.")


if __name__ == "__main__":
    main()
