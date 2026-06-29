#!/usr/bin/env python3
"""Build dedupe-safe y2020.py from 2020 album/single releases only."""
from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_y2018 import build_used_through
from fix_and_emit import norm_key, has_bad_suffix

CANDIDATES = [
    ("PH-1", "MEET N GREET", "X"),
    ("PH-1", "OKAY", "X"),
    ("PH-1", "PACKITUP!", "X"),
    ("PH-1", "CIRCLE", "X"),
    ("PH-1", "FLARE", "X"),
    ("PH-1", "ZOMBIE", "X"),
    ("PH-1", "MALIBU", "X"),
    ("PH-1", "PARTY PEEPS", "X"),
    ("PH-1", "STAY WITH ME", "X"),
    ("PH-1", "GLASS", "X"),
    ("Coogie", "Up!", "Up!"),
    ("Coogie", "Alright", "Up!"),
    ("Coogie", "Money", "Up!"),
    ("Coogie", "Loyalty", "Up!"),
    ("Coogie", "Justin Bieber", "Up!"),
    ("Coogie", "Show Me the Money", "Up!"),
    ("Coogie", "Palette", "Up!"),
    ("Coogie", "Pick up your phone", "Up!"),
    ("Kid Milli", "Beige 0.5", "Beige 0.5"),
    ("Kid Milli", "BOOK TRAILER", "Beige 0.5"),
    ("Kid Milli", "PROUD", "Beige 0.5"),
    ("Kid Milli", "flex", "Beige 0.5"),
    ("Kid Milli", "AHHHHHHHHHH", "Beige 0.5"),
    ("Kid Milli", "SCORPION", "Beige 0.5"),
    ("Kid Milli", "Benzo", ""),
    ("Beenzino", "Reset", "Reset"),
    ("Beenzino", "Melody", "Reset"),
    ("Beenzino", "Broken Clock", "Reset"),
    ("Beenzino", "Nowitzki", "Nowitzki"),
    ("Beenzino", "Statue of Limitations", "Nowitzki"),
    ("Beenzino", "Scent of Rain", "Nowitzki"),
    ("Beenzino", "Fashion Hoarder", "Modiversity"),
    ("Beenzino", "Modiversity", "Modiversity"),
    ("Changmo", "METEORITE", "Meteor"),
    ("Changmo", "MMMM", "Meteor"),
    ("Changmo", "Hip Hop Baby", "Meteor"),
    ("Changmo", "Swoosh!", "Meteor"),
    ("Changmo", "BAND", "Meteor"),
    ("Changmo", "Band Up", "Band Up"),
    ("Changmo", "METAVERS", "Band Up"),
    ("Ash Island", "Melodies", "Melodies"),
    ("Ash Island", "Melody", "Melodies"),
    ("Ash Island", "Rainbow", "Melodies"),
    ("Ash Island", "Sculpture", "Melodies"),
    ("Ash Island", "Nightmare", "Melodies"),
    ("HAON", "You and I", "Melodies"),
    ("HAON", "Melody", "Melodies"),
    ("Leellamarz", "Ale", "Marz & Ale"),
    ("Leellamarz", "1,2", "Marz & Ale"),
    ("Leellamarz", "Marz", "Marz & Ale"),
    ("Leellamarz", "Don`t Say That", "Don`t Say That"),
    ("Giriboy", "Lonely", "Lonely"),
    ("Giriboy", "Because I Love You", "Lonely"),
    ("Giriboy", "Band", "Lonely"),
    ("Nafla", "understand", "understand"),
    ("Nafla", "what is your name", "understand"),
    ("Loopy", "ON THE Radar", "ON THE Radar"),
    ("Loopy", "Radar", "ON THE Radar"),
    ("Jay Park", "Forget About Tomorrow", "Forget About Tomorrow"),
    ("Jay Park", "Need That", "Forget About Tomorrow"),
    ("Jay Park", "Gonzo", "Gonzo"),
    ("Loco", "Hello", "Hello"),
    ("Loco", "The Show", "Hello"),
    ("Loco", "Warning", "Hello"),
    ("Loco", "My Favorite", "My Favorite"),
    ("Gray", "summer", "summer"),
    ("Gray", "00 XX", "00 XX"),
    ("Gray", "Adios", "00 XX"),
    ("Sik-K", "Bungee", "Bungee"),
    ("Sik-K", "STOPTHAT", ""),
    ("Crush", "Click Like", "Click Like"),
    ("Paul Blanco", "Click Like", "Click Like"),
    ("Heize", "Run to You", "Run to You"),
    ("Dean", "Peace", "Peace"),
    ("Punchnello", "Winter Blossom", "Winter Blossom"),
    ("Colde", "Star", "Star"),
    ("Colde", "honestly", "Star"),
    ("Swings", "Shook Ones", "Shook Ones"),
    ("Simon Dominic", "GOTT", "GOTT"),
    ("Primary", "2", "2"),
    ("Gaeko", "Rosetta", "Rosetta"),
    ("Bobby", "Lalala", "Lalala"),
    ("Mino", "Booker", "Booker"),
    ("Tablo", "Birthday", "Birthday"),
    ("Code Kunst", "Buckle Up", "Code Kunst Archive Pack 02"),
    ("Code Kunst", "Jungle", "Code Kunst Archive Pack 02"),
    ("Zion.T", "Spring Dream", "Zionic"),
    ("Zico", "Summer Hate", "Human"),
    ("Bumkey", "Single Life 2", "Single Life 2"),
    ("TOIL", "MAZE", "MAZE"),
    ("Mudd the student", "Do You Like Haeseon", "Show Me the Money 9"),
    ("Mudd the student", "Mockingbird", "Show Me the Money 9"),
    ("Lil Boi", "On My Way", "Show Me the Money 9"),
    ("Woodie Gochild", "WaRRior", "Show Me the Money 9"),
    ("Sokodomo", "IF I", "Show Me the Money 9"),
    ("Owen Ovadoz", "119 REMIX", "Show Me the Money 9"),
    ("Giriboy", "on my way", "Show Me the Money 9"),
    ("Lil Moshpit", "BITE", "Show Me the Money 9"),
    ("Blase", "Fill It", "Show Me the Money 9"),
    ("Koonta", "Unbreakable", "Show Me the Money 9"),
    ("Mirani", "VANS", "Show Me the Money 9"),
    ("Kid Milli", "Summer", ""),
    ("Changmo", "Just the Two of Us", ""),
    ("Changmo", "SMF", ""),
    ("Loco", "Wedding", ""),
    ("Loco", "Aniya", ""),
    ("Jay Park", "McNasty", ""),
    ("Jay Park", "B Day", ""),
    ("Zion.T", "Lonely Christmas", ""),
    ("Punchnello", "Loveseat", ""),
    ("Punchnello", "Cream Cheese", ""),
    ("Blase", "Quote That", ""),
    ("The Quiett", "Nike", ""),
    ("Paloalto", "Valentina", ""),
    ("TOIL", "like when we first met", ""),
    ("Lil Moshpit", "Moshpit Only", "AAA"),
    ("Lil Moshpit", "Gotta Lotta Shit", "AAA"),
    ("Lil Moshpit", "Yooooo", "AAA"),
    ("Lil Moshpit", "A-Team Freestyle", "AAA"),
    ("Lil Moshpit", "Slatty Slut", "AAA"),
    ("Lil Moshpit", "ON THE BLOCK", "AAA"),
    ("Lil Moshpit", "DIE HARD", "AAA"),
    ("Lil Moshpit", "BO$$", "AAA"),
    ("Lil Moshpit", "Back In My AREA", "AAA"),
    ("The Quiett", "Bentley", ""),
    ("Kid Milli", "Lightly", ""),
    ("Changmo", "FWB", ""),
    ("Punchnello", "Motive", ""),
    ("Colde", "Wave", ""),
    ("Leellamarz", "STORY", "Toystory3"),
    ("Leellamarz", "Last Chance", "Toystory3"),
    ("Leellamarz", "Don`t do That", "Toystory3"),
    ("Leellamarz", "Separation Anxiety", "Toystory3"),
    ("Leellamarz", "Never Ending Story", "Toystory3"),
    ("Leellamarz", "Aftermath", "Toystory3"),
    ("Leellamarz", "B.B.B", "Toystory3"),
    ("Leellamarz", "Flower Age", "Toystory3"),
    ("Leellamarz", "1,2,3", "Toystory3"),
    ("Leellamarz", "2AM", "Toystory3"),
    ("Leellamarz", "Zero Coke", "Toystory3"),
    ("Leellamarz", "Iris", "Toystory3"),
]


def main() -> None:
    used, exclude = build_used_through(2020)
    picked: list[tuple[str, str, str]] = []
    for a, t, al in CANDIDATES:
        if has_bad_suffix(t):
            continue
        k = norm_key(a, t)
        if k in used or k in exclude:
            continue
        used.add(k)
        picked.append((a, t, al))
        if len(picked) == 100:
            break
    print(f"picked {len(picked)}")
    if len(picked) != 100:
        raise SystemExit("failed")
    lines = ["TRACKS = ["]
    for a, t, al in picked:
        lines.append(f"    ({a!r}, {t!r}, {al!r}),")
    lines.append("]")
    lines.append("")
    path = os.path.join(os.path.dirname(__file__), "real_catalog_data", "y2020.py")
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
