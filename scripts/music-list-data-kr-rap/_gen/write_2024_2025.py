#!/usr/bin/env python3
"""Write y2024.py and y2025.py with duplicate validation against y2022/y2023."""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "real_catalog_data")
sys.path.insert(0, ROOT)

from y2022 import TRACKS as T2022
from y2023 import TRACKS as T2023


def norm_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = s.lower().strip()
        s = s.replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()

    return f"{norm(artist)}|{norm(title)}"


def validate(year: int, tracks: list[tuple[str, str, str]], used: dict[str, int]) -> None:
    bad_suffix = re.compile(r"\(\d{4}(?:\s+Mix)?\)\s*$")
    if len(tracks) != 100:
        raise SystemExit(f"FAIL {year}: count {len(tracks)}")
    for artist, title, album in tracks:
        if bad_suffix.search(title):
            raise SystemExit(f"FAIL suffix: {year} {artist} - {title}")
        k = norm_key(artist, title)
        if k in used:
            raise SystemExit(f"FAIL dup: {year} {artist} - {title} vs {used[k]}")
        used[k] = year


def write_file(year: int, tracks: list[tuple[str, str, str]]) -> None:
    path = os.path.join(ROOT, f"y{year}.py")
    lines = ["TRACKS = ["]
    for artist, title, album in tracks:
        a = artist.replace("\\", "\\\\").replace("'", "\\'")
        t = title.replace("\\", "\\\\").replace("'", "\\'")
        al = album.replace("\\", "\\\\").replace("'", "\\'")
        lines.append(f"    ('{a}', '{t}', '{al}'),")
    lines.append("]\n")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


