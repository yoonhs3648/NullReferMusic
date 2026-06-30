#!/usr/bin/env python3
"""2023 POOLS 재작성 + spare 보충."""
from __future__ import annotations

import os

from build_master import HERE, build_from_pool, load_global_exclude, load_module, norm_key, GEN
from gen_spare import build_through
from rebalance_pools import CANDIDATES_2023, HEAD_2023, rewrite_section, pick_pool

EXTRA_2023 = [
    ("Epik High", "Prequel", "Strawberry"),
    ("Epik High", "Alcohol", "Strawberry"),
    ("Beenzino", "In Bed/막걸리", "NOWITZKI"),
    ("Zico", "Trash Talk", "Grown Ass Kid"),
    ("PH-1", "TGIF", "BUT FOR NOW LEAVE ME ALONE"),
    ("Simon Dominic", "GOTT", "GOTT"),
    ("Swings", "Growing Pains 2", "Growing Pains 2"),
    ("Deepflow", "Flow the Life 6", "Flow the Life 6"),
    ("Huckleberry P", "Mantra 6", "Mantra 6"),
    ("Don Mills", "Don Mills Is Angry 6", "Don Mills Is Angry 6"),
    ("Blase", "City Life", ""),
    ("Thama", "In My Room", "In My Room"),
    ("Rohann", "Problem", "Problem"),
    ("TOIL", "MAZE (메이즈)", "MAZE"),
    ("Code Kunst", "Buckle Up (버클 업)", "Code Kunst Archive Pack 02"),
    ("Flowsik", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
    ("Lee Young Ji", "O.K?", "O.K?"),
    ("BE'O", "Luxury (럭셔리)", "Show Me the Money 10"),
    ("Sokodomo", "IF I", "Show Me the Money 8"),
    ("Lil Boi", "Empty Head", ""),
    ("Queenpia", "Queenpia", "Queenpia"),
    ("Sumin", "Mirrorball", "Mirrorball"),
    ("MoonMoon", "Tourist", "Tourist"),
    ("E Sens", "Mona Lisa", "Mona Lisa"),
    ("DPR LIVE", "Jasmine", "Jasmine"),
    ("Woo Won Jae", "Hourglass", "Hourglass"),
    ("Rad Museum", "Life", "Life"),
    ("JUSTHIS", "마이웨이 (MY WAY) (Prod. by Alti)", "Show Me the Money 11"),
    ("NSW yoon", "Therapy + 으리으리 (Feat. 호미들)", "Show Me the Money 11"),
    ("허성현", "미운오리새끼 (Prod. R.Tee)", "Show Me the Money 11"),
    ("Kan", "나침반 (Feat. UNEDUCATED KID, Superbee)", "Show Me the Money 11"),
    ("QM", "Come To My Stu (Feat. 릴러말즈)", "Show Me the Money 11"),
    ("노윤하", "Flick (Feat. BE'O, HAON)", "Show Me the Money 11"),
    ("잠비노", "Bingo (Feat. 미노이, George)", "Show Me the Money 11"),
    ("Don Malik", "빡 (Feat. JUSTHIS, Paloalto)", "Show Me the Money 11"),
    ("Don Malik", "눈 (EYE) (Feat. BIG Naughty, JUSTHIS)", "Show Me the Money 11"),
    ("이영지", "WITCH (Feat. 밸재범, 황소윤)", "Show Me the Money 11"),
    ("Blase", "Holiday (Feat. Lil Boi, 기리보이)", "Show Me the Money 11"),
    ("Knoxx", "Knoxx", ""),
    ("Polodared", "Multiverse", ""),
    ("Hej!", "Drive", ""),
    ("Futuristic Swaver", "Villain", ""),
    ("Hodaky", "Yellow", ""),
    ("Chillin Homie", "Good Day", ""),
    ("Uneducated Kid", "UNEDUCATED KID", ""),
    ("Superbee", "Superbee", ""),
    ("Mad Clown", "Maximum", "Potato"),
    ("Bluso", "Fade Away", ""),
    ("LeyonC", "Fall", ""),
    ("Hyunsang", "Take Care", ""),
    ("Woo", "Rain Drop", "Rain Drop"),
    ("Rohann", "Sunday", ""),
    ("Thama", "Long Time No See", "Long Time No See"),
    ("Ahn Se-min", "물", "Show Me the Money 11"),
    ("Mudd the student", "Open", "Show Me the Money 8"),
    ("BewhY", "Movie Star", "The Movie Star"),
    ("Penomeco", "Famous", ""),
    ("Simon Dominic", "NO OPEN FLAME", "NO OPEN FLAME"),
    ("Gaeko", "Geon Gangs", "Geon Gangs"),
    ("D.Ark", "Genius", "Genius"),
    ("Kid Ash", "Orca-Tape", "Orca-Tape"),
    ("C Jamm", "RED", ""),
    ("Olltii", "Creative Control", "Creative Control"),
    ("Ash Island", "Me n Mine", "Show Me the Money 10"),
    ("Trade L", "Blue Sky (블루 스카이)", "Show Me the Money 10"),
    ("Wonstein", "Infrared (적외선)", "Show Me the Money 10"),
    ("Paul Blanco", "Rain (비)", "Summer"),
    ("Killagramz", "Good Morning Remix (굿 모닝 리믹스)", "Good Morning"),
    ("Hanhae", "003", "003"),
    ("Basick", "Nice Day (나이스 데이)", "The Classic"),
    ("Tabber", "RUN CHICKEN (런 치킨)", "RUN CHICKEN"),
    ("Khundi Panda", "Medicine (약)", "Medicine"),
    ("Roh Yun Ha", "IF I (이프 아이)", "Show Me the Money 10"),
    ("Illinit", "Real Talk Live (리얼 토크)", ""),
    ("B-Free", "Best Seller (베스트 셀러)", "Best Seller"),
    ("Vasco", "The Vasco", "The Vasco"),
    ("Outsider", "Vol.2-Maestro 4", "Vol.2-Maestro 4"),
    ("G2", "G2 (지투)", "G2"),
    ("Cheetah", "I'll Be Back (아일 비 백)", ""),
    ("J'Kyun", "Fly Away (플라이 어웨이)", "Ready to Fly"),
    ("Myun Do One", "Bulldozer", "Myun Do One Is Back"),
    ("Jerry.K", "V", "V"),
    ("Bumkey", "Single Life", "Single Life"),
    ("Junggigo", "Rookie", "Rookie"),
    ("Primary", "Morning Glory", ""),
    ("Dok2", "Rich Forever", "Rich Forever"),
    ("Rhymer", "Brand New Day", "Rhymer Trax Vol.1"),
    ("Double K", "Fly High", "Fly High"),
    ("Pe2ny", "Pe2ny Maker", "Pe2ny Maker"),
    ("Sean2Slow", "Slow Jam", "Slow Jam"),
    ("MC Meta", "On My Own", "The Blue Printz"),
    ("Geologic", "Blaze", "Blaze"),
    ("Mighty Mouth", "San", "San"),
    ("Skull", "I'm Your Man", "I'm Your Man"),
    ("Phantom", "Bubble Love", "Phantom City"),
    ("MellowD", "On My Way", "On My Way"),
    ("NO:EL", "Rain Drop 2", "Rain Drop 2"),
    ("Blued", "Blue", "Blue"),
    ("Jay Park", "Candy", ""),
    ("Jay Park", "Sunday Night Drive", ""),
    ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
    ("Jvcki Wai", "Doughnet", "Exposure"),
    ("Simon Dominic", "make her dance (메이크 허 댄스)", "GOTT"),
    ("Swings", "Brand New Day", "Upgrade III"),
    ("Mirani", "Ticket", "Ticket"),
    ("Woodie Gochild", "GOchild", "#GOchild"),
    ("Owen Ovadoz", "Freeze", "119"),
    ("Blase", "Blue", ""),
    ("Giriboy", "PlanetariuM", "Engineering"),
    ("Punchnello", "Everyday", "Everyday"),
    ("Dean", "Die 4 You", ""),
    ("Loco", "BROKEN IPHONE", "WEAK"),
    ("Zion.T", "Whale", "Zip"),
    ("Heize", "Forgotten Love", "Last Winter"),
    ("Mino", "Smoke", "BODY"),
    ("Bobby", "Drowning", "S.i.R"),
    ("Changmo", "VOOM", ""),
    ("Gray", "Summer Surf", "Summer Surf"),
    ("Dynamic Duo", "Smoke (Prod. Dynamicduo, Padi)", "Street Woman Fighter 2 Original Vol.1"),
    ("The Quiett", "King Is Back", "Luxury Flow"),
    ("Paloalto", "GONE", ""),
    ("TOIL", "1989", "1989"),
    ("Mirani", "Baby Steps", "Show Me the Money 10"),
    ("Blase", "ONOFF", "Show Me the Money 10"),
    ("Sik-K", "FL1X", "FL1X"),
    ("Tablo", "Hood", "Drill Presents: Tablo x Fantasy"),
    ("Loopy", "Portrait Mode", "[ Album ]"),
    ("YUMDDA", "I'm Good", "I'm Good"),
    ("Flowsik", "We On", "Show Me the Money 777"),
    ("Reddy", "Think", "Show Me the Money 777"),
    ("KittiB", "Nobody Knows", "Show Me the Money 777"),
    ("Koonta", "VVS", "Show Me the Money 8"),
    ("Giriboy", "on my way", "Show Me the Money 8"),
    ("BIG Naughty", "Vogue", "Vogue"),
    ("Zion.T", "No Make Up (feat. Wonstein)", "No Make Up"),
    ("Zion.T", "Spring Dream (봄꿈)", "Zionic"),
    ("San E", "a SONG of ICE and FIRE", "a SONG of ICE and FIRE"),
    ("E-Sens", "이상형", "The Anecdote"),
    ("Kid Milli", "Cliché (클리셰)", "Cliché"),
    ("Hash Swan", "Retro Love", ""),
]


def all_candidates() -> list[tuple[str, str, str]]:
    return HEAD_2023 + CANDIDATES_2023 + EXTRA_2023


def pick_full_pool() -> list[tuple[str, str, str]]:
    gs = build_through(2023)
    ex = load_global_exclude()
    head = HEAD_2023
    ac: dict[str, int] = {a: 1 for a, _, _ in head}
    pool: list[tuple[str, str, str]] = []
    seen = {norm_key(a, t) for a, t, _ in head}
    for a, t, al in CANDIDATES_2023 + EXTRA_2023:
        k = norm_key(a, t)
        if k in seen or k in gs or k in ex:
            continue
        if ac.get(a, 0) >= 2:
            continue
        seen.add(k)
        pool.append((a, t, al))
        ac[a] = ac.get(a, 0) + 1
    return pool


def main() -> None:
    pool = pick_full_pool()
    gs = set(build_through(2023))
    ex = load_global_exclude()
    spare = load_module("spare", os.path.join(GEN, "spare_tracks.py"))
    try:
        build_from_pool(
            2023,
            pool + spare.SPARE.get(2023, []),
            gs,
            ex,
            head=HEAD_2023,
            round_robin=True,
        )
        print(f"simulate OK {len(gs) - len(build_through(2023))} added")
    except Exception as e:
        print(f"simulate FAIL: {e} (pool={len(pool)})")

    path = os.path.join(HERE, "pools_2022_2025.py")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    text = rewrite_section(text, "POOLS", 2023, pool)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote POOLS[2023] with {len(pool)} tracks")


if __name__ == "__main__":
    main()
