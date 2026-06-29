#!/usr/bin/env python3
"""Emit data/2012.mjs–2025.mjs from curated real-catalog/*.json (no filler)."""
from __future__ import annotations
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "..", "data")
REAL_DIR = os.path.join(ROOT, "real-catalog")


def norm_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = s.lower().strip()
        s = s.replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()

    return f"{norm(artist)}|{norm(title)}"


def load_json_tracks(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list) or len(raw) != 100:
        raise SystemExit(f"{path}: expected 100-track array, got {len(raw) if isinstance(raw, list) else type(raw)}")
    return raw


def load_mjs_keys(path: str) -> set[str]:
    text = open(path, encoding="utf-8").read()
    keys = set()
    for m in re.finditer(r'artist:\s*"((?:\\.|[^"\\])*)"\s*,\s*title:\s*"((?:\\.|[^"\\])*)"', text):
        artist = bytes(m.group(1), "utf-8").decode("unicode_escape")
        title = bytes(m.group(2), "utf-8").decode("unicode_escape")
        keys.add(norm_key(artist, title))
    return keys


def load_global_exclude(repo: str) -> set[str]:
    keys: set[str] = set()
    for sub in ("music-list-data", "music-list-data-global"):
        d = os.path.join(repo, "scripts", sub)
        if not os.path.isdir(d):
            continue
        for fn in os.listdir(d):
            if not fn.endswith(".json"):
                continue
            for row in json.load(open(os.path.join(d, fn), encoding="utf-8")):
                keys.add(norm_key(row["artist"], row["title"]))
    return keys


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def has_year_suffix(title: str) -> bool:
    return bool(re.search(r"\(\d{4}(?:\s+Mix)?\)\s*$", title))


def main() -> None:
    repo = os.path.abspath(os.path.join(ROOT, "..", ".."))
    exclude = load_global_exclude(repo)
    used: dict[str, int] = {}

    for y in (2010, 2011):
        p = os.path.join(DATA_DIR, f"{y}.mjs")
        for k in load_mjs_keys(p):
            used[k] = y

    lines_out: dict[int, list[str]] = {}

    for year in range(2012, 2026):
        src = os.path.join(REAL_DIR, f"{year}.json")
        if not os.path.isfile(src):
            raise SystemExit(f"missing {src}")
        tracks = load_json_tracks(src)
        body = ["export default ["]
        for i, t in enumerate(tracks, start=1):
            artist = t["artist"].strip()
            title = t["title"].strip()
            album = (t.get("album") or "").strip()
            if has_year_suffix(title):
                raise SystemExit(f"year suffix title forbidden: {artist} - {title}")
            key = norm_key(artist, title)
            if key in exclude:
                raise SystemExit(f"cross-list overlap: {artist} - {title} ({year})")
            if key in used:
                raise SystemExit(f"duplicate: {artist} - {title} ({year}) vs {used[key]}")
            used[key] = year
            body.append(
                f'  {{ rank: {i}, year: {year}, artist: "{esc(artist)}", title: "{esc(title)}", album: "{esc(album)}" }},'
            )
        body.append("];")
        body.append("")
        lines_out[year] = body

    os.makedirs(DATA_DIR, exist_ok=True)
    for year, body in lines_out.items():
        out = os.path.join(DATA_DIR, f"{year}.mjs")
        with open(out, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(body))

    print(f"OK: wrote 2012-2025 ({len(used)} unique kr-rap keys total incl. 2010-2011)")


if __name__ == "__main__":
    main()
