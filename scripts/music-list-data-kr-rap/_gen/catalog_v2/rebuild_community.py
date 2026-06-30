#!/usr/bin/env python3
"""
기존 y2010–y2025 트랙 풀을 유지한 채
힙플·힙플레이·전문가 평가 기준으로 순위만 재정렬 (차트 배제).
"""
from __future__ import annotations

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
from community_rankings import community_score

HEADER = "# 힙플·힙플레이·전문가 평가 기준 {year}년 한국 랩/힙합 Top 100 (차트 미반영)"


def load_tracks(year: int) -> list[tuple[str, str, str]]:
    path = os.path.join(HERE, f"y{year}.py")
    spec = importlib.util.spec_from_file_location(f"y{year}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    tracks = mod.TRACKS
    if len(tracks) != 100:
        raise ValueError(f"y{year}.py: expected 100, got {len(tracks)}")
    return list(tracks)


def reorder(year: int, tracks: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    indexed = [
        (community_score(year, a, t, al), i, a, t, al)
        for i, (a, t, al) in enumerate(tracks)
    ]
    indexed.sort(key=lambda x: (-x[0], x[1]))
    return [(a, t, al) for _, _, a, t, al in indexed]


def write_year(year: int, tracks: list[tuple[str, str, str]]) -> None:
    lines = [HEADER.format(year=year), "TRACKS = ["]
    for a, t, al in tracks:
        lines.append(f"    ({a!r}, {t!r}, {al!r}),")
    lines.append("]")
    path = os.path.join(HERE, f"y{year}.py")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def main() -> None:
    for year in range(2010, 2026):
        path = os.path.join(HERE, f"y{year}.py")
        if not os.path.isfile(path):
            print(f"skip {year}: no file")
            continue
        before = load_tracks(year)
        after = reorder(year, before)
        write_year(year, after)
        moved = sum(
            1 for i, (a, t, _) in enumerate(after)
            if i >= 10 and (a, t) != (before[i][0], before[i][1])
        )
        print(f"OK {year}: top10 now {after[0][0]} - {after[0][1]} | {after[9][0]} - {after[9][1]}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
