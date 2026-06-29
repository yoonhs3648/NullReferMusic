#!/usr/bin/env python3
"""Report/fix duplicate artist+title across kr-rap catalog (2010-2025)."""
from __future__ import annotations
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from real_catalog_data import REAL_CATALOG

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


def main() -> None:
    used: dict[str, tuple[int, str, str, str]] = {}
    for y in (2010, 2011):
        for a, t, al in load_mjs_tracks(os.path.join(DATA, f"{y}.mjs")):
            used[norm_key(a, t)] = (y, a, t, al)

    removals: list[tuple[int, str, str]] = []
    for year in sorted(REAL_CATALOG.keys()):
        tracks = REAL_CATALOG[year]
        print(f"{year}: {len(tracks)} tracks")
        if len(tracks) != 100:
            print(f"  BAD COUNT")
        kept = []
        for a, t, al in tracks:
            k = norm_key(a, t)
            if k in used:
                prev = used[k]
                removals.append((year, a, t))
                print(f"  DUP vs {prev[0]}: {a} - {t}")
            else:
                used[k] = (year, a, t, al)
                kept.append((a, t, al))
        if len(kept) != len(tracks):
            print(f"  would keep {len(kept)}")

    print(f"\nTotal unique: {len(used)}")
    print(f"Removals needed: {len(removals)}")


if __name__ == "__main__":
    main()
