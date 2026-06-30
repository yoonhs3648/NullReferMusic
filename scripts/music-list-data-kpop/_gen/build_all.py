#!/usr/bin/env python3
"""K-pop 2015–2025 통합 빌드 → data/*.mjs (연도당 100곡, Kpop 내 트랙 유일)."""
from __future__ import annotations

import importlib.util
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
GEN = Path(__file__).resolve().parent

MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
TARGET = 100


def track_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = unicodedata.normalize("NFKC", s or "")
        s = s.lower().replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()

    return f"{norm(artist)}|{norm(title)}"


def load_py(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def finalize_year(
    year: int,
    ordered: list[tuple[str, str, str]],
    global_seen: set[str],
    limit: int = TARGET,
) -> list[tuple[str, str, str]]:
    result: list[tuple[str, str, str]] = []
    artist_count: Counter[str] = Counter()
    for artist, title, album in ordered:
        if len(result) >= limit:
            break
        if artist_count[artist] >= MAX_PER_ARTIST:
            continue
        k = track_key(artist, title)
        if k in global_seen:
            continue
        result.append((artist, title, album))
        artist_count[artist] += 1
        global_seen.add(k)
    return result


def js_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def emit_mjs(year: int, tracks: list[tuple[str, str, str]]) -> None:
    lines = [
        f"// Melon·Gaon·커뮤니티 기준 {year}년 Kpop Top 100",
        "export default [",
    ]
    for i, (artist, title, album) in enumerate(tracks, start=1):
        lines.append(
            f"  {{ rank: {i}, year: {year}, artist: {js_str(artist)}, "
            f"title: {js_str(title)}, album: {js_str(album)} }},"
        )
    lines.append("];")
    lines.append("")
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / f"{year}.mjs").write_text("\n".join(lines), encoding="utf-8")


def sort_pool_by_artist_spread(
    pool: list[tuple[str, str, str]],
) -> list[tuple[str, str, str]]:
    ac: Counter[str] = Counter()
    for artist, _, _ in pool:
        ac[artist] += 1
    return sorted(pool, key=lambda x: (ac[x[0]], x[0]))


def extend_pool(
    pool: list[tuple[str, str, str]],
    spare: list[tuple[str, str, str]],
) -> list[tuple[str, str, str]]:
    have = {track_key(a, t) for a, t, _ in pool}
    out = list(pool)
    for artist, title, album in spare:
        k = track_key(artist, title)
        if k in have:
            continue
        out.append((artist, title, album))
        have.add(k)
    return out


def main() -> None:
    from auto_fill import FILLER
    from extra_2019 import EXTRA_2019
    from spread_2025 import SPREAD_2025
    from unique_2025 import EXTRA_2020, UNIQUE_2025

    c1519 = load_py("c1519", GEN / "catalog_2015_2019.py")
    c1729 = load_py("c1729", GEN / "catalog_2017_2019.py")
    c2025 = load_py("c2025", GEN / "catalog_2020_2025.py")

    raw: dict[int, list[tuple[str, str, str]]] = {}
    raw.update(c1519.CATALOG_2015_2019)
    raw.update(c1729.CATALOG_2017_2019)
    raw.update(c2025.CATALOG_2020_2025)

    global_seen: set[str] = set()
    errors: list[str] = []

    for year in range(2015, 2026):
        pool = raw.get(year, [])
        if year == 2019:
            pool = extend_pool(pool, EXTRA_2019)
            pool = sort_pool_by_artist_spread(pool)
        elif year == 2020:
            pool = extend_pool(pool, EXTRA_2020)
        elif year == 2024:
            pool = extend_pool(pool, FILLER)
            pool = sort_pool_by_artist_spread(pool)
        elif year == 2025:
            pool = extend_pool(pool, UNIQUE_2025)
            pool = extend_pool(pool, SPREAD_2025)
            pool = sort_pool_by_artist_spread(pool)
        tracks = finalize_year(year, pool, global_seen)
        if len(tracks) != TARGET:
            errors.append(f"{year}: got {len(tracks)}/{TARGET} (pool {len(pool)})")
        else:
            ac = len({a for a, _, _ in tracks})
            if ac < MIN_ARTISTS:
                errors.append(f"{year}: only {ac} artists (min {MIN_ARTISTS})")
            emit_mjs(year, tracks)
            print(f"OK {year}: {ac} artists, top {tracks[0][0]} - {tracks[0][1]}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    print(f"Wrote {len(list(range(2015, 2026)))} mjs → {DATA}")


if __name__ == "__main__":
    main()
