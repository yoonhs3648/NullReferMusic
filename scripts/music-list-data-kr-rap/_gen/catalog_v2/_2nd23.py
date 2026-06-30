from build_master import norm_key
from gen_spare import build_through
from fix_2023 import EXTRA_2023, CANDIDATES_2023

gs = build_through(2023)
one = [
    "Qwala", "DeVita", "Mirani", "Woodie Gochild", "PLT", "Knoxx",
    "Rad Museum", "Queenpia", "MoonMoon", "BE'O", "Sokodomo",
    "Trade L", "Wonstein", "Ash Island", "Hash Swan", "Flowsik",
    "Reddy", "KittiB", "Koonta", "Giriboy", "Swings", "Baechigi",
    "Owen Ovadoz", "Blase", "BIG Naughty", "Mudd the student",
]
for src in (EXTRA_2023, CANDIDATES_2023):
    for a, t, al in src:
        if a in one and norm_key(a, t) not in gs:
            print((a, t, al))
