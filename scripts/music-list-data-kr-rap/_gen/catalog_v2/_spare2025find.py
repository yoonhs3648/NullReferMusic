from build_master import norm_key
from gen_spare import build_through
from underground_2025 import UNDERGROUND_2025
from fix_2024_2025 import HEAD_2025
import importlib.util
import os

HERE = os.path.dirname(__file__)
gs = build_through(2025)
b = importlib.util.spec_from_file_location("b", os.path.join(HERE, "pools_2022_2025.py"))
mod = importlib.util.module_from_spec(b)
b.loader.exec_module(mod)
in_keys = {norm_key(a, t) for a, t, _ in HEAD_2025 + mod.POOLS[2025]}

for a, t, al in UNDERGROUND_2025:
    k = norm_key(a, t)
    if k in gs or k in in_keys:
        continue
    print((a, t, al))
