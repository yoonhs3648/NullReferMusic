#!/usr/bin/env python3
"""Generate validated catalog_v2 y2022-y2025 modules."""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
MIN_HANGUL_RATIO = 0.55

CATALOG: dict[int, list[tuple[str, str, str]]] = {}


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


def validate() -> list[str]:
    exclude = load_global_exclude()
    used: set[str] = set()
    errors: list[str] = []
    for year in sorted(CATALOG):
        tracks = CATALOG[year]
        if len(tracks) != 100:
            errors.append(f"{year}: count {len(tracks)}")
        artist_count: dict[str, int] = {}
        year_keys: set[str] = set()
        hangul = 0
        for a, t, al in tracks:
            k = norm_key(a, t)
            if k in used:
                errors.append(f"{year}: cross-year dup {a} - {t}")
            if k in exclude:
                errors.append(f"{year}: global {a} - {t}")
            if k in year_keys:
                errors.append(f"{year}: in-year dup {a} - {t}")
            year_keys.add(k)
            used.add(k)
            artist_count[a] = artist_count.get(a, 0) + 1
            if has_hangul(t):
                hangul += 1
        for a, c in artist_count.items():
            if c > MAX_PER_ARTIST:
                errors.append(f"{year}: {a} has {c}")
        if len(artist_count) < MIN_ARTISTS:
            errors.append(f"{year}: {len(artist_count)} artists")
        ratio = hangul / len(tracks) if tracks else 0
        if ratio < MIN_HANGUL_RATIO:
            errors.append(f"{year}: hangul {hangul}/100 = {ratio:.0%}")
        else:
            print(f"OK {year}: {len(artist_count)} artists, hangul {hangul}/100")
    return errors


def write_modules() -> None:
    for year, tracks in CATALOG.items():
        lines = ["TRACKS = ["]
        for a, t, al in tracks:
            lines.append(f"    ({a!r}, {t!r}, {al!r}),")
        lines.append("]")
        lines.append("")
        path = os.path.join(HERE, f"y{year}.py")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines))
        print(f"wrote {path}")


def main() -> None:
    errors = validate()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    write_modules()


if __name__ == "__main__":
    main()
