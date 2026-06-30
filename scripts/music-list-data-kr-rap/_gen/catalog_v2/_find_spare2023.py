from build_master import norm_key, load_global_exclude
from gen_spare import build_through
from fix_2023 import EXTRA_2023, HEAD_2023, CANDIDATES_2023, pick_full_pool

gs = build_through(2023)
ex = load_global_exclude()
pool = pick_full_pool()
used = {norm_key(a, t) for a, t, _ in HEAD_2023 + pool}
for a, t, al in CANDIDATES_2023 + EXTRA_2023:
    k = norm_key(a, t)
    if k in used or k in gs or k in ex:
        continue
    print((a, t, al))
