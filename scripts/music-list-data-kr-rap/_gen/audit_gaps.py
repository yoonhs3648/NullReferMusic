#!/usr/bin/env python3
"""Per-year kept count after dedupe + global exclude."""
from __future__ import annotations
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from real_catalog_data import REAL_CATALOG
from spare_tracks import SPARE
from fix_and_emit import load_mjs_tracks, load_global_exclude, norm_key, has_bad_suffix

DATA = os.path.join(os.path.dirname(__file__), "..", "data")


def main() -> None:
    exclude = load_global_exclude()
    used: set[str] = set()
    for y in (2010, 2011):
        for a, t, _ in load_mjs_tracks(os.path.join(DATA, f"{y}.mjs")):
            used.add(norm_key(a, t))

    for year in range(2012, 2026):
        kept = 0
        rejected = []
        for a, t, al in REAL_CATALOG[year]:
            if has_bad_suffix(t):
                rejected.append((a, t, "bad_suffix"))
                continue
            k = norm_key(a, t)
            if k in used:
                rejected.append((a, t, "prior_year"))
                continue
            if k in exclude:
                rejected.append((a, t, "global"))
                continue
            used.add(k)
            kept += 1
        spare = len(SPARE.get(year, []))
        gap = max(0, 100 - kept)
        print(f"{year}: src={len(REAL_CATALOG[year])} kept={kept} gap={gap} spare={spare}")
        if gap > spare:
            print(f"  NEED {gap - spare} more in catalog or spare")
        for a, t, reason in rejected[:8]:
            print(f"    - {reason}: {a} / {t}")
        if len(rejected) > 8:
            print(f"    ... +{len(rejected) - 8} more")


if __name__ == "__main__":
    main()