CATALOG_2024: list[tuple[str, str, str]] = [
    ("Beenzino", "Train", ""),
    ("Zico", "SPOT!", ""),
    ("Zico", "Earthquake", ""),
    ("Zico", "ZOOM", ""),
    ("Dean", "NASA", "3:33"),
    ("Dean", "Ctrl", "3:33"),
    ("G-Dragon", "HOME SWEET HOME", ""),
    ("G-Dragon", "POWER", ""),
    ("G-Dragon", "TAKE ME", ""),
    ("Changmo", "Wonderful Days", ""),
    ("Changmo", "ZOOM", ""),
    ("Heize", "Fallin'", ""),
    ("Jay Park", "Taxi Blurr", ""),
    ("Jay Park", "Stand Out", ""),
    ("Jay Park", "Mayday", "THE ONE YOU WANTED"),
    ("Jay Park", "Gimme A Minute", "THE ONE YOU WANTED"),
    ("Jay Park", "Piece Of Heaven", "THE ONE YOU WANTED"),
    ("Jay Park", "Ohx3", "THE ONE YOU WANTED"),
    ("Jay Park", "Like I Do", "THE ONE YOU WANTED"),
    ("Jay Park", "Dedicated 2 U", "THE ONE YOU WANTED"),
    ("Jay Park", "Need To Know", "THE ONE YOU WANTED"),
    ("Jay Park", "Sip Ona Lil Sum'", "THE ONE YOU WANTED"),
    ("Jay Park", "100 Days", "THE ONE YOU WANTED"),
    ("Jay Park", "Foreign", "THE ONE YOU WANTED"),
    ("Jay Park", "Never Again", "THE ONE YOU WANTED"),
    ("Jay Park", "Love Is Ugly", "THE ONE YOU WANTED"),
    ("Jay Park", "Recall", "THE ONE YOU WANTED"),
    ("Jay Park", "Chapter", "THE ONE YOU WANTED"),
    ("Jay Park", "Your/My", "THE ONE YOU WANTED"),
    ("Loco", "random summer night", ""),
    ("Loco", "Smeraldo Garden Marching Band", ""),
    ("Loco", "ON FIRE", ""),
    ("Leellamarz", "Let me go to heaven", ""),
    ("Leellamarz", "GONE", ""),
    ("Leellamarz", "Two Pills", "STILL YOUNG BOY L"),
    ("Leellamarz", "Japan", "STILL YOUNG BOY L"),
    ("Leellamarz", "Fucked", "STILL YOUNG BOY L"),
    ("Leellamarz", "Desert Flower", "STILL YOUNG BOY L"),
    ("Leellamarz", "Miss Me", "STILL YOUNG BOY L"),
    ("Leellamarz", "Can't you see me?", "STILL YOUNG BOY L"),
    ("Leellamarz", "I Like U", "STILL YOUNG BOY L"),
    ("Leellamarz", "Hell yea", "L&B"),
    ("Leellamarz", "Let off steam", "L&B"),
    ("Leellamarz", "Rise and fall", "L&B"),
    ("Leellamarz", "On the top", "L&B"),
    ("Leellamarz", "L & B", "L&B"),
    ("The Quiett", "LF Intro", "Luxury Flow"),
    ("The Quiett", "King Is Back", "Luxury Flow"),
    ("The Quiett", "Look Inside", "Luxury Flow"),
    ("The Quiett", "UGRS", "Luxury Flow"),
    ("The Quiett", "I Won't RMX", "Luxury Flow"),
    ("The Quiett", "Crystal Crates", "Luxury Flow"),
    ("The Quiett", "Mercedes", "Luxury Flow"),
    ("The Quiett", "Selfie", "Luxury Flow"),
    ("The Quiett", "Last Of Us", "Luxury Flow"),
    ("The Quiett", "What's Love Now", "Luxury Flow"),
    ("The Quiett", "Visionaire", "Luxury Flow"),
    ("The Quiett", "Dream", "Luxury Flow"),
    ("The Quiett", "After Party", "Luxury Flow"),
    ("The Quiett", "Ocean View", "Luxury Flow"),
    ("The Quiett", "Usual Suspect", "Luxury Flow"),
    ("The Quiett", "Someone Else", "Luxury Flow"),
    ("Bobby", "Intro", "Sir.Robert"),
    ("Bobby", "Sae", "Sir.Robert"),
    ("Bobby", "Why Stop Now", "Sir.Robert"),
    ("Bobby", "Harmless", "Sir.Robert"),
    ("Bobby", "Hercules!", "Sir.Robert"),
    ("Bobby", "Moon", "Sir.Robert"),
    ("Bobby", "I'll Do That", "Sir.Robert"),
    ("Bobby", "20s 30s", "Sir.Robert"),
    ("Bobby", "Help Me Out O Kill Me Not", "Sir.Robert"),
    ("Bobby", "F", "Sir.Robert"),
    ("Kid Milli", "5AM", "RAD MILLI"),
    ("Kid Milli", "Summer Time", "RAD MILLI"),
    ("Kid Milli", "Feel Good", "RAD MILLI"),
    ("Kid Milli", "Apollo", "RAD MILLI"),
    ("Kid Milli", "S/S", "RAD MILLI"),
    ("Kid Milli", "Twilight Interlude", "RAD MILLI"),
    ("Kid Milli", "Million / Warrior", "RAD MILLI"),
    ("Kid Milli", "Foxy Plush", "RAD MILLI"),
    ("Kid Milli", "Need U", "RAD MILLI"),
    ("Kid Milli", "Talk Too Much", "RAD MILLI"),
    ("Kid Milli", "술", "RAD MILLI"),
    ("Kid Milli", "Silence", "RAD MILLI"),
    ("Kid Milli", "Jab", "+"),
    ("Kid Milli", "Link in Bio", "+"),
    ("Kid Milli", "Freestylin'", "+"),
    ("Kid Milli", "High Fashion", "+"),
    ("Kid Milli", "MMM", "+"),
    ("Kid Milli", "Downtown", "+"),
    ("Kid Milli", "Revenge Season", "+"),
    ("Kid Milli", "Bet", "++"),
    ("Coogie", "ON FIRE", ""),
    ("Coogie", "Crystal Crates", "Luxury Flow"),
    ("Changmo", "UGRS", "Luxury Flow"),
    ("PH-1", "FLAT COKE", ""),
    ("Crush", "Yes or No", ""),
    ("Paloalto", "GONE", ""),
    ("Punchnello", "before you", ""),
    ("Leellamarz", "Mercedes", "Luxury Flow"),
]

