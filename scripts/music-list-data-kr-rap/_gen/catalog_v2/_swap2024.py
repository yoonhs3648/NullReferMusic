import glob
import importlib.util
from build_master import norm_key, HERE
from gen_spare import build_through
from _extra2024 import EXTRA

gs = build_through(2024)
ok2024 = {norm_key(a, t) for a, t, al in EXTRA if norm_key(a, t) not in gs}

for fn in sorted(glob.glob(f"{HERE}/y20*.py")):
    y = int(fn.split("y")[1].split(".")[0])
    if y >= 2024:
        continue
    spec = importlib.util.spec_from_file_location("m", fn)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    hits = [(a, t, al) for a, t, al in mod.TRACKS if norm_key(a, t) in ok2024]
    if hits:
        print(f"y{y} ({len(hits)}):", [(a, t[:25]) for a, t, al in hits[:8]])
