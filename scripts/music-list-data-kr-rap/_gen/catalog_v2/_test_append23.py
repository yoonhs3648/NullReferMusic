from build_master import norm_key, load_module, HERE, GEN, build_from_pool, load_global_exclude
from gen_spare import build_through

APPEND = [
    ("Mirani", "Ticket", "Ticket"),
    ("Woodie Gochild", "GOchild", "#GOchild"),
    ("Giriboy", "PlanetariuM", "Engineering"),
    ("Punchnello", "Everyday", "Everyday"),
    ("Swings", "Growing Pains 2", "Growing Pains 2"),
]

gs = build_through(2023)
for a, t, al in APPEND:
    print("G" if norm_key(a, t) in gs else "O", a, t)

b = load_module("b", f"{HERE}/pools_2022_2025.py")
sp = load_module("s", f"{GEN}/spare_tracks.py")
pool = list(b.POOLS[2023]) + APPEND
gs2 = set(build_through(2023))
ex = load_global_exclude()
try:
    r = build_from_pool(2023, pool + sp.SPARE.get(2023, []), gs2, ex, head=b.HEAD[2023], round_robin=True)
    print("OK", len(r))
except Exception as e:
    print("FAIL", e)
