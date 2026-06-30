from collections import Counter
from build_master import norm_key
from gen_spare import build_through
from fix_2024_2025 import HEAD_2025, pick_pool
from underground_2025 import UNDERGROUND_2025

gs = build_through(2025)
ok = [(a, t, al) for a, t, al in UNDERGROUND_2025 if norm_key(a, t) not in gs]
seen = set()
uniq = []
for x in ok:
    k = norm_key(x[0], x[1])
    if k in seen:
        continue
    seen.add(k)
    uniq.append(x)
pool = pick_pool(2025, HEAD_2025, uniq)
all_t = HEAD_2025 + pool
c = Counter(a for a, _, _ in all_t)
cap = sum(min(2, n) for n in c.values())
print("ok", len(uniq), "pool", len(pool), "capacity", cap)
