from build_master import norm_key, load_module, HERE
from gen_spare import build_through
from fix_2023 import CANDIDATES_2023, EXTRA_2023, HEAD_2023

gs = build_through(2023)
b = load_module("b", f"{HERE}/pools_2022_2025.py")
in_keys = {norm_key(a, t) for a, t, _ in HEAD_2023 + b.POOLS[2023]}

for a, t, al in CANDIDATES_2023 + EXTRA_2023:
    k = norm_key(a, t)
    if k in gs or k in in_keys:
        continue
    print((a, t, al))
