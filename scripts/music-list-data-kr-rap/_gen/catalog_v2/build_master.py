#!/usr/bin/env python3
"""2010–2025 한국 랩/힙합 catalog_v2 통합 빌드 (전 연도 트랙 유일)."""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "..")
REPO = os.path.abspath(os.path.join(GEN, "..", ".."))
MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
TARGET = 100

HANGUL = re.compile(r"[가-힣]")


def norm_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = s.lower().strip().replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()

    return f"{norm(artist)}|{norm(title)}"


def load_global_exclude() -> set[str]:
    keys: set[str] = set()
    for sub in ("music-list-data", "music-list-data-global"):
        d = os.path.join(REPO, "scripts", sub)
        if not os.path.isdir(d):
            continue
        for fn in os.listdir(d):
            if fn.endswith(".json"):
                for row in json.load(open(os.path.join(d, fn), encoding="utf-8")):
                    keys.add(norm_key(row["artist"], row["title"]))
    return keys


def load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build_from_pool(
    year: int,
    pool: list[tuple[str, str, str]],
    global_seen: set[str],
    exclude: set[str],
    head: list[tuple[str, str, str]] | None = None,
    round_robin: bool = False,
) -> list[tuple[str, str, str]]:
    ordered: list[tuple[str, str, str]] = []
    seen_local: set[str] = set()
    for a, t, al in head or []:
        k = norm_key(a, t)
        if k not in seen_local:
            ordered.append((a, t, al))
            seen_local.add(k)
    for a, t, al in pool:
        k = norm_key(a, t)
        if k in seen_local:
            continue
        seen_local.add(k)
        ordered.append((a, t, al))

    result: list[tuple[str, str, str]] = []
    artist_count: dict[str, int] = {}

    def try_add(a: str, t: str, al: str) -> bool:
        if len(result) >= TARGET:
            return False
        if artist_count.get(a, 0) >= MAX_PER_ARTIST:
            return False
        k = norm_key(a, t)
        if k in global_seen or k in exclude:
            return False
        result.append((a, t, al))
        artist_count[a] = artist_count.get(a, 0) + 1
        global_seen.add(k)
        return True

    # 1) 커뮤니티·전문가 평가 상위 (head)
    head_keys = {norm_key(a, t) for a, t, _ in (head or [])}
    for a, t, al in head or []:
        try_add(a, t, al)

    # 2) pool
    if not round_robin:
        for a, t, al in ordered:
            if len(result) >= TARGET:
                break
            try_add(a, t, al)
    else:
        pool_tracks: list[tuple[str, str, str]] = [
            (a, t, al) for a, t, al in ordered if norm_key(a, t) not in head_keys
        ]
        by_artist: dict[str, list[tuple[str, str, str]]] = {}
        artist_order: list[str] = []
        for item in pool_tracks:
            a = item[0]
            if a not in by_artist:
                by_artist[a] = []
                artist_order.append(a)
            by_artist[a].append(item)

        for round_i in range(MAX_PER_ARTIST):
            if len(result) >= TARGET:
                break
            for a in artist_order:
                if len(result) >= TARGET:
                    break
                tracks = by_artist[a]
                if len(tracks) <= round_i:
                    continue
                aa, t, al = tracks[round_i]
                try_add(aa, t, al)

        for a, t, al in pool_tracks:
            if len(result) >= TARGET:
                break
            try_add(a, t, al)

    if len(result) != TARGET:
        raise RuntimeError(f"{year}: got {len(result)}/{TARGET} (expand pool)")
    if len(artist_count) < MIN_ARTISTS:
        raise RuntimeError(f"{year}: only {len(artist_count)} artists")
    return result


def write_module(year: int, tracks: list[tuple[str, str, str]]) -> None:
    lines = [f"# 힙플·힙플레이·전문가 평가 기준 {year}년 한국 랩/힙합 Top 100 (차트 미반영)", "TRACKS = ["]
    for a, t, al in tracks:
        lines.append(f"    ({a!r}, {t!r}, {al!r}),")
    lines.append("]")
    path = os.path.join(HERE, f"y{year}.py")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    h = sum(1 for _, t, _ in tracks if HANGUL.search(t))
    print(f"OK {year}: {len({a for a, _, _ in tracks})} artists, hangul {h}/100")


def main() -> None:
    exclude = load_global_exclude()
    global_seen: set[str] = set()

    b1013 = load_module("b1013", os.path.join(HERE, "_build_2010_2013.py"))
    b1417 = load_module("b1417", os.path.join(HERE, "_build_2014_2017.py"))
    b1821 = load_module("b1821", os.path.join(GEN, "_write_catalog_v2_2018_2021.py"))
    b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
    spare = load_module("spare", os.path.join(GEN, "spare_tracks.py"))

    scored = b1417.load_scored()

    for year in range(2010, 2014):
        pool = b1013.POOLS[year] + getattr(spare, "SPARE", {}).get(year, [])
        tracks = build_from_pool(year, pool, global_seen, exclude)
        write_module(year, tracks)

    for year in range(2014, 2018):
        extra = b1417.EXTRA.get(year, []) + getattr(spare, "SPARE", {}).get(year, [])
        pool = b1417.merge_pool(year, scored[year], extra)
        head = b1417.MUST_HEAD.get(year)
        tracks = build_from_pool(year, pool, global_seen, exclude, head=head)
        write_module(year, tracks)

    for year in range(2018, 2022):
        pool = list(b1821.CATALOG[year])
        extras = getattr(spare, "SPARE", {}).get(year, [])
        tracks = build_from_pool(year, pool + extras, global_seen, exclude)
        write_module(year, tracks)

    for year in range(2022, 2026):
        pool = b2225.POOLS[year] + getattr(spare, "SPARE", {}).get(year, [])
        head = b2225.HEAD.get(year)
        tracks = build_from_pool(
            year, pool, global_seen, exclude, head=head, round_robin=True
        )
        write_module(year, tracks)

    print(f"Done. {len(global_seen)} unique tracks, exclude {len(exclude)} global keys.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
