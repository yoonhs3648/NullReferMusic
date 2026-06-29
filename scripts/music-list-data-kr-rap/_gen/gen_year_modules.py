#!/usr/bin/env python3
"""Generate remaining year modules from inline REAL_YEARS dict."""
from __future__ import annotations
import os

ROOT = os.path.join(os.path.dirname(__file__), "real_catalog_data")

# Import after we write - this script writes the files
REAL_YEARS: dict[int, list[tuple[str, str, str]]] = {}

def write_module(year: int, tracks: list[tuple[str, str, str]]) -> None:
    if len(tracks) != 100:
        raise SystemExit(f"{year}: expected 100, got {len(tracks)}")
    lines = ["TRACKS = ["]
    for a, t, al in tracks:
        lines.append(f'    ({a!r}, {t!r}, {al!r}),')
    lines.append("]")
    lines.append("")
    path = os.path.join(ROOT, f"y{year}.py")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print(f"wrote {path} ({len(tracks)})")

if __name__ == "__main__":
    for year, tracks in REAL_YEARS.items():
        write_module(year, tracks)
