#!/usr/bin/env python3
import importlib.util, os, re
from build_master import norm_key, load_global_exclude
from gen_spare import build_through
from _debug2025 import partial_build

result, ac, gs, _ = partial_build()
exclude = load_global_exclude()
in_result = {norm_key(a, t) for a, t, _ in result}

# one-track artists in current partial
one = [a for a, n in ac.items() if n == 1]
print("one-track:", len(one))

# try candidates
cands = [
    ("Penomeco", "RNSSNC TAPE", "RNSSNC TAPE"),
    ("SUMIN", "Mirrorball", "Mirrorball"),
    ("Tabber", "MAMMAMIA (Feat. Crush)", "FANG"),
    ("Primary", "BILLING", "BILLING"),
    ("Verbal Jint", "Brand New Day", ""),
    ("Mudd the student", "Nectar", "Show Me the Money 10"),
    ("Trade L", "Leave It (두고 가)", "Show Me the Money 10"),
    ("Lil Boi", "ONFleek", "Show Me the Money 9"),
    ("Colde", "In Your Eyes", "In Your Eyes"),
    ("Woo", "Rain Drop", "Rain Drop"),
    ("Thama", "Long Time No See", "Long Time No See"),
    ("Queenpia", "Queenpia", "Queenpia"),
    ("MoonMoon", "Tourist", "Tourist"),
    ("Futuristic Swaver", "Villain", ""),
    ("Polodared", "Multiverse", ""),
    ("Hej!", "Drive", ""),
    ("Knoxx", "Knoxx", ""),
    ("Hodaky", "Yellow", ""),
    ("Bluso", "Fade Away", ""),
    ("LeyonC", "Fall", ""),
    ("Hyunsang", "Take Care", ""),
    ("Rohann", "Sunday", ""),
    ("D.Ark", "Undercover", "Genius"),
    ("Marv", "Ok", ""),
    ("Untell", "Animal", "Animal"),
    ("Dabin", "Giggles", "Giggles"),
    ("Hyeminsong", "Reborn", "Reborn"),
    ("Ja Mezz", "Only", "Only"),
    ("Bangroz", "Only", "Only"),
    ("Minit", "He♡rt", "He♡rt"),
]

for x in cands:
    k = norm_key(x[0], x[1])
    ok = k not in gs and k not in exclude and k not in in_result and ac.get(x[0], 0) < 2
    if ok:
        print("OK", x, "artist_count", ac.get(x[0], 0))
