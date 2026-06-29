#!/usr/bin/env python3
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fix_and_emit import *
from real_catalog_data import REAL_CATALOG
from spare_tracks import SPARE

exclude = load_global_exclude()
used = set()
for y in (2010, 2011):
    for a, t, _ in load_mjs_tracks(os.path.join(DATA, f"{y}.mjs")):
        used.add(norm_key(a, t))
for year in range(2012, 2023):
    kept = []
    for a, t, al in REAL_CATALOG[year]:
        if has_bad_suffix(t):
            continue
        k = norm_key(a, t)
        if k in used or k in exclude:
            continue
        used.add(k)
        kept.append((a, t))
    while len(kept) < 100:
        pool = SPARE.get(year, [])
        added = False
        for a, t, al in pool:
            k = norm_key(a, t)
            if k in used or k in exclude:
                continue
            used.add(k)
            kept.append((a, t))
            added = True
            break
        if not added:
            break
    if len(kept) > 100:
        kept = kept[:100]

kept23 = []
for a, t, al in REAL_CATALOG[2023]:
    k = norm_key(a, t)
    if has_bad_suffix(t):
        print("bad", a, t)
    elif k in used or k in exclude:
        print("miss", a, t)
    else:
        used.add(k)
        kept23.append((a, t))
print("2023 kept", len(kept23))
