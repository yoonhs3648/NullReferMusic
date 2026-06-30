#!/usr/bin/env python3
"""y2024 중복 교체 후보."""
import importlib.util
import os
import re

HERE = os.path.dirname(__file__)
from build_master import norm_key

used = set()
for y in range(2010, 2025):
    path = os.path.join(HERE, f"y{y}.py")
    if not os.path.isfile(path):
        continue
    text = open(path, encoding="utf-8").read()
    for m in re.finditer(r"\('([^']+)',\s*'([^']*)'", text):
        used.add(norm_key(m.group(1), m.group(2)))

from underground_2024 import UNDERGROUND_2024

ac2024 = {}
for m in re.finditer(r"\('([^']+)',\s*'([^']*)'", open(os.path.join(HERE, "y2024.py"), encoding="utf-8").read()):
    a = m.group(1)
    ac2024[a] = ac2024.get(a, 0) + 1

for a, t, al in UNDERGROUND_2024:
    k = norm_key(a, t)
    if k in used:
        continue
    if ac2024.get(a, 0) >= 2:
        continue
    print((a, t, al))
