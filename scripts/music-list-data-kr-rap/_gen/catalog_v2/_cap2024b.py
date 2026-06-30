from collections import Counter
from build_master import norm_key
from gen_spare import build_through
from fix_2024_2025 import HEAD_2024, pick_pool, load_extra_2024

gs = build_through(2024)
extra = load_extra_2024()
pool = pick_pool(2024, HEAD_2024, extra)
all_t = HEAD_2024 + pool
c = Counter(a for a, _, _ in all_t)
cap = sum(min(2, n) for n in c.values())
print("extra", len(extra), "pool", len(pool), "capacity", cap)
