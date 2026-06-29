#!/usr/bin/env python3
"""Validate real catalog against 2010-2011 and global JSON exclude lists."""
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


def load_mjs_keys(path: str) -> set[str]:
    text = open(path, encoding="utf-8").read()
    keys = set()
    for m in re.finditer(r'artist:\s*"((?:\\.|[^"\\])*)"\s*,\s*title:\s*"((?:\\.|[^"\\])*)"', text):
        artist = bytes(m.group(1), "utf-8").decode("unicode_escape")
        title = bytes(m.group(2), "utf-8").decode("unicode_escape")
        keys.add(norm_key(artist, title))
    return keys


def load_global_exclude() -> set[str]:
    keys: set[str] = set()
    for sub in ("music-list-data", "music-list-data-global"):
        d = os.path.join(REPO, "scripts", sub)
        for fn in os.listdir(d):
            if fn.endswith(".json"):
                for row in json.load(open(os.path.join(d, fn), encoding="utf-8")):
                    keys.add(norm_key(row["artist"], row["title"]))
    return keys


def main() -> None:
    used: dict[str, int] = {}
    for y in (2010, 2011):
        for k in load_mjs_keys(os.path.join(DATA, f"{y}.mjs")):
            used[k] = y
    exclude = load_global_exclude()
    bad_suffix = re.compile(r"\(\d{4}(?:\s+Mix)?\)\s*$")
    for year, tracks in sorted(REAL_CATALOG.items()):
        if len(tracks) != 100:
            print(f"FAIL {year}: count {len(tracks)}")
            continue
        for artist, title, album in tracks:
            if bad_suffix.search(title):
                print(f"FAIL suffix: {year} {artist} - {title}")
            k = norm_key(artist, title)
            if k in exclude:
                print(f"FAIL global: {year} {artist} - {title}")
            if k in used:
                print(f"FAIL dup: {year} {artist} - {title} vs {used[k]}")
            used[k] = year
    print(f"OK checked {len(REAL_CATALOG)} years, {len(used)} total keys")


if __name__ == "__main__":
    main()
