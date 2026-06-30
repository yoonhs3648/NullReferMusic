#!/usr/bin/env python3
"""
한국 랩/힙합 catalog_v2 → data/*.mjs 재생성.

품질 규칙:
- 연도당 100곡, 발매연도 = 파일 연도
- artist+title 전 연도 유일
- 연도당 아티스트당 최대 2곡
- 연도당 고유 아티스트 ≥ 45명
- 연도당 한글(가-힣) 제목 ≥ 15% (2010–2013·2022 등 일부 연도는 boost 스크립트로 보정)
- 글로벌 랩/힙합·글로벌 목록과 중복 금지
- **순위:** 힙플·힙플레이·전문가 평가 (`rebuild_community.py`). 멜론·벅스 차트 미반영
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DATA = os.path.join(os.path.dirname(__file__), "..", "data")
CATALOG = os.path.join(os.path.dirname(__file__), "catalog_v2")
YEAR_MIN, YEAR_MAX = 2010, 2025
MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
MIN_HANGUL_RATIO = 0.15


def norm_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = s.lower().strip()
        s = s.replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()

    return f"{norm(artist)}|{norm(title)}"


def has_hangul(s: str) -> bool:
    return bool(re.search(r"[가-힣]", s))


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


def load_year(year: int) -> list[tuple[str, str, str]]:
    path = os.path.join(CATALOG, f"y{year}.py")
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    spec = importlib.util.spec_from_file_location(f"catalog_y{year}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    tracks = getattr(mod, "TRACKS", None)
    if not isinstance(tracks, list) or len(tracks) != 100:
        raise ValueError(f"y{year}.py: TRACKS must be list of 100 tuples")
    out: list[tuple[str, str, str]] = []
    for item in tracks:
        if not isinstance(item, (list, tuple)) or len(item) != 3:
            raise ValueError(f"y{year}.py: bad entry {item!r}")
        a, t, al = str(item[0]).strip(), str(item[1]).strip(), str(item[2]).strip()
        if not a or not t:
            raise ValueError(f"y{year}.py: empty artist/title {item!r}")
        out.append((a, t, al))
    return out


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def write_mjs(year: int, rows: list[tuple[str, str, str]]) -> None:
    lines = ["export default ["]
    for i, (a, t, al) in enumerate(rows, start=1):
        lines.append(
            f'  {{ rank: {i}, year: {year}, artist: "{esc(a)}", title: "{esc(t)}", album: "{esc(al)}" }},'
        )
    lines.append("];")
    lines.append("")
    path = os.path.join(DATA, f"{year}.mjs")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def main() -> None:
    exclude = load_global_exclude()
    used: set[str] = set()
    errors: list[str] = []

    for year in range(YEAR_MIN, YEAR_MAX + 1):
        path = os.path.join(CATALOG, f"y{year}.py")
        if not os.path.isfile(path):
            continue
        tracks = load_year(year)
        artist_count: dict[str, int] = {}
        hangul = 0
        year_keys: set[str] = set()

        for a, t, al in tracks:
            k = norm_key(a, t)
            if k in used:
                errors.append(f"{year}: duplicate across years {a} - {t}")
            if k in exclude:
                errors.append(f"{year}: global overlap {a} - {t}")
            if k in year_keys:
                errors.append(f"{year}: duplicate in year {a} - {t}")
            year_keys.add(k)
            used.add(k)
            artist_count[a] = artist_count.get(a, 0) + 1
            if has_hangul(t):
                hangul += 1

        for a, c in artist_count.items():
            if c > MAX_PER_ARTIST:
                errors.append(f"{year}: {a} has {c} tracks (max {MAX_PER_ARTIST})")

        if len(artist_count) < MIN_ARTISTS:
            errors.append(f"{year}: only {len(artist_count)} artists (min {MIN_ARTISTS})")

        ratio = hangul / len(tracks)
        if ratio < MIN_HANGUL_RATIO:
            errors.append(f"{year}: hangul title ratio {ratio:.0%} (min {MIN_HANGUL_RATIO:.0%})")

        if not errors:
            write_mjs(year, tracks)
            print(f"OK {year}: {len(artist_count)} artists, hangul {hangul}/100")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)

    print(f"Wrote {YEAR_MAX - YEAR_MIN + 1} mjs files under {DATA}")


if __name__ == "__main__":
    main()
