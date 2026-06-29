#!/usr/bin/env python3
"""Write real-catalog/*.json from curated REAL_CATALOG (no filler)."""
from __future__ import annotations
import json
import os
from real_catalog_data import REAL_CATALOG

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "real-catalog")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    seen: set[tuple[str, str]] = set()
    for year, tracks in REAL_CATALOG.items():
        if len(tracks) != 100:
            raise SystemExit(f"{year}: need 100 tracks, got {len(tracks)}")
        rows = []
        for artist, title, album in tracks:
            key = (artist.strip(), title.strip())
            if key in seen:
                raise SystemExit(f"dup across years: {artist} - {title}")
            seen.add(key)
            rows.append({"artist": artist, "title": title, "album": album})
        path = os.path.join(OUT, f"{year}.json")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"wrote {path}")
    print(f"total {len(seen)} unique tracks")


if __name__ == "__main__":
    main()
