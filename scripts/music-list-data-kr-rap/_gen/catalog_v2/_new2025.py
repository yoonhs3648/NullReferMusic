#!/usr/bin/env python3
"""2010-2024에 한 번도 안 나온 아티스트 찾기."""
import importlib.util
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))

artists = set()
for y in range(2010, 2025):
    path = os.path.join(HERE, f"y{y}.py")
    if not os.path.isfile(path):
        continue
    text = open(path, encoding="utf-8").read()
    for m in re.finditer(r"\('([^']+)'", text):
        artists.add(m.group(1))

print(f"artists 2010-2024: {len(artists)}")

candidates = [
    ("Mushvenom", "돌림판 (Feat. 신빠람 이박사)", "얼"),
    ("Mushvenom", "몰러유", "얼"),
    ("Mushvenom", "오랫동안 (Feat. 거북이)", "얼"),
    ("Mushvenom", "오토매틱 (Feat. 코요태)", "얼"),
    ("Mushvenom", "날다람쥐", "얼"),
    ("Mushvenom", "빠에", "얼"),
    ("Mushvenom", "오늘날", "얼"),
    ("Mushvenom", "띵띵땡땡", "얼"),
    ("Mushvenom", "모나리자", "얼"),
    ("Mushvenom", "얼", "얼"),
    ("Penomeco", "EGGE (Feat. YDG)", "RNSSNC TAPE"),
    ("Penomeco", "BOLO (Feat. YDG)", "RNSSNC TAPE"),
    ("Penomeco", "RNSSNC TAPE", "RNSSNC TAPE"),
    ("Kmjae", "비폴라", "비폴라"),
    ("Kmjae", "Polar", "비폴라"),
    ("Hebi", "Hebi", ""),
    ("BeeFree", "Odyssey", "Odyssey"),
    ("Hebi", "시바세키", "Odyssey"),
    ("SINCE", "New New New", ""),
    ("SINCE", "Wavy", ""),
    ("Liloyoung", "Liloyoung", ""),
    ("RPT Kaigo", "Kaigo", ""),
    ("YUNGIN", "YUNGIN", ""),
    ("Blase", "KKUCKDARI", "SELF MADE"),
    ("Blase", "INDUSTRY", "SELF MADE"),
    ("Ourealgoat", "Maybe", ""),
    ("Blued", "Tears", ""),
    ("Coq", "Tweaker", ""),
    ("DeVita", "Ride or Die", ""),
    ("Rad Museum", "Girls", "Life"),
    ("meenoi", "Malfunction", ""),
    ("O'koye", "Yezzir", "Whether the Weather Changes or Not"),
    ("O'koye", "Hallelujah", "Whether the Weather Changes or Not"),
    ("Minit", "He♡rt", "He♡rt"),
    ("Okashii", "Orton", "Orton"),
    ("Ted Park", "Home Alone 2.0", "Home Alone 2.0"),
    ("D.Ark", "Undercover", "Genius"),
    ("EK", "Escape", "Escape"),
    ("Bryn", "Supercharged", "Supercharged"),
    ("Balming Tiger", "Greatest Hits", "Greatest Hits"),
    ("RM", "Right Place, Wrong Person", "Right Place, Wrong Person"),
    ("BRADYSTREET", "Brady Street", ""),
    ("BRADYSTREET", "Heavy", ""),
    ("Gist", "Engagement", ""),
    ("TOIL", "염염상망", ""),
    ("Sokodomo", "Merry Go Round", "Merry Go Round"),
    ("Dynamic Duo", "Highfive", ""),
    ("Gray", "SLIDIN'", ""),
    ("Gray", "Real Love", "Remedy"),
    ("Ash Island", "Malibu", "Ash Island"),
    ("Ash Island", "ISLAND", "ISLAND"),
    ("Giriboy", "Mechanical Album", "Mechanical Album"),
    ("Giriboy", "heat", "heat"),
    ("YUMDDA", "Tic Toc", "I'm Good"),
    ("BewhY", "Cult of Curiosity", "Cult of Curiosity"),
    ("Don Malik", "THURSDAYCLUB MIXTAPE", "THURSDAYCLUB MIXTAPE"),
    ("Nafla", "MVP", "[ Album ]"),
    ("Sik-K", "MAKE OUT", "MAKE OUT"),
    ("Sik-K", "Wet", "MAKE OUT"),
    ("Sik-K", "KC (BUST IT DOWN)", ""),
    ("HAON", "KC (BUST IT DOWN)", ""),
    ("Mino", "Trigger", "XX"),
    ("Zion.T", "Snooze", "Zion.T Special: OO"),
    ("BE'O", "Momentum", "Show Me the Money 10"),
    ("BE'O", "Healing", "Show Me the Money 10"),
    ("Lee Young Ji", "Not Sure", "16"),
    ("Lee Young Ji", "Yumeyo", "16"),
    ("Jessi", "Zoom", ""),
    ("Jvcki Wai", "Taxi Blurr", "Taxi Blurr"),
    ("Hash Swan", "Hash Brand", "Hash Brand"),
    ("Loopy", "DOPE", "SEOUL pt.A"),
    ("Loopy", "CROWN", "SEOUL pt.A"),
    ("Loopy", "MARNI", "MARNI"),
    ("Owen Ovadoz", "Diamond", "119"),
    ("Owen Ovadoz", "P.O.E.M.", "P.O.E.M."),
    ("Woodie Gochild", "Mood Swings", "#GOchild"),
    ("Mirani", "Drama", "Drama"),
    ("The Quiett", "LF Intro", "Luxury Flow"),
    ("The Quiett", "Crystal Crates", "Luxury Flow"),
    ("Leellamarz", "Hell yea", "L&B"),
    ("Leellamarz", "Let me go to heaven", ""),
    ("Leellamarz", "GONE", ""),
    ("Leellamarz", "B", ""),
    ("meenoi", "B", ""),
    ("Qwala", "델러가 (Feat. MELOH & Posadic)", "yorter"),
    ("Qwala", "DISTORTED", "DISTORTED"),
    ("Kid Milli", "5AM", "RAD MILLI"),
    ("Dean", "NASA", "3:33"),
    ("Jay Park", "Taxi Blurr", ""),
    ("Crush", "Yes or No", ""),
    ("Heize", "Even if (이븐 이프)", ""),
    ("Zico", "ZOOM", ""),
    ("Changmo", "Wonderful Days", ""),
    ("Bobby", "Sae", "Sir.Robert"),
    ("Coogie", "ON FIRE", ""),
    ("Epik High", "Frost", "Strawberry"),
    ("Epik High", "Pump", "Pump"),
    ("BIG Naughty", "+", "+"),
    ("Kid Milli", "+", "+"),
    ("Haon", "Haonoah", "Haonoah"),
    ("Flowsik", "Worlds Apart", "Worlds Apart"),
    ("Khundi Panda", "Somozu Fury", ""),
    ("Khundi Panda", "MODM 2 : The Bento Knight", "MODM 2 : The Bento Knight"),
    ("J'Kyun", "AGAPE", "AGAPE"),
    ("HD BL4CK", "Vantablack Dreams", "Vantablack Dreams"),
    ("HD BL4CK", "BATON PASS", "BATON PASS"),
    ("KIDO", "MACHINES", ""),
    ("viceversa", "N!kes", ""),
    ("viceversa", "I'M UP", ""),
    ("ShyboiiTobii", "Dillis", ""),
    ("ShyboiiTobii", "Breaking Bad", ""),
    ("KAMBO", "Rapstar", ""),
    ("KAMBO", "Dreamatic", "Dreamatic"),
    ("1300", "Ape Sh*t", ""),
    ("Minit", "He♡rt", "He♡rt"),
]

from build_master import norm_key, load_global_exclude
from gen_spare import build_through

gs = set(build_through(2025))
exclude = load_global_exclude()

new = []
for a, t, al in candidates:
    if a in artists:
        continue
    k = norm_key(a, t)
    if k in gs or k in exclude:
        continue
    new.append((a, t, al))

print(f"new artist tracks: {len(new)}")
for x in new:
    print(x)

# also penomeco new titles
for a, t, al in candidates:
    if a not in artists:
        continue
    k = norm_key(a, t)
    if k in gs or k in exclude:
        continue
    if "2025" in t or True:
        pass

print("\n--- new titles for existing artists ---")
for a, t, al in candidates:
    k = norm_key(a, t)
    if k in gs or k in exclude:
        continue
    print((a, t, al))
