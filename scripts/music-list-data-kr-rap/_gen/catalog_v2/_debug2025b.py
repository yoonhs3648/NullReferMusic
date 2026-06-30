#!/usr/bin/env python3
"""2025: global 미사용·아티스트 1곡만 있는 경우 2곡째 후보."""
from collections import Counter, defaultdict
import importlib.util
import os

from build_master import norm_key, load_global_exclude
from gen_spare import build_through
from underground_2025 import UNDERGROUND_2025

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "..")


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def partial():
    from _debug2025 import partial_build
    return partial_build()


result, ac, gs, ordered = partial()
exclude = load_global_exclude()
one_track = [a for a, n in ac.items() if n == 1]
print(f"one-track artists ({len(one_track)}):")
by_a = defaultdict(list)
for a, t, al in UNDERGROUND_2025:
    by_a[a].append((a, t, al))

for a in sorted(one_track):
    opts = []
    for x in by_a.get(a, []):
        k = norm_key(x[0], x[1])
        if k not in gs and k not in exclude:
            opts.append(x)
    if opts:
        print(f"  {a}: {opts[0]}")

# brand new artists in underground not in gs and not in ac
new_artists = []
for a, t, al in UNDERGROUND_2025:
    k = norm_key(a, t)
    if k in gs or k in exclude:
        continue
    if a in ac:
        continue
    new_artists.append((a, t, al))

seen = set()
uniq = []
for x in new_artists:
    k = norm_key(x[0], x[1])
    if k in seen:
        continue
    seen.add(k)
    uniq.append(x)

print(f"\nnew artist tracks not in 2025 result ({len(uniq)}):")
for x in uniq[:50]:
    print(f"  {x}")
