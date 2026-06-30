#!/usr/bin/env python3
import importlib.util, os
from build_master import norm_key, load_global_exclude
from gen_spare import build_through
from _debug2025 import partial_build

result, ac, gs, ordered = partial_build()
exclude = load_global_exclude()
GEN = os.path.join(os.path.dirname(__file__), "..")
spare = importlib.util.spec_from_file_location("s", os.path.join(GEN, "spare_tracks.py"))
spare.loader.exec_module(importlib.util.module_from_spec(spare) or __import__('types').SimpleNamespace())
# reload properly
spec = importlib.util.spec_from_file_location("spare", os.path.join(GEN, "spare_tracks.py"))
sp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sp)

missing = []
for a, t, al in sp.SPARE.get(2025, []):
    k = norm_key(a, t)
    if k in gs or k in exclude:
        continue
    if ac.get(a, 0) >= 2:
        continue
    if any(norm_key(x[0], x[1]) == k for x in result):
        continue
    missing.append((a, t, al, ac.get(a, 0)))

print(f"missing spare picks: {len(missing)}")
for x in missing[:20]:
    print(x)
