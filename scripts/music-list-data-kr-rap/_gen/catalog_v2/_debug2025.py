#!/usr/bin/env python3
"""2025 빌드 실패 원인: 부족분·아티스트 용량 분석."""
from collections import Counter
import importlib.util
import os

from build_master import norm_key, build_from_pool, load_global_exclude
from gen_spare import build_through

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "..")


def load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def partial_build():
    gs = set(build_through(2025))
    exclude = load_global_exclude()
    b2225 = load_module("b2225", os.path.join(HERE, "pools_2022_2025.py"))
    spare = load_module("spare", os.path.join(GEN, "spare_tracks.py"))
    pool = b2225.POOLS[2025] + spare.SPARE.get(2025, [])
    head = b2225.HEAD.get(2025)

    ordered = []
    seen_local = set()
    for a, t, al in (head or []):
        k = norm_key(a, t)
        if k not in seen_local:
            ordered.append((a, t, al))
            seen_local.add(k)
    for a, t, al in pool:
        k = norm_key(a, t)
        if k in seen_local:
            continue
        seen_local.add(k)
        ordered.append((a, t, al))

    result = []
    artist_count = {}
    global_seen = set(gs)

    def try_add(a, t, al):
        if len(result) >= 100:
            return False
        if artist_count.get(a, 0) >= 2:
            return False
        k = norm_key(a, t)
        if k in global_seen or k in exclude:
            return False
        result.append((a, t, al))
        artist_count[a] = artist_count.get(a, 0) + 1
        global_seen.add(k)
        return True

    head_keys = {norm_key(a, t) for a, t, _ in (head or [])}
    for a, t, al in head or []:
        try_add(a, t, al)

    pool_tracks = [(a, t, al) for a, t, al in ordered if norm_key(a, t) not in head_keys]
    by_artist = {}
    artist_order = []
    for item in pool_tracks:
        a = item[0]
        if a not in by_artist:
            by_artist[a] = []
            artist_order.append(a)
        by_artist[a].append(item)

    for round_i in range(2):
        for a in artist_order:
            if len(result) >= 100:
                break
            tracks = by_artist[a]
            if len(tracks) <= round_i:
                continue
            aa, t, al = tracks[round_i]
            try_add(aa, t, al)

    for a, t, al in pool_tracks:
        if len(result) >= 100:
            break
        try_add(a, t, al)

    return result, artist_count, global_seen, ordered


result, ac, gs, ordered = partial_build()
print(f"got {len(result)}/100, artists {len(ac)}")
print(f"artists at max(2): {sum(1 for n in ac.values() if n >= 2)}")
print(f"artists with 1: {sum(1 for n in ac.values() if n == 1)}")

eligible = []
for a, t, al in ordered:
    k = norm_key(a, t)
    if k in gs:
        continue
    if ac.get(a, 0) >= 2:
        continue
    eligible.append((a, t, al))

print(f"eligible remaining in pool: {len(eligible)}")
for x in eligible[:30]:
    print(" ", x)

# tracks not in pool at all
from underground_2025 import UNDERGROUND_2025

in_pool = {norm_key(a, t) for a, t, _ in ordered}
extra = []
for a, t, al in UNDERGROUND_2025:
    k = norm_key(a, t)
    if k in gs or k in in_pool:
        continue
    if ac.get(a, 0) >= 2:
        continue
    extra.append((a, t, al))

print(f"\nextra from underground not in pool: {len(extra)}")
for x in extra[:40]:
    print(" ", x)
