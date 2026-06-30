#!/usr/bin/env python3
"""
힙플·힙플레이·전문가 평가 기준 연도별 우선순위.
멜론·벅스·genie 등 **차트 순위는 사용하지 않음**.
앞쪽일수록 커뮤니티·비평 호평·앨범 오브 더 이어·SMTM 언더/힙합 씬 임팩트가 높음.
"""
from __future__ import annotations

import re

from build_master import norm_key

# 연도별 (artist, title) — 커뮤니티·전문가 평가 순 (앞 = 상위)
COMMUNITY_RANK: dict[int, list[tuple[str, str]]] = {
    2010: [
        ("에픽하이", "RUN"), ("다이나믹듀오", "없네"), ("릴리삼", "살아가는 중"),
        ("에픽하이", "Up"), ("슈프림팀", "땡땡땡"), ("사이먼 디", "청담동 Madonna"),
        ("프라이머리", "2 Weeks"), ("버벌진트", "Ready To Die"), ("지코", "Tough Cookie"),
        ("The Quiett", "Can You?"), ("Deepflow", "Come Back Home"), ("빈지노", "Retro Love"),
        ("타블로", "Bad"), ("도끼", "Thug Life"), ("San E", "LoveSick"),
        ("허클베리 P", "Mantra"), ("Paloalto", "Imagination"), ("Don Mills", "Don Mills Is Angry"),
        ("E-Sens", "Poison"), ("배치기", "상어의 이야기"), ("아웃사이더", "외투"),
    ],
    2011: [
        ("에픽하이", "Don't Hate Me"), ("다이나믹듀오", "사랑은"), ("버벌진트", "Walking in the Rain"),
        ("프라이머리", "Good Morning"), ("지코", "Human"), ("The Quiett", "The Quiett Smiles"),
        ("Deepflow", "Flow the Life 2"), ("빈지노", "Give It To Me"), ("San E", "See my Rap"),
        ("사이먼 디", "Simon Dominic"), ("타블로", "Tomorrow"), ("도끼", "Thug Life Part 2"),
        ("허클베리 P", "Mantra 2"), ("Paloalto", "Top Rock Star"), ("E-Sens", "회의록"),
        ("배치기", "Shark's Tale Pt.2"), ("Don Mills", "Don Mills Is Angry 2"),
    ],
    2012: [
        ("에픽하이", "Don't Hate Me"), ("G-Dragon", "One Of A Kind"), ("버벌진트", "Mainstream"),
        ("프라이머리", "Good Morning"), ("지코", "I Love U"), ("The Quiett", "The Quiett Smiles"),
        ("Deepflow", "Flow the Life 3"), ("빈지노", "Give It To Me"), ("San E", "See my Rap"),
        ("사이먼 디", "Simon Dominic Part 2"), ("타블로", "Tomorrow"), ("허클베리 P", "Mantra 3"),
        ("Paloalto", "The Big Picture"), ("E-Sens", "Poison"), ("배치기", "상어의 이야기"),
    ],
    2013: [
        ("다이나믹듀오", "BAAAM"), ("에픽하이", "It's Cold"), ("버벌진트", "Rap Genius No. 8 Intro"),
        ("프라이머리", "Johnny"), ("지코", "Tough Cookie"), ("The Quiett", "Can You?"),
        ("Deepflow", "Flow the Life 4"), ("빈지노", "Give It To Me"), ("San E", "See my Rap"),
        ("사이먼 디", "180도 Turn"), ("타블로", "Bad"), ("허클베리 P", "Mantra 4"),
        ("Paloalto", "The Big Picture"), ("E-Sens", "Poison"), ("배치기", "상어의 이야기"),
        ("Penomeco", "COCO BOTTLE"), ("Verbal Jint", "Rap Genius No. 8"),
    ],
    2014: [
        ("Epik High", "Born Hater (본 헤이터)"), ("Epik High", "눈, 코, 입"), ("Zion.T", "양화대교"),
        ("Crush", "소파"), ("Mad Clown", "오늘밤"), ("Loco", "너를 생각해"),
        ("Swings", "홍키영"), ("Bobby", "Holup!"), ("Mino", "겁"), ("Dynamic Duo", "거대한 발걸음"),
        ("Jay Park", "좋아"), ("Gaeko", "집으로"), ("Heize", "조금만 더 걸을래"),
        ("Verbal Jint", "Good Morning Pt.3"), ("The Quiett", "Money and the Power"),
    ],
    2015: [
        ("E-Sens", "회의록"), ("E-Sens", "새벽 2시"), ("Simon Dominic", "Won & Only"),
        ("Simon Dominic", "사이먼 도미닉"), ("Beenzino", "So What"), ("Giriboy", "왜 이렇게 살아"),
        ("BewhY", "Day Day"), ("BewhY", "Forever"), ("Nafla", "Natural High"), ("Loopy", "No More"),
        ("Iron", "Rain Shower"), ("Basick", "Pale Dream"), ("Basick", "Stand Up"),
        ("Kid Milli", "IndiGO"), ("Changmo", "Maestro"), ("The Quiett", "Cut"),
        ("Verbal Jint", "Rap Genius No. 9"), ("Epik High", "Born Hater"), ("Primary", "Roller Coaster"),
        ("Tablo", "Eyes, Nose, Lips"), ("Dean", "Pour Up"), ("Zion.T", "노메이크업"),
        ("Crush", "Just"), ("Heize", "And July"), ("Loco", "Respect"), ("Gray", "Just Do It"),
        ("Jay Park", "MOMMAE"), ("Zico", "Boys and Girls"), ("Sik-K", "TRAP"),
        ("Punchnello", "Loving You Girl"), ("PH-1", "Good Day"), ("Hash Swan", "Retro Love"),
        ("Dynamic Duo", "AEAO"), ("iKON", "취향저격"), ("BTS", "I NEED U"), ("BTS", "뱁새"),
    ],
    2016: [
        ("Dean", "D (Half Moon)"), ("Dean", "what2do"), ("Simon Dominic", "GOTT"),
        ("BewhY", "Movie Star"), ("Beenzino", "Dali"), ("C Jamm", "The Last"),
        ("Punchnello", "My Piece"), ("Sik-K", "YESSIR"), ("Nafla", "Natural High"),
        ("Loopy", "No More"), ("Giriboy", "Because"), ("Dynamic Duo", "Highfive"),
        ("Gray", "Good"), ("Loco", "You Too"), ("Crush", "잊을만해"), ("Zion.T", "노크"),
        ("Heize", "너, 나, 우리"), ("Jay Park", "Me Like Yuh"), ("BTS", "피 땀 눈물"),
        ("BTS", "불타오르네"), ("Loco", "Still"), ("Beenzino", "Vanilla Sky"),
        ("Jay Park", "Drive"), ("Crush", "woo ah"),
    ],
    2017: [
        ("Nafla", "MVP"), ("Nafla", "Jazz Freestyle"), ("Loopy", "Portrait Mode"), ("Loopy", "Save"),
        ("Kid Milli", "Cappuccino"), ("Kid Milli", "Maiden Voyage"), ("BewhY", "Cult of Curiosity"),
        ("Hash Swan", "Hash Brand 2"), ("PH-1", "YIN YANG"), ("PH-1", "Platonic"),
        ("Dean", "instagram"), ("Giriboy", "914"), ("Changmo", "Meteor"), ("Changmo", "Boyhood"),
        ("The Quiett", "Glow"), ("Epik High", "Lesson 1"), ("Epik High", "Lesson 2"),
        ("Penomeco", "Famous"), ("Punchnello", "Everyday"), ("Simon Dominic", "DAx4"),
        ("G-Dragon", "무제"), ("Zico", "Artist"), ("Gray", "I'm Fine"), ("Beenzino", "Damnato"),
        ("Sik-K", "YACHT"), ("Woo", "위 아"), ("Jvcki Wai", "Neo Eve"), ("Ash Island", "Howling"),
        ("TOIL", "Money"), ("D.Ark", "Genius"), ("Heize", "비도 오고 그래서"), ("Crush", "None"),
        ("Loco", "Too Much"), ("Jay Park", "V"), ("Zion.T", "Snow"), ("BTS", "DNA"), ("BTS", "MIC Drop"),
    ],
    2018: [
        ("Nafla", "C.R.E.A.M"), ("Kid Milli", "Cappuccino"), ("pH-1", "Good Day"),
        ("Epik High", "sleepless"), ("Epik High", "Love Story"), ("BewhY", "Cult of Curiosity"),
        ("Giriboy", "Engineering"), ("Ash Island", "Howling"), ("Hash Swan", "Hash Brand 2"),
        ("The Quiett", "Luxury Flow"), ("Loopy", "King"), ("Penomeco", "Work"),
        ("Sik-K", "YACHT"), ("Dean", "instagram"), ("Crush", "None"), ("Zico", "Any Song"),
        ("Loco", "Some"), ("Heize", "And July"), ("Dynamic Duo", "AEAO"),
    ],
    2019: [
        ("Epik High", "Eternal Sunshine"), ("Epik High", "Born Hater"), ("Nafla", "C.R.E.A.M"),
        ("BewhY", "Cult of Curiosity"), ("Giriboy", "Engineering"), ("Kid Milli", "Cappuccino"),
        ("Ash Island", "Howling"), ("Hash Swan", "Hash Brand 2"), ("The Quiett", "King Is Back"),
        ("Penomeco", "Shy (수줍)"), ("Penomeco", "Lovers (러버스)"), ("Mudd the student", "IndiGO (인디GO)"),
        ("Mirani", "VANS"), ("Leellamarz", "DAYDATE"), ("PH-1", "Rosario"),
        ("Zico", "Any Song"), ("Dean", "Die 4 You"), ("Crush", "None"), ("Heize", "We don't talk together"),
    ],
    2020: [
        ("Epik High", "Rosario"), ("Zion.T", "No Make Up"), ("Kid Milli", "Cappuccino"),
        ("Ash Island", "Howling"), ("Nafla", "C.R.E.A.M"), ("The Quiett", "King Is Back"),
        ("Giriboy", "Engineering"), ("PH-1", "Rosario"), ("BewhY", "Cult of Curiosity"),
        ("Deepflow", "Flow the Life 5"), ("Mirani", "VANS"), ("Leellamarz", "DAYDATE"),
        ("Zico", "Any Song"), ("BTS", "Dynamite"), ("Loco", "Some"), ("Crush", "None"),
        ("Heize", "We don't talk together"), ("Dean", "Die 4 You"), ("Dynamic Duo", "AEAO"),
    ],
    2021: [
        ("Epik High", "Rosario"), ("BewhY", "Cult of Curiosity"), ("Giriboy", "Engineering"),
        ("Ash Island", "Howling"), ("Kid Milli", "Cappuccino"), ("The Quiett", "King Is Back"),
        ("Nafla", "C.R.E.A.M"), ("Leellamarz", "DAYDATE"), ("TOIL", "Switch"),
        ("Changmo", "Meteor"), ("PH-1", "Rosario"), ("Mirani", "VANS"),
        ("Lil Boi", "중독될만큼"), ("Penomeco", "Shy (수줍)"), ("Mudd the student", "IndiGO (인디GO)"),
        ("Zico", "Any Song"), ("Dean", "Die 4 You"), ("Crush", "None"), ("Loco", "Some"),
    ],
    2022: [
        ("Epik High", "그래서 그래 (Feat. 윤하)"), ("Epik High", "비 오는 날 듣기 좋은 노래 (Feat. 콜드)"),
        ("JUSTHIS", "마이웨이 (MY WAY) (Prod. by Alti)"), ("Kid Milli", "가볍게"),
        ("Giriboy", "Vice Versa"), ("Ash Island", "안전지대"), ("The Quiett", "Bentley"),
        ("TOIL", "처음 만났을 때처럼"), ("PH-1", "BUT FOR NOW LEAVE ME ALONE"),
        ("Beenzino", "MONET"), ("Leellamarz", "그러지마"), ("Coogie", "굿나잇"),
        ("Dynamic Duo", "ECO"), ("Mirani", "Drama"), ("Blase", "Quote That"),
        ("허성현", "펄펄 (Feat. Dynamic Duo)"), ("Kan", "Therapy + 으리으리 (Feat. 호미들)"),
        ("이영지", "낫 쏘리 (Feat. pH-1)"), ("Zico", "새삥 (Prod. ZICO) (Feat. 호미들)"),
        ("BIGBANG", "봄여름가을겨울 (Still Life)"), ("Crush", "Rush Hour (Feat. j-hope of BTS)"),
    ],
    2023: [
        ("Don Malik", "SEOUL"), ("Don Malik", "Malik"), ("Epik High", "Strawberry"), ("Epik High", "Fade Away"),
        ("BIG Naughty", "Você"), ("Qwala", "ㅍㅍㅍㅍ (Feat. Kid Milli)"), ("Ourealgoat", "Maybe"),
        ("Blued", "Tears"), ("Nafla", "C.R.E.A.M"), ("The Quiett", "King Is Back"), ("The Quiett", "Mercedes"),
        ("Giriboy", "Engineering"), ("Giriboy", "Girlfriend"), ("Kid Milli", "Benzo"),
        ("Leellamarz", "DAYDATE"), ("Leellamarz", "모른 척"), ("Jvcki Wai", "Exposure"),
        ("Deepflow", "Flow the Life 6"), ("Huckleberry P", "Mantra 6"), ("Don Mills", "Don Mills Is Angry 6"),
        ("Paloalto", "GONE"), ("Uneducated Kid", "UNEDUCATED KID"), ("Blase", "Holiday (Feat. Lil Boi, 기리보이)"),
        ("허성현", "미운오리새끼 (Prod. R.Tee)"), ("Kan", "나침반 (Feat. UNEDUCATED KID, Superbee)"),
        ("Beenzino", "Trippy"), ("Beenzino", "NOWITZKI"), ("Zico", "SPOT!"), ("Zico", "Earthquake"),
        ("Lil Moshpit", "TO GO"), ("82MAJOR", "FIRST CLASS"), ("82MAJOR", "ON"),
    ],
    2024: [
        ("TOIL", "염염상망"), ("Loopy", "DOPE"), ("Loopy", "CROWN"), ("Nafla", "MVP"),
        ("Owen Ovadoz", "Diamond"), ("BewhY", "Cult of Curiosity"), ("Hash Swan", "Hash Brand"),
        ("The Quiett", "LF Intro"), ("The Quiett", "Crystal Crates"), ("Antihuman", "Antihuman"),
        ("QM", "개미"), ("Khundi Panda", "Somozu Fury"), ("Garion", "Garion 3"),
        ("B-Free", "Free The Mane 2"), ("Leellamarz", "Hell yea"), ("Kid Milli", "5AM"),
        ("Dean", "NASA"), ("Dean", "Ctrl"), ("Changmo", "HOLDUP"), ("Changmo", "ANTHEM"),
        ("Lil Moshpit", "K-FLIP"), ("Qwala", "델러가 (Feat. MELOH & Posadic)"),
        ("BRADYSTREET", "Brady Street"), ("Gist", "Gist"), ("JUSTHIS", "JUSTHIS"),
        ("G-Dragon", "HOME SWEET HOME (Feat. 태양, 대성)"), ("G-Dragon", "POWER"),
        ("Beenzino", "Train"), ("Crush", "Yes or No"), ("Heize", "Even if (이븐 이프)"),
    ],
    2025: [
        ("Owen Ovadoz", "TANG"), ("Owen Ovadoz", "TRUTH (feat. Marv, Nieah)"), ("Don Malik", "Spinboutu"),
        ("Don Malik", "MADE IN SEOUL"), ("EK", "YAHO"), ("EK", "Machine"), ("Royal 44", "Classical Freestyle"),
        ("Penomeco", "EGGE (Feat. YDG)"), ("Penomeco", "When I Siege"), ("Mushvenom", "돌림판 (Feat. 신빠람 이박사)"),
        ("Mushvenom", "몰러유"), ("Hebi", "시바세키"), ("Verbal Jint", "Replay (Feat. Heize)"),
        ("The Quiett", "Crystal Crates"), ("The Quiett", "Look Inside"), ("Loopy", "CROWN"),
        ("Loopy", "DEAD MAN WALKING"), ("Nafla", "Jazz Freestyle"), ("Epik High", "Frost"),
        ("Khundi Panda", "MODM 2 : The Bento Knight"), ("Blase", "KKUCKDARI"), ("Blase", "12345678"),
        ("Kid Milli", "Feel Good"), ("Leellamarz", "Hell yea"), ("Giriboy", "Mechanical Album"),
        ("Changmo", "HOLDUP"), ("PH-1", "GOSHA"), ("Dean", "NASA"), ("Crush", "UP ALL NITE"),
        ("G-Dragon", "Too Bad"), ("G-Dragon", "TAKE ME"), ("Loco", "work++"), ("Heize", "Love Virus (러브 바이러스)"),
    ],
}

