import glob
import importlib.util
from build_master import norm_key, HERE
from gen_spare import build_through
from _extra2024 import EXTRA

gs = build_through(2024)
key_to_year = {}
for fn in sorted(glob.glob(f"{HERE}/y20*.py")):
    y = int(fn.split("y")[1].split(".")[0])
    if y >= 2024:
        continue
    spec = importlib.util.spec_from_file_location("m", fn)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for a, t, al in mod.TRACKS:
        key_to_year[norm_key(a, t)] = y

blocked = []
for a, t, al in EXTRA:
    k = norm_key(a, t)
    if k in gs and k in key_to_year:
        blocked.append((key_to_year[k], a, t, al))

print("blocked 2024 tracks in earlier years:", len(blocked))
from collections import Counter
print(Counter(y for y, *_ in blocked))
for item in blocked[:40]:
    print(item[0], item[1], "|", item[2][:35])
