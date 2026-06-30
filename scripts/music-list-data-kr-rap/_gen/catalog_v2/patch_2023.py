#!/usr/bin/env python3
"""2023 풀에 부족 트랙 일괄 append."""
from fill_years import append_to_pool

PICKS = [
    ("Epik High", "Fade Away", "Strawberry"),
    ("Epik High", "Kill", "Strawberry"),
    ("Epik High", "Prequel", "Strawberry"),
    ("Epik High", "Alcohol", "Strawberry"),
    ("Epik High", "Love Song", "Strawberry"),
    ("Epik High", "You Are The One For Me", "Strawberry"),
    ("Beenzino", "NOWITZKI", "NOWITZKI"),
    ("Beenzino", "Modiversity", "Modiversity"),
    ("Don Malik", "SEOUL", "MADE IN SEOUL"),
    ("Don Malik", "Malik", "MADE IN SEOUL"),
    ("Don Malik", "Wave", "49"),
    ("Kid Milli", "Benzo", ""),
    ("Leellamarz", "DAYDATE", "DAYDATE"),
    ("82MAJOR", "ON", "ON"),
    ("meenoi", "3MAN", ""),
    ("DeVita", "Ride or Die", ""),
    ("Ourealgoat", "Maybe", ""),
    ("Blued", "Tears", ""),
    ("Owen Ovadoz", "Drama", ""),
    ("Mirani", "Baby", ""),
    ("Woodie Gochild", "Mood", ""),
    ("Crush", "wonderego", "wonderego"),
    ("Olltii", "Turtle Ship Remix", ""),
    ("Reddy", "Well (잘)", "Show Me the Money 777"),
    ("KittiB", "Nobody (누구 없소)", "Show Me the Money 777"),
    ("Jvcki Wai", "Exposure", "Exposure"),
    ("Jessi", "NUNU NANA", "NUNU NANA"),
    ("Lee Young Ji", "낫 쏘리 (Feat. pH-1)", "Show Me the Money 11"),
]

if __name__ == "__main__":
    append_to_pool(2023, PICKS)
    print(f"appended {len(PICKS)} tracks to 2023")