# 커뮤니티에서 높게 평가된 앨범 — 수록곡 가산
COMMUNITY_ALBUMS: dict[int, set[str]] = {
    2015: {"The Anecdote", "Won & Only", "The Movie Star", "Natural High", "Mmk", "IndiGO"},
    2016: {"130 Mood : TRBL", "The Fiery", "My Piece", "Trap Art", "Mechanical Album"},
    2017: {"[ Album ]", "YIN YANG", "Cult of Curiosity", "914", "Boyhood", "Lesson 0", "Exposure", "Ash Island"},
    2022: {"Epik High Is Here 下, Part 2", "Vice Versa", "Safety Zone", "ECO", "BUT FOR NOW LEAVE ME ALONE"},
    2023: {"MADE IN SEOUL", "Strawberry", "Você", "Engineering", "Exposure", "Flow the Life 6", "Mantra 6"},
    2024: {"SEOUL pt.A", "Luxury Flow", "119", "RAD MILLI", "3:33", "Op.1", "Garion 3"},
    2025: {"POEMV", "YAHO", "Love is a Song", "MADE IN SEOUL", "얼", "RNSSNC TAPE", "SEOUL pt.A", "Luxury Flow"},
}

# 차트 위주·힙합 커뮤니티 호평 낮음 — 순위 하향
CHART_DEMOTE: dict[int, set[str]] = {
    2015: {norm_key("iKON", "취향저격"), norm_key("BTS", "뱁새"), norm_key("BTS", "I NEED U")},
    2016: {norm_key("BTS", "피 땀 눈물"), norm_key("BTS", "불타오르네")},
    2017: {norm_key("BTS", "DNA"), norm_key("BTS", "MIC Drop"), norm_key("Hwang Kwanghee", "Yellow Boots")},
    2022: {norm_key("BIGBANG", "봄여름가을겨울 (Still Life)"), norm_key("Crush", "Rush Hour (Feat. j-hope of BTS)")},
    2023: {norm_key("Zico", "SPOT!"), norm_key("82MAJOR", "FIRST CLASS"), norm_key("82MAJOR", "ON")},
    2024: {norm_key("G-Dragon", "POWER"), norm_key("Jay Park", "Taxi Blurr")},
    2025: {norm_key("G-Dragon", "Too Bad"), norm_key("G-Dragon", "TAKE ME")},
}


