#!/usr/bin/env python3
"""
Deduplicate kr-rap catalog (2010-2011 fixed + 2012-2025 modules),
fill gaps with year-specific spare tracks, write data/*.mjs
"""
from __future__ import annotations
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from real_catalog_data import REAL_CATALOG
from spare_tracks import SPARE

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def norm_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = s.lower().strip()
        s = s.replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()
    return f"{norm(artist)}|{norm(title)}"


def load_mjs_tracks(path: str) -> list[tuple[str, str, str]]:
    text = open(path, encoding="utf-8").read()
    out = []
    for m in re.finditer(
        r'artist:\s*"((?:\\.|[^"\\])*)"\s*,\s*title:\s*"((?:\\.|[^"\\])*)"\s*,\s*album:\s*"((?:\\.|[^"\\])*)"',
        text,
    ):
        a = bytes(m.group(1), "utf-8").decode("unicode_escape")
        t = bytes(m.group(2), "utf-8").decode("unicode_escape")
        al = bytes(m.group(3), "utf-8").decode("unicode_escape")
        out.append((a, t, al))
    return out


def load_global_exclude() -> set[str]:
    keys: set[str] = set()
    for sub in ("music-list-data", "music-list-data-global"):
        d = os.path.join(REPO, "scripts", sub)
        for fn in os.listdir(d):
            if fn.endswith(".json"):
                for row in json.load(open(os.path.join(d, fn), encoding="utf-8")):
                    keys.add(norm_key(row["artist"], row["title"]))
    return keys


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def has_bad_suffix(title: str) -> bool:
    return bool(re.search(r"\(\d{4}(?:\s+Mix)?\)\s*$", title))


def main() -> None:
    exclude = load_global_exclude()
    used: set[str] = set()
    for y in (2010, 2011):
        for a, t, _ in load_mjs_tracks(os.path.join(DATA, f"{y}.mjs")):
            used.add(norm_key(a, t))

    final: dict[int, list[tuple[str, str, str]]] = {}
    spare_idx: dict[int, int] = {y: 0 for y in range(2012, 2026)}

    for year in range(2012, 2026):
        kept: list[tuple[str, str, str]] = []
        for a, t, al in REAL_CATALOG[year]:
            if has_bad_suffix(t):
                continue
            k = norm_key(a, t)
            if k in used or k in exclude:
                continue
            used.add(k)
            kept.append((a, t, al))

        while len(kept) < 100:
            pool = SPARE.get(year, [])
            idx = spare_idx[year]
            if idx >= len(pool):
                raise SystemExit(f"{year}: need {100 - len(kept)} more spare tracks, pool exhausted at {idx}")
            a, t, al = pool[idx]
            spare_idx[year] += 1
            k = norm_key(a, t)
            if k in used or k in exclude:
                continue
            used.add(k)
            kept.append((a, t, al))

        if len(kept) > 100:
            kept = kept[:100]
        if len(kept) != 100:
            raise SystemExit(f"{year}: final count {len(kept)}")
        final[year] = kept

    os.makedirs(DATA, exist_ok=True)
    for year, tracks in final.items():
        lines = ["export default ["]
        for i, (a, t, al) in enumerate(tracks, 1):
            lines.append(
                f'  {{ rank: {i}, year: {year}, artist: "{esc(a)}", title: "{esc(t)}", album: "{esc(al)}" }},'
            )
        lines.append("];")
        lines.append("")
        with open(os.path.join(DATA, f"{year}.mjs"), "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines))
        print(f"wrote {year}.mjs")

    print(f"total unique keys: {len(used)}")


if __name__ == "__main__":
    main()
