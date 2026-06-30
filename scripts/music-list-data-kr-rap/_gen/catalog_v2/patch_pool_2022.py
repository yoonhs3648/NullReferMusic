#!/usr/bin/env python3
"""2022+ 풀에 추가할 OK 트랙을 POOLS 파일에 append."""
from __future__ import annotations

import os
import re

EXTRA_2022: list[tuple[str, str, str]] = [
    ("meenoi", "What Do You Think?", ""),
    ("meenoi", "Business boy", ""),
    ("CAMO", "Life is Wet", ""),
    ("CAMO", "Freak Like Me", ""),
    ("Uneducated Kid", "UNEDUCATED KID", ""),
    ("Uneducated Kid", "UNEDUCATED KID 2", ""),
    ("Superbee", "Superbee", ""),
    ("BIG Naughty", "Vogue", "Vogue"),
    ("Epik High", "Rich Kids Anthem", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Family Portrait", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Champagne", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Piano for Sale", "Epik High Is Here 下, Part 2"),
    ("Zico", "Trash Talk", "Grown Ass Kid"),
    ("Zico", "That Guy", "Grown Ass Kid"),
    ("Beenzino", "Fashion Hoarder", "Modiversity"),
    ("PH-1", "Mr. Bad", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Juliette!", "BUT FOR NOW LEAVE ME ALONE"),
    ("Don Mills", "Don Mills Is Angry 6", "Don Mills Is Angry 6"),
    ("Huckleberry P", "Mantra 6", "Mantra 6"),
    ("Deepflow", "Flow the Life 6", "Flow the Life 6"),
    ("Blase", "City Life", ""),
    ("Punchnello", "Winter Blossom", "Winter Blossom"),
    ("Colde", "honestly", "Star"),
    ("Lee Young Ji", "O.K?", "O.K?"),
    ("Lee Young Ji", "낫 쏘리 (Feat. pH-1)", "Show Me the Money 11"),
    ("이영지", "WITCH (Feat. 밸재범, 황소윤)", "Show Me the Money 11"),
    ("Kid Milli", "가볍게", ""),
    ("Coogie", "굿나잇", "Re:Up"),
    ("Leellamarz", "그러지마", "Toystory3"),
    ("Crush", "Rush Hour (Feat. j-hope of BTS)", "Rush Hour"),
    ("Jessi", "Zoom", ""),
    ("Zion.T", "Lonely Christmas", ""),
    ("Mino", "안녕", "To Infinity"),
    ("Tablo", "Stop the Rain", ""),
    ("Jvcki Wai", "Taxi Blurr", "Taxi Blurr"),
    ("Lil Moshpit", "ACHOO", "ACHOO"),
    ("Primary", "BILLING", "BILLING"),
    ("Gaeko", "Sturgis", "Sturgis"),
    ("Simon Dominic", "Make Her Dance", "Simon Dominic Part 3"),
    ("Dean", "4:44", ""),
    ("Swings", "Per se", "Per se"),
    ("Verbal Jint", "Mainstream", "Mainstream"),
    ("JJK", "Go Back", "Go-Back"),
    ("Baechigi", "Shark's Tale", "Shark's Tale"),
]

POOL_PATH = os.path.join(os.path.dirname(__file__), "pools_2022_2025.py")


def main() -> None:
    with open(POOL_PATH, encoding="utf-8") as f:
        text = f.read()

    # Remove old filler block inside 2022 pool (lines after NSW yoon through Kid Milli Cliché)
    text = re.sub(
        r'(\("NSW yoon", "Therapy \+ 으리으리 \(Feat\. 호미들\)", "Show Me the Money 11"\),)\n'
        r'(?:        \(.*?\),?\n)*'
        r'(?=    \],\n    2023:)',
        r'\1\n',
        text,
        count=1,
        flags=re.DOTALL,
    )

    append_lines = "\n".join(
        f'        ({a!r}, {t!r}, {al!r}),' for a, t, al in EXTRA_2022
    )
    marker = '        ("NSW yoon", "Therapy + 으리으리 (Feat. 호미들)", "Show Me the Money 11"),'
    if marker not in text:
        raise SystemExit("marker not found")
    text = text.replace(marker, marker + "\n" + append_lines)

    with open(POOL_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"Appended {len(EXTRA_2022)} tracks to POOLS[2022]")


if __name__ == "__main__":
    main()