def community_score(year: int, artist: str, title: str, album: str) -> float:
    """높을수록 커뮤니티·전문가 평가 상위."""
    k = norm_key(artist, title)
    rank_list = COMMUNITY_RANK.get(year, [])
    for i, (a, t) in enumerate(rank_list):
        if norm_key(a, t) == k:
            return 100_000 - i

    score = 10_000.0
    if album and album in COMMUNITY_ALBUMS.get(year, set()):
        score += 5_000
    if k in CHART_DEMOTE.get(year, set()):
        score -= 8_000

    # 언더/힙플에서 자주 거론되는 레이블·아티스트 소폭 가산
    underground_hint = (
        "Show Me the Money", "THURSDAY", "MADE IN SEOUL", "POEMV", "YAHO",
        "Hash Brand", "Garion", "Free The Mane", "Flow the Life", "Mantra",
    )
    if any(h in (album or "") for h in underground_hint):
        score += 500
    if artist in (
        "The Quiett", "Deepflow", "Huckleberry P", "Don Mills", "Paloalto",
        "Nafla", "Loopy", "BewhY", "E-Sens", "Verbal Jint", "B-Free",
        "Khundi Panda", "Owen Ovadoz", "Don Malik", "TOIL", "Blase",
    ):
        score += 200

    return score
