#!/usr/bin/env python3
"""global_seen·exclude에 걸리는 2025 spare/pool 트랙 통계."""
import importlib.util
import os
from collections import Counter

from build_master import norm_key, load_global_exclude
from gen_spare import build_through

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "..")


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gs_start = set(build_through(2025))
exclude = load_global_exclude()
b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
spare = load_module("spare", os.path.join(GEN, "spare_tracks.py"))
from underground_2025 import UNDERGROUND_2025

all_c = UNDERGROUND_2025 + spare.SPARE.get(2025, []) + b2225.POOLS[2025]
seen = set()
uniq = []
for x in all_c:
    k = norm_key(x[0], x[1])
    if k in seen:
        continue
    seen.add(k)
    uniq.append(x)

in_prior = in_excl = ok = 0
ok_list = []
for a, t, al in uniq:
    k = norm_key(a, t)
    if k in gs_start:
        in_prior += 1
    elif k in exclude:
        in_excl += 1
    else:
        ok += 1
        ok_list.append((a, t, al))

print(f"unique candidates: {len(uniq)}")
print(f"blocked prior years: {in_prior}, exclude: {in_excl}, available: {ok}")
c = Counter(a for a, _, _ in ok_list)
cap = sum(min(2, n) for n in c.values())
print(f"available artists: {len(c)}, theoretical cap: {cap}")
for x in ok_list:
    print(repr(x))
