from build_master import norm_key
from gen_spare import build_through
from fix_2024_2025 import CANDIDATES_2024, HEAD_2024
from collections import Counter

gs = build_through(2024)
ok = []
for a, t, al in HEAD_2024 + CANDIDATES_2024:
    k = norm_key(a, t)
    if k not in gs:
        ok.append((a, t, al))
seen = set()
uniq = []
for x in ok:
    k = norm_key(x[0], x[1])
    if k in seen:
        continue
    seen.add(k)
    uniq.append(x)
c = Counter(a for a, _, _ in uniq)
cap = sum(min(2, n) for n in c.values())
print("ok", len(uniq), "artists", len(c), "capacity", cap)
