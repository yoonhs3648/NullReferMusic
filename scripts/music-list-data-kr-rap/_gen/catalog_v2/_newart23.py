from build_master import norm_key, load_module, HERE, GEN, load_global_exclude
from gen_spare import build_through
from fix_2023 import CANDIDATES_2023, EXTRA_2023

gs = build_through(2023)
ex = load_global_exclude()
b = load_module("b", f"{HERE}/pools_2022_2025.py")
pool_artists = {a for a, _, _ in b.POOLS[2023]}
head_artists = {a for a, _, _ in b.HEAD[2023]}
in_pool = pool_artists | head_artists

for src in (CANDIDATES_2023, EXTRA_2023):
    for a, t, al in src:
        k = norm_key(a, t)
        if k in gs or k in ex:
            continue
        if a not in in_pool:
            print((a, t, al))
