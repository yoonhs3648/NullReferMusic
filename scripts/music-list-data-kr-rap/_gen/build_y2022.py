#!/usr/bin/env python3
"""Build dedupe-safe y2022.py (2022 releases only)."""
from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_y2018 import build_used_through
from fix_and_emit import norm_key, has_bad_suffix

from spare_tracks import SPARE

CANDIDATES = [
    ("Beenzino", "Monet", ""),
    ("Zico", "New Thing", ""),
    ("Zico", "Grown Ass Kid", "Grown Ass Kid"),
    ("Zico", "Seoul Drift", "Grown Ass Kid"),
    ("Zico", "Being Human", "Grown Ass Kid"),
    ("Zico", "Curriculum", "Grown Ass Kid"),
    ("Zico", "OMJT", "Grown Ass Kid"),
    ("Zico", "Trash Talk", "Grown Ass Kid"),
    ("Zico", "That Guy", "Grown Ass Kid"),
    ("Changmo", "Just the Two of Us", ""),
    ("Changmo", "SMF", ""),
    ("Kid Milli", "Summer", ""),
    ("Kid Milli", "Lightly", ""),
    ("PH-1", "BUT FOR NOW LEAVE ME ALONE", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Zombies", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "TGIF", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Yuppie Ting", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Tipsy", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Mr. Bad", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Juliette!", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Run Away", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Dead Girl", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Shrink Told Me", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Issues", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Break the Glass", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Final Bout", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Bve", "BUT FOR NOW LEAVE ME ALONE"),
    ("Epik High", "Here", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Prequel", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Super Rare", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Gray So Gray", "Epik High Is Here 下, Part 2"),
    ("Epik High", "BRB", "Epik High Is Here 下, Part 2"),
    ("Epik High", "I Hated Myself (Tablo's Word)", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Rain Song", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Rich Kids Anthem", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Face ID", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Family Portrait", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Champagne", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Piano for Sale", "Epik High Is Here 下, Part 2"),
    ("Jay Park", "McNasty", ""),
    ("Jay Park", "B Day", ""),
    ("Loco", "Wedding", ""),
    ("Loco", "Aniya", ""),
    ("Zion.T", "Lonely Christmas", ""),
    ("Punchnello", "Loveseat", ""),
    ("Punchnello", "Cream Cheese", ""),
    ("Blase", "Quote That", ""),
    ("Leellamarz", "STORY", "Toystory3"),
    ("Leellamarz", "Last Chance", "Toystory3"),
    ("Leellamarz", "Don`t do That", "Toystory3"),
    ("Leellamarz", "Seperation Anxiety", "Toystory3"),
    ("Leellamarz", "Never Ending Story", "Toystory3"),
    ("Leellamarz", "Aftermath", "Toystory3"),
    ("Leellamarz", "B.B.B", "Toystory3"),
    ("Leellamarz", "Flower Age", "Toystory3"),
    ("Leellamarz", "1,2,3", "Toystory3"),
    ("Leellamarz", "2AM", "Toystory3"),
    ("Leellamarz", "Zero Coke", "Toystory3"),
    ("Leellamarz", "Iris", "Toystory3"),
    ("Leellamarz", "Number", "MaRz&B"),
    ("Leellamarz", "Uncomfortable", "MaRz&B"),
    ("Leellamarz", "Ex", "MaRz&B"),
    ("Leellamarz", "Chrome Hearts", "MaRz&B"),
    ("Leellamarz", "Down", "MaRz&B"),
    ("Leellamarz", "Muse", "MaRz&B"),
    ("Leellamarz", "Meet me at the London", "MaRz&B"),
    ("Leellamarz", "CTRL+Z", "VIOLINIST2"),
    ("Leellamarz", "OUT OF MY SIGHT", "VIOLINIST2"),
    ("Leellamarz", "Left hand to Right hand", "VIOLINIST2"),
    ("Leellamarz", "a single word", "VIOLINIST2"),
    ("Leellamarz", "This is not what I want", "VIOLINIST2"),
    ("Leellamarz", "Selfish", "VIOLINIST2"),
    ("Leellamarz", "Sisi La Famille", "VIOLINIST2"),
    ("Leellamarz", "30 minutes", "VIOLINIST2"),
    ("Leellamarz", "Without You (Encore)", "VIOLINIST2"),
    ("Lil Moshpit", "Moshpit Only", "AAA"),
    ("Lil Moshpit", "Gotta Lotta Shit", "AAA"),
    ("Lil Moshpit", "Yooooo", "AAA"),
    ("Lil Moshpit", "A-Team Freestyle", "AAA"),
    ("Lil Moshpit", "Slatty Slut", "AAA"),
    ("Lil Moshpit", "ON THE BLOCK", "AAA"),
    ("Lil Moshpit", "DIE HARD", "AAA"),
    ("Lil Moshpit", "BO$$", "AAA"),
    ("Lil Moshpit", "Back In My AREA", "AAA"),
    ("The Quiett", "Nike", ""),
    ("Paloalto", "Valentina", ""),
    ("TOIL", "like when we first met", ""),
    ("The Quiett", "Bentley", ""),
    ("Coogie", "Good Night", "Re:Up"),
    ("Changmo", "METAVERS", "Band Up"),
    ("Changmo", "Band Up", "Band Up"),
    ("Kid Milli", "Benzo", ""),
    ("Leellamarz", "Don`t Say That", "Don`t Say That"),
    ("TOIL", "MAZE", "MAZE"),
    ("Beenzino", "Fashion Hoarder", "Modiversity"),
    ("Beenzino", "Modiversity", "Modiversity"),
    ("Beenzino", "Dumbo", "Dumbo"),
    ("Jay Park", "Why", ""),
    ("Loco", "Focus", ""),
    ("Dean", "Die 4 You", ""),
    ("Heize", "Midnight", "Midnight"),
    ("Mino", "Aero", "BODY"),
    ("Changmo", "FWB", ""),
    ("Punchnello", "Motive", ""),
    ("Colde", "Wave", ""),
    ("Jay Park", "Yesterday", ""),
    ("Gray", "Remedy", ""),
    ("Heize", "Undo", ""),
    ("Colde", "Star", ""),
    ("Paloalto", "Top Primary", ""),
    ("Gray", "Summer Night", ""),
    ("Coogie", "Alone", ""),
    ("Crush", "Oasis", ""),
    ("Crush", "Rush Hour", ""),
    ("Dean", "4:44", ""),
    ("Loco", "Summer Go Loco", "Summer Go Loco"),
    ("Giriboy", "Lonely", "Lonely"),
    ("Nafla", "understand", "understand"),
    ("Loopy", "ON THE Radar", "ON THE Radar"),
    ("Leellamarz", "Ale", "Marz & Ale"),
    ("Simon Dominic", "GOTT", "GOTT"),
    ("Swings", "Shook Ones", "Shook Ones"),
    ("Tablo", "Birthday", "Birthday"),
    ("Bobby", "Lalala", "Lalala"),
    ("Mino", "Booker", "Booker"),
    ("Gaeko", "Rosetta", "Rosetta"),
    ("Primary", "Morning Glory", ""),
    ("Dok2", "All I Know Is", "Thug Life Part 2"),
    ("Code Kunst", "Buckle Up", "Code Kunst Archive Pack 02"),
    ("Zion.T", "Just", "Just"),
    ("Heize", "Midnight", "Midnight"),
    ("YUMDDA", "I'm Good", ""),
    ("Loopy", "Radar", "ON THE Radar"),
    ("Giriboy", "Because I Love You", "Lonely"),
    ("Dean", "Peace", "Peace"),
    ("Gray", "summer", "summer"),
    ("Loco", "Hello", "Hello"),
    ("Jay Park", "Forget About Tomorrow", "Forget About Tomorrow"),
    ("Zion.T", "Spring Dream", "Zionic"),
    ("Punchnello", "Winter Blossom", "Winter Blossom"),
    ("Colde", "honestly", "Star"),
    ("Nafla", "what is your name", "understand"),
    ("Mino", "Do You Remember", "Do You Remember"),
    ("Jay Park", "To Life", "To Life"),
    ("Gray", "Summer Surf", "Summer Surf"),
    ("Jessi", "Cold Blooded", "Cold Blooded"),
    ("Lee Young Ji", "Witch", "Witch"),
    ("GroovyRoom", "Brought the Heat Back", "Brought the Heat Back"),
    ("Sik-K", "Brought the Heat Back", "Brought the Heat Back"),
    ("Paloalto", "Brought the Heat Back", "Brought the Heat Back"),
    ("Dynamic Duo", "Untouchable", "Untouchable"),
    ("Lee Young Ji", "Untouchable", "Untouchable"),
    ("be'O", "Countdown", "Show Me the Money 10"),
    ("be'O", "Luxury", "Show Me the Money 10"),
    ("be'O", "Momentum", "Show Me the Money 10"),
    ("be'O", "Healing", "Show Me the Money 10"),
    ("Koonta", "KOONTA", "Show Me the Money 10"),
    ("Ash Island", "Me n Mine", "Show Me the Money 10"),
    ("Mirani", "Villain", "Show Me the Money 10"),
    ("Mudd the student", "Nectar", "Show Me the Money 10"),
    ("Lil Moshpit", "ACHOO", "Show Me the Money 10"),
    ("Blase", "ONOFF", "Show Me the Money 10"),
    ("Woodie Gochild", "Mud", "Show Me the Money 10"),
    ("Sokodomo", "SIGNATURE", "Show Me the Money 10"),
    ("Owen Ovadoz", "Diana", "Show Me the Money 10"),
    ("Lil Boi", "ONFleek", "Show Me the Money 10"),
]


def main() -> None:
    used, exclude = build_used_through(2022)
    picked: list[tuple[str, str, str]] = []
    pool = CANDIDATES + SPARE.get(2022, [])
    for a, t, al in pool:
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
        print(f"warning: only {len(picked)} unique tracks for 2022")
    lines = ["TRACKS = ["]
    for a, t, al in picked:
        lines.append(f"    ({a!r}, {t!r}, {al!r}),")
    lines.append("]")
    lines.append("")
    path = os.path.join(os.path.dirname(__file__), "real_catalog_data", "y2022.py")
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