CATALOG_2025: list[tuple[str, str, str]] = [
    ("G-Dragon", "Too Bad", "Übermensch"),
    ("G-Dragon", "Drama", "Übermensch"),
    ("G-Dragon", "Ibelongiiu", "Übermensch"),
    ("G-Dragon", "Bonamana", "Übermensch"),
    ("G-Dragon", "Gyro-Drop", "Übermensch"),
    ("PH-1", "GOSHA", "WHAT HAVE WE DONE"),
    ("PH-1", "Show Must Go On", ""),
    ("PH-1", "WHAT HAVE WE DONE", "WHAT HAVE WE DONE"),
    ("PH-1", "PARTY PPL", "WHAT HAVE WE DONE"),
    ("PH-1", "KEEP IT ON THE LOW", "WHAT HAVE WE DONE"),
    ("PH-1", "MY B", "WHAT HAVE WE DONE"),
    ("PH-1", "BAKA", "WHAT HAVE WE DONE"),
    ("PH-1", "CRASHINNN OUTTT!!!", "WHAT HAVE WE DONE"),
    ("PH-1", "ERYKAH BADU", "WHAT HAVE WE DONE"),
    ("PH-1", "DRUGGED2THRILLS", "WHAT HAVE WE DONE"),
    ("PH-1", "54321", "WHAT HAVE WE DONE"),
    ("PH-1", "EASY", "WHAT HAVE WE DONE"),
    ("PH-1", "SUMMER FEVER", "WHAT HAVE WE DONE"),
    ("PH-1", "COVERED IN RAIN", "WHAT HAVE WE DONE"),
    ("PH-1", "HAD I KNOWN", "WHAT HAVE WE DONE"),
    ("PH-1", "SOAK IN BLUE", "WHAT HAVE WE DONE"),
    ("Coogie", "Flame", "UPSET"),
    ("Coogie", "Shut Up", "UPSET"),
    ("Coogie", "Spaceship", "UPSET"),
    ("Coogie", "Two Pills", "UPSET"),
    ("Coogie", "BABYFACE", "UPSET"),
    ("Coogie", "Arikari", "UPSET"),
    ("Coogie", "Sober", "UPSET"),
    ("Coogie", "Focus on me", "UPSET"),
    ("Coogie", "Can't get enough", "UPSET"),
    ("Coogie", "What u say?", "UPSET"),
    ("Coogie", "Coogie and I", "UPSET"),
    ("Zico", "Shut Up", "UPSET"),
    ("Loco", "Can't get enough", "UPSET"),
    ("The Quiett", "BABYFACE", "UPSET"),
    ("Loco", "Matcha High", ""),
    ("Loco", "work++", "SCRAPS"),
    ("Loco", "Dam", "SCRAPS"),
    ("Loco", "Eh freestyle", "SCRAPS"),
    ("Loco", "OMG", "SCRAPS"),
    ("Loco", "No where", "SCRAPS"),
    ("Loco", "radio", "SCRAPS"),
    ("Loco", "automatic", "SCRAPS"),
    ("Loco", "Papago", "SCRAPS"),
    ("Loco", "Skoo / S.A", "SCRAPS"),
    ("Jay Park", "Keep It Sexy", ""),
    ("Jay Park", "Remedy", ""),
    ("Crush", "UP ALL NITE", "FANG"),
    ("Crush", "2-5-1", "FANG"),
    ("Crush", "FREQUENCY", "FANG"),
    ("Crush", "MALIBU", "FANG"),
    ("Crush", "MAMMAMIA", "FANG"),
    ("Crush", "OVERLAP", "FANG"),
    ("Blase", "INDUSTRY", "SELF MADE"),
    ("Blase", "12345678", "SELF MADE"),
    ("Blase", "KKUCKDARI", "SELF MADE"),
    ("Blase", "BREAKERS", "SELF MADE"),
    ("Blase", "CANVAS", "SELF MADE"),
    ("Blase", "HIDE IN MA DAY", "SELF MADE"),
    ("Blase", "MANIFESTER", "SELF MADE"),
    ("Heize", "Love Virus", "LOVE VIRUS Pt.1"),
    ("Heize", "Last Taxi", "LOVE VIRUS Pt.1"),
    ("Heize", "All Because of You", "LOVE VIRUS Pt.1"),
    ("Heize", "You made Me", "LOVE VIRUS Pt.1"),
    ("Heize", "The Last Hello", "LOVE VIRUS Pt.1"),
    ("Heize", "Forget me not until you die.", "LOVE VIRUS Pt.1"),
    ("Heize", "Even if", ""),
    ("Gray", "SLIDIN'", ""),
    ("Dean", "Nocturne 07 (for aerse)", ""),
    ("Changmo", "HOLDUP", "Op.1"),
    ("Changmo", "ANTHEM", "Op.1"),
    ("Changmo", "Fadeout", "Op.2"),
    ("Changmo", "Intermezzo", "Op.2"),
    ("Changmo", "If I Had Time", "Op.2"),
    ("Zion.T", "LOVE ME", "POSER"),
    ("Zion.T", "Heroine", "POSER"),
    ("Zion.T", "Suspicious", "POSER"),
    ("Zion.T", "Fish", "POSER"),
    ("Zion.T", "CLOSER", "POSER"),
    ("Lil Moshpit", "K-FLIP", "K-FLIP+"),
    ("Lil Moshpit", "KC2", "K-FLIP+"),
    ("Lil Moshpit", "LALALA", "K-FLIP+"),
    ("Lil Moshpit", "INTERLUDE", "K-FLIP+"),
    ("Lil Moshpit", "SELF HATE", "K-FLIP+"),
    ("Lil Moshpit", "PUBLIC ENEMY", "K-FLIP+"),
    ("Lil Moshpit", "MADE IN KCOREA", "K-FLIP+"),
    ("Lil Moshpit", "LOV3", "K-FLIP+"),
    ("Lil Moshpit", "NEW ANTHEM", "K-FLIP+"),
    ("Tablo", "Stop the Rain", ""),
    ("Epik High", "Stop the Rain", ""),
    ("Colde", "Reno", ""),
    ("Punchnello", "F", ""),
    ("TOIL", "염염상망", ""),
    ("Loopy", "DOPE", "SEOUL pt.A"),
    ("Loopy", "DEAD MAN WALKING", "SEOUL pt.A"),
    ("Loopy", "BAD KUROMI GAL", "SEOUL pt.A"),
    ("Loopy", "PINK SPILL", "SEOUL pt.A"),
    ("Loopy", "YOU'D BETTER", "SEOUL pt.A"),
    ("Loopy", "CROWN", "SEOUL pt.A"),
    ("Punchnello", "Midnight Glow", ""),
]


def main() -> None:
    used: dict[str, int] = {}
    for tr in T2022 + T2023:
        used[norm_key(tr[0], tr[1])] = 2022 if tr in T2022 else 2023

    validate(2024, CATALOG_2024, used)
    validate(2025, CATALOG_2025, used)

    write_file(2024, CATALOG_2024)
    write_file(2025, CATALOG_2025)
    print(f"OK wrote y2024.py ({len(CATALOG_2024)}) and y2025.py ({len(CATALOG_2025)})")
    print(f"Total unique keys: {len(used)}")


if __name__ == "__main__":
    main()
