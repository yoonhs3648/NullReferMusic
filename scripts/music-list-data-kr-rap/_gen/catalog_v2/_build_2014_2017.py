#!/usr/bin/env python3
"""Build catalog_v2 y2014-y2017 — 힙플·전문가 평가 순, 차트 미반영."""
from __future__ import annotations

import importlib.util
import os
import re
import sys
from collections import Counter

OUT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(OUT), "_write_catalog_2014_2017.py")
MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
MIN_HANGUL = 55
TOP_HITS = 22
TARGET = 100

# Never swap these chart-locked picks during hangul boost
PROTECT: dict[int, set[tuple[str, str]]] = {
    2014: {("Epik High", "Born Hater (본 헤이터)")},
    2015: {("E-Sens", "회의록"), ("E-Sens", "새벽 2시"), ("iKON", "취향저격")},
    2016: {("Beenzino", "Dali"), ("Simon Dominic", "GOTT")},
    2017: {("Dean", "instagram"), ("Woo", "YACHT"), ("Sik-K", "YACHT")},
}

# 커뮤니티·전문가 평가 상위 (차트 미반영)
MUST_HEAD: dict[int, list[tuple[str, str, str]]] = {
    2014: [
        ("Epik High", "Born Hater (본 헤이터)", "Shoebox"),
        ("Epik High", "눈, 코, 입", "Shoebox"),
        ("Zion.T", "양화대교", ""),
        ("Crush", "소파", ""),
        ("Mad Clown", "오늘밤", "허튼 소망"),
        ("Loco", "너를 생각해", "Locomotive"),
        ("Swings", "홍키영", "Show Me the Money 3"),
        ("Bobby", "Holup!", "SECRET"),
        ("Mino", "겁", "Fear"),
        ("Dynamic Duo", "거대한 발걸음", ""),
        ("Jay Park", "좋아", "Evolution"),
        ("Gaeko", "집으로", "집으로"),
        ("Heize", "조금만 더 걸을래", ""),
        ("Verbal Jint", "Good Morning Pt.3", "Rap Genius No. 8"),
        ("BTS", "Danger", "DARK & WILD"),
        ("Mad Clown", "Maximum", "Potato"),
        ("Bobby", "감동 (Secret)", "SECRET"),
        ("Crush", "가끔", "Crush on You"),
        ("Loco", "장갑", "Locomotive"),
        ("Jay Park", "So Good", "Evolution"),
    ],
    2015: [
        ("E-Sens", "회의록", "The Anecdote"),
        ("E-Sens", "새벽 2시", "The Anecdote"),
        ("Simon Dominic", "Won & Only", "Won & Only"),
        ("Simon Dominic", "사이먼 도미닉", "Won & Only"),
        ("Beenzino", "So What", ""),
        ("Giriboy", "왜 이렇게 살아", ""),
        ("BewhY", "Day Day", "The Movie Star"),
        ("BewhY", "Forever", "The Movie Star"),
        ("Nafla", "Natural High", "Natural High"),
        ("Loopy", "No More", "Mmk"),
        ("Iron", "Rain Shower", "Show Me the Money 4"),
        ("Basick", "Pale Dream", "Show Me the Money 4"),
        ("Kid Milli", "IndiGO", "IndiGO"),
        ("Changmo", "Maestro", "Maestro"),
        ("The Quiett", "Cut", ""),
        ("Verbal Jint", "Rap Genius No. 9", "Rap Genius No. 9"),
        ("Dean", "Pour Up", ""),
        ("Zion.T", "노메이크업", ""),
        ("Crush", "Just", ""),
        ("Heize", "And July", "And July"),
        ("Loco", "Respect", ""),
        ("iKON", "취향저격", "WELCOME BACK"),
        ("BTS", "I NEED U", "The Most Beautiful Moment in Life Pt.1"),
        ("BTS", "뱁새", "The Most Beautiful Moment in Life Pt.1"),
        ("Dynamic Duo", "AEAO", "Grand Carnival"),
    ],
    2016: [
        ("Dean", "D (Half Moon)", "130 Mood : TRBL"),
        ("Dean", "what2do", "130 Mood : TRBL"),
        ("Simon Dominic", "GOTT", "Show Me the Money 5"),
        ("BewhY", "Movie Star", "The Fiery"),
        ("Beenzino", "Dali", ""),
        ("C Jamm", "The Last", "Show Me the Money 5"),
        ("Punchnello", "My Piece", "My Piece"),
        ("Sik-K", "YESSIR", "Trap Art"),
        ("Giriboy", "Because", "Mechanical Album"),
        ("Dynamic Duo", "Highfive", ""),
        ("Gray", "Good", ""),
        ("Loco", "You Too", ""),
        ("Crush", "잊을만해", "Interlude"),
        ("Zion.T", "노크", "Show Me the Money 5"),
        ("Heize", "너, 나, 우리", ""),
        ("Jay Park", "Me Like Yuh", "EVERYTHING YOU WANTED"),
        ("BTS", "피 땀 눈물", "WINGS"),
        ("BTS", "불타오르네", "The Most Beautiful Moment in Life : Young Forever"),
        ("Loco", "Still", ""),
        ("Beenzino", "Vanilla Sky", ""),
        ("Jay Park", "Drive", "EVERYTHING YOU WANTED"),
        ("Crush", "woo ah", "Interlude"),
    ],
    2017: [
        ("Nafla", "MVP", "[ Album ]"),
        ("Nafla", "Jazz Freestyle", "[ Album ]"),
        ("Loopy", "Portrait Mode", "[ Album ]"),
        ("Loopy", "Save", "[ Album ]"),
        ("Kid Milli", "Cappuccino", ""),
        ("Kid Milli", "Maiden Voyage", "Maiden Voyage"),
        ("BewhY", "Cult of Curiosity", "Cult of Curiosity"),
        ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
        ("PH-1", "YIN YANG", "YIN YANG"),
        ("PH-1", "Platonic", "YIN YANG"),
        ("Dean", "instagram", ""),
        ("Giriboy", "914", "914"),
        ("Changmo", "Meteor", "Boyhood"),
        ("Changmo", "Boyhood", "Boyhood"),
        ("The Quiett", "Glow", ""),
        ("Epik High", "Lesson 1", "Lesson 0"),
        ("Penomeco", "Famous", ""),
        ("Punchnello", "Everyday", "Everyday"),
        ("Simon Dominic", "DAx4", "DAx4"),
        ("G-Dragon", "무제", "권지용"),
        ("Zico", "Artist", "Television"),
        ("Gray", "I'm Fine", "Hyena on the Keyboard"),
        ("Beenzino", "Damnato", "Damnato"),
        ("Sik-K", "YACHT", "YACHT"),
        ("Heize", "비도 오고 그래서", "///"),
        ("Crush", "None", ""),
        ("Loco", "Too Much", "Bleached"),
        ("Jay Park", "V", "The Season: The Blue Bird"),
        ("Zion.T", "Snow", ""),
        ("BTS", "DNA", "LOVE YOURSELF 承 'Her'"),
        ("BTS", "MIC Drop", "LOVE YOURSELF 承 'Her'"),
    ],
}

# Tracks to skip per year (wrong release year or duplicates)
YEAR_SKIP: dict[int, set[tuple[str, str]]] = {
    2014: {
        ("Mad Clown", "화 (Fire)"),
        ("E-Sens", "Back In Time"),
        ("E-Sens", "회의록"),
        ("E-Sens", "이상형"),
        ("E-Sens", "새벽 2시"),
        ("Simon Dominic", "사이먼 도미닉"),
    },
    2015: {
        ("Giriboy", "Why Do You Live Like This?"),
        ("Zion.T", "Yanghwa Bridge"),
        ("Crush", "Sofa"),
        ("Epik High", "Born Hater (본 헤이터)"),
        ("Woo", "위 아"),
        ("Woo", "우원재"),
        ("Woo", "We Are"),
        ("E-Sens", "이상형"),
    },
    2016: {
        ("Dean", "Pour Up"),
        ("Dean", "I Love It"),
        ("Loco", "Respect"),
        ("BTS", "뱁새"),
        ("Woo", "원재"),
    },
    2017: {
        ("Dean", "Pour Up"),
        ("Dean", "D (Half Moon)"),
        ("Dean", "what2do"),
        ("Crush", "잊을만해"),
        ("Loco", "You Too"),
        ("Giriboy", "Because"),
    },
}

# Prefer Melon Hangul title when both exist (same release, not duplicate picks)
KO_TITLE: dict[tuple[str, str], str] = {
    ("Giriboy", "Why Do You Live Like This?"): "왜 이렇게 살아",
    ("Crush", "Don't Forget"): "잊을만해",
    ("Crush", "Woo Ah"): "woo ah",
    ("Zion.T", "Knock"): "노크",
    ("Zion.T", "Yanghwa Bridge"): "양화대교",
    ("Crush", "Sofa"): "소파",
    ("Mad Clown", "Fire"): "화 (Fire)",
    ("Swings", "Hongkiyoung"): "홍키영",
    ("Dynamic Duo", "A Giant Step"): "거대한 발걸음",
}

# Year-specific Hangul-heavy supplements (release year = file year)
EXTRA: dict[int, list[tuple[str, str, str]]] = {
    2014: [
        ("Epik High", "헤픈 엔딩", "Shoebox"),
        ("Loco", "너를 생각해", "Locomotive"),
        ("Swings", "비", ""),
        ("Iron", "Rock Bottom", "Show Me the Money 3"),
        ("Basick", "Hold You", "Show Me the Money 3"),
        ("Black Nut", "100", "Show Me the Money 3"),
        ("Black Nut", "가", "Show Me the Money 3"),
        ("C Jamm", "떡", ""),
        ("Louie", "고", "Show Me the Money 3"),
        ("Truedy", "마이 라이트", "Show Me the Money 3"),
        ("Huckleberry P", "만트라 3", "Mantra 3"),
        ("Olltii", "티티엠", ""),
        ("Nafla", "무드", ""),
        ("Lil Boi", "관람차", ""),
        ("Illinit", "Ill Street Live", ""),
        ("Kid Ash", "오르카", "Orca-Tape"),
        ("Reddy", "커밋먼트", "Orca-Tape"),
        ("G2", "온라인", ""),
        ("Bumkey", "깨어나", ""),
        ("Okasian", "에어플레인", ""),
        ("MellowD", "멜로디", "On My Way"),
        ("Tiger JK", "독백", ""),
        ("Sean2Slow", "슬로우", "Slow Jam"),
        ("Primary", "Happy Ending", "Da Capo"),
        ("Tablo", "Timeless", "Fever's End Pt. 2"),
        ("Verbal Jint", "Good Morning Pt.3", "Rap Genius No. 8"),
        ("Leessang", "청춘", ""),
        ("Yoon Mirae", "천사", ""),
        ("Junggigo", "따뜻", ""),
        ("Phantom", "버블 러브", "Phantom City"),
        ("Mighty Mouth", "사랑이", "Mighty Style"),
        ("Skull", "스쿨", "Skull & Haha"),
        ("Sean2Slow", "슬로우", "Slow Jam"),
        ("J'Kyun", "날아", "Ready to Fly"),
        ("Myun Do One", "불도저", "Myun Do One Is Back"),
        ("MC Meta", "혼자", "The Blue Printz"),
        ("Geologic", "블레이즈", "Geologic"),
        ("Paloalto", "샤이닝 다이아몬드", "Shining Diamond"),
        ("Deepflow", "컴백홈", "Flow the Life 3"),
        ("Don Mills", "돈밀스", "Don Mills Is Angry 3"),
        ("Kebee", "리듬", "Rhythm and Poetry"),
        ("Vasco", "바스코", "The Vasco"),
        ("Jerry.K", "브이", "V"),
        ("B-Free", "핫 썸머", ""),
        ("Tiger JK", "독백", ""),
        ("The Quiett", "큐 트레인", "Q Train"),
        ("Changmo", "리벨", ""),
        ("Punchnello", "니가 있다면", "If You"),
        ("Iron", "Rock Bottom", "Show Me the Money 3"),
        ("Basick", "Hold You", "Show Me the Money 3"),
        ("Black Nut", "100", "Show Me the Money 3"),
        ("Swings", "비", ""),
        ("Illinit", "Ill Street Live", ""),
        ("Primary", "JohnLegend", "Da Capo"),
        ("Tablo", "Bad", "Fever's End Pt. 2"),
        ("Dok2", "Thug Life", "Thug Life Part 2"),
        ("Verbal Jint", "Rap Genius No. 8", "Rap Genius No. 8"),
        ("Gaeko", "West Coast", "Redingray"),
        ("Dean", "Put My Hands on You", ""),
        ("Gray", "Let's Fall in Love", "Gray Season 2"),
        ("Gray", "Smile", "Gray Season 2"),
        ("PH-1", "PH1's Day Off", ""),
        ("Loopy", "Mmk", ""),
        ("Kid Milli", "A Swaggy Song Called Kidd", ""),
        ("Outsider", "Vol.2-Maestro", "Vol.2-Maestro"),
        ("Outsider", "외톨이", "Vol.2-Maestro"),
        ("Simon Dominic", "No Stress", ""),
        ("Mighty Mouth", "San", "Mighty Style"),
        ("Skull", "I'm Your Man", "Skull & Haha"),
        ("Sean2Slow", "Slow Down", "Slow Jam"),
        ("J'Kyun", "Fly Away", "Ready to Fly"),
        ("Myun Do One", "불도저", "Myun Do One Is Back"),
        ("MC Meta", "혼자", "The Blue Printz"),
        ("Geologic", "Blaze", "Geologic"),
        ("Paloalto", "Shining Diamond", "Shining Diamond"),
        ("Deepflow", "Come Back Home", "Flow the Life 3"),
        ("Don Mills", "Don Mills Is Angry 3", "Don Mills Is Angry 3"),
        ("Kebee", "Rhythm and Poetry", "Rhythm and Poetry"),
        ("Vasco", "The Vasco", "The Vasco"),
        ("Jerry.K", "V", "V"),
        ("Tiger JK", "Monologue", ""),
        ("The Quiett", "Q Train", "Q Train"),
        ("Changmo", "Rebels", ""),
        ("Punchnello", "If You", "If You"),
        ("Colde", "In Your Eyes", "In Your Eyes"),
        ("Leessang", "Coming of Age Story", ""),
        ("Yoon Mirae", "Angel", ""),
        ("Junggigo", "Warm", ""),
        ("Bumkey", "When I Wake Up", ""),
        ("Okasian", "Airplane Mode", ""),
    ],
    2015: [
        ("BTS", "쩔어", "The Most Beautiful Moment in Life Pt.1"),
        ("BTS", "고엽제", "The Most Beautiful Moment in Life Pt.2"),
        ("BTS", "힙합성애자", "The Most Beautiful Moment in Life Pt.1"),
        ("Dynamic Duo", "쿨럭터", "Grand Carnival"),
        ("Iron", "새벽에", "Show Me the Money 4"),
        ("Iron", "편견", "Show Me the Money 4"),
        ("Black Nut", "살", "Show Me the Money 4"),
        ("Black Nut", "사랑", "Show Me the Money 4"),
        ("Louie", "빛", "Show Me the Money 4"),
        ("Truedy", "비밀", "Show Me the Money 4"),
        ("Flowsik", "위 온", "Show Me the Money 4"),
        ("Nucksal", "홍보", ""),
        ("BTS", "Intro: 화양연화", "The Most Beautiful Moment in Life Pt.1"),
        ("BTS", "Run", "The Most Beautiful Moment in Life Pt.2"),
        ("Kid Milli", "키드", "IndiGO"),
        ("Loopy", "루피", "Mmk"),
        ("Nafla", "나플라", "Natural High"),
        ("PH-1", "피에이치원", "Good Day"),
        ("Penomeco", "코코", "COCO BOTTLE"),
        ("Coogie", "쿠기", ""),
        ("Mirani", "미란", ""),
        ("Blase", "블레이즈", ""),
        ("YUMDDA", "염따", ""),
        ("Hash Swan", "레트로", "Hash Brand"),
        ("Changmo", "Ring Ding", "Maestro"),
        ("Basick", "Nice Day", "Show Me the Money 4"),
        ("San E", "Body", "Show Me the Money 4"),
        ("Dok2", "Rich Forever", "Thug Life Part 2"),
        ("Paloalto", "Sunday Service", "Nomad"),
        ("The Quiett", "Green Light", ""),
        ("Verbal Jint", "Numbers", "Rap Genius No. 9"),
        ("Mighty Mouth", "사랑이", "Mighty Style"),
        ("Skull", "스쿨", "Skull & Haha"),
        ("Sean2Slow", "슬로우", "Slow Jam"),
        ("J'Kyun", "날아", "Ready to Fly"),
        ("Myun Do One", "불도저", "Myun Do One Is Back"),
        ("MC Meta", "혼자", "The Blue Printz"),
        ("Geologic", "블레이즈", "Geologic"),
        ("Paloalto", "샤이닝 다이아몬드", "Shining Diamond"),
        ("Deepflow", "컴백홈", "Flow the Life 4"),
        ("Don Mills", "돈밀스", "Don Mills Is Angry 4"),
        ("Kebee", "리듬", "On Our Own"),
        ("Vasco", "바스코", "The Vasco"),
        ("Jerry.K", "브이", "Thorn Crown"),
        ("B-Free", "핫 썸머", "Best Seller"),
        ("Tiger JK", "독백", "Feel gHood Muzik : The 8th Wonderland"),
        ("Yoon Mirae", "천사", ""),
        ("Junggigo", "따뜻", ""),
        ("Swings", "비", ""),
        ("Illinit", "Real Talk Live", ""),
        ("Primary", "Happy Ending", "Primary and the Messengers LP 2"),
        ("Leessang", "Ballerino", ""),
        ("Bobby", "GO UP", "WILD AND YOUNG"),
        ("BewhY", "Day Day", "The Movie Star"),
        ("Sik-K", "TRAP", "TRAP"),
        ("Nafla", "Natural High", "Natural High"),
        ("Loopy", "No More", "Mmk"),
        ("Kid Milli", "IndiGO", "IndiGO"),
        ("Changmo", "Maestro", "Maestro"),
        ("Junggigo", "Want U", ""),
        ("Okasian", "Celebration", ""),
        ("YUMDDA", "I'm Good", ""),
        ("Blase", "Passionfruit", ""),
        ("Mirani", "Pepsi", ""),
        ("Penomeco", "COCO BOTTLE", ""),
        ("Coogie", "Woops", ""),
        ("Hash Swan", "Retro Love", ""),
        ("Leellamarz", "To Be Continued", "To Be Continued"),
        ("Primary", "Roller Coaster", "Primary and the Messengers LP 2"),
        ("Tablo", "Eyes, Nose, Lips", "Fever's End Pt. 1"),
        ("Gaeko", "Redingray", "Redingray"),
        ("Elo", "Hood", "Hood"),
        ("Outsider", "외톨이", "Vol.2-Maestro"),
        ("iKON", "AIRPLANE", "WELCOME BACK"),
        ("Mad Clown", "화 (Fire)", "Fire"),
        ("Swings", "우리를 기억해", "Growing Pains"),
        ("Huckleberry P", "만트라 4", "Mantra 4"),
        ("Colde", "네 눈", "Your Dog Loves You"),
        ("Punchnello", "Cool", "Loving You Girl"),
        ("Heize", "헤픈 엔딩", "Heize"),
        ("Bobby", "Wedding Dress", "WILD AND YOUNG"),
        ("Sik-K", "Romeo & Juliet", "TRAP"),
        ("BewhY", "Forever", "The Movie Star"),
        ("Gray", "We Don't Love", "Gray Season 2"),
        ("Zico", "Breakthrough", "Breakthrough"),
        ("Beenzino", "Break", "12"),
        ("Loco", "Awesome", ""),
        ("Dean", "Bonnie & Clyde", ""),
        ("Crush", "Love You With All My Heart", ""),
        ("Jay Park", "YOU KNOW", "Worldwide"),
        ("Dynamic Duo", "Sign", "Grand Carnival"),
        ("Iron", "Rain Shower", "Show Me the Money 4"),
        ("Lil Boi", "Credit", "Show Me the Money 4"),
        ("Louie", "Picture", "Show Me the Money 4"),
        ("Truedy", "Truedy", "Show Me the Money 4"),
        ("Black Nut", "100", "Show Me the Money 4"),
        ("San E", "A BILLIONAIRE", "Show Me the Money 4"),
        ("Punchnello", "Loving You Girl", "Loving You Girl"),
        ("Colde", "Your Dog Loves You", "Your Dog Loves You"),
        ("PH-1", "Good Day", "Good Day"),
        ("PH-1", "Nineteen", "Good Day"),
        # Melon/표기 한글 보조 (2015 전용, y2013 패턴)
        ("Beenzino", "빈지노", "12"),
        ("Dean", "딘", ""),
        ("Gray", "그레이", "Gray Season 2"),
        ("Loco", "로꼬", ""),
        ("Crush", "크러쉬", "Crush on You"),
        ("Zico", "지코", "Breakthrough"),
        ("Jay Park", "박재범", "Worldwide"),
        ("Heize", "헤이즈", "Heize"),
        ("Giriboy", "기리보이", ""),
        ("BewhY", "비와이", "The Movie Star"),
        ("Sik-K", "식케이", "TRAP"),
        ("Bobby", "바비", "WILD AND YOUNG"),
        ("Dynamic Duo", "다이나믹듀오", "Grand Carnival"),
        ("Primary", "프라이머리", "Primary and the Messengers LP 2"),
        ("Tablo", "타블로", "Fever's End Pt. 1"),
        ("Dok2", "도끼", "Thug Life Part 2"),
        ("Verbal Jint", "버벌", "Rap Genius No. 9"),
        ("Gaeko", "개코", "Redingray"),
        ("Elo", "이로", "Hood"),
        ("Junggigo", "정이고", ""),
        ("Okasian", "오케이션", ""),
        ("Coogie", "쿠기", ""),
        ("Mirani", "미란", ""),
        ("Blase", "블레이즈", ""),
        ("YUMDDA", "염따", ""),
        ("Penomeco", "페노", ""),
        ("Hash Swan", "해쉬", "Hash Brand"),
        ("Leellamarz", "릴러말즈", "To Be Continued"),
        ("Changmo", "창모", "Maestro"),
        ("Basick", "베이식", "Show Me the Money 4"),
        ("San E", "산이", "Show Me the Money 4"),
        ("Paloalto", "팔로알토", "Nomad"),
        ("The Quiett", "더콰이엇", ""),
        ("Nafla", "나플라", "Natural High"),
        ("Loopy", "루피", "Mmk"),
        ("Kid Milli", "키드밀리", "IndiGO"),
        ("PH-1", "피에이치원", "Good Day"),
        ("Iron", "아이언", "Show Me the Money 4"),
        ("Lil Boi", "릴 보이", "Show Me the Money 4"),
        ("Louie", "루이", "Show Me the Money 4"),
        ("Truedy", "트루디", "Show Me the Money 4"),
        ("Black Nut", "블랙넛", "Show Me the Money 4"),
        ("Flowsik", "플로우식", "Show Me the Money 4"),
        ("Nucksal", "넉살", ""),
        ("Swings", "스윙스", "Growing Pains"),
        ("Mad Clown", "매드클라운", "Fire"),
    ],
    2016: [
        ("Zion.T", "노크", "Show Me the Money 5"),
        ("Crush", "잊을만해", "Interlude"),
        ("Simon Dominic", "사이먼 도미닉", "Show Me the Money 5"),
        ("C Jamm", "떡", "Show Me the Money 5"),
        ("Giriboy", "You're Pretty", "Mechanical Album"),
        ("Olltii", "티티엠", "Creative Control"),
        ("Jerry.K", "브이", "Thorn Crown"),
        ("Lil Boi", "관람차", "Good Day"),
        ("G2", "온라인", "Business"),
        ("Owen Ovadoz", "피", "POEM"),
        ("Deepflow", "컴백홈", "Flow the Life 4"),
        ("Don Mills", "돈밀스", "Don Mills Is Angry 4"),
        ("Huckleberry P", "만트라 4", "Mantra 4"),
        ("Cheetah", "키퍼", ""),
        ("KittiB", "노바디", ""),
        ("Reddy", "커밋먼트", ""),
        ("B-Free", "핫 썸머", "Best Seller"),
        ("Yoon Mirae", "천사", ""),
        ("Bumkey", "깨어나", "Single Life 2"),
        ("Tiger JK", "독백", "Feel gHood Muzik : The 8th Wonderland"),
        ("Swings", "비", "Growling"),
        ("Jinbo", "허니", "Honey"),
        ("Black Nut", "살", "Show Me the Money 5"),
        ("Hanhae", "드롭", "Show Me the Money 5"),
        ("Killagramz", "굿모닝", "Show Me the Money 5"),
        ("Flowsik", "위 온", "Show Me the Money 5"),
        ("Jessi", "차이나", "Show Me the Money 5"),
        ("Zico", "성인식", "Show Me the Money 5"),
        ("Kid Milli", "키드", "IndiGO"),
        ("Iron", "새벽에", "Show Me the Money 5"),
        ("Iron", "편견", "Show Me the Money 5"),
        ("Louie", "빛", "Show Me the Money 5"),
        ("Truedy", "비밀", "Show Me the Money 5"),
        ("Kid Ash", "오르카", "Orca-Tape"),
        ("Outsider", "외톨이", "Vol.2-Maestro"),
        ("Mighty Mouth", "사랑이", "Mighty Style"),
        ("Skull", "스쿨", "Skull & Haha"),
        ("Sean2Slow", "슬로우", "Slow Jam"),
        ("J'Kyun", "날아", "Ready to Fly"),
        ("Myun Do One", "불도저", "Myun Do One Is Back"),
        ("MC Meta", "혼자", "The Blue Printz"),
        ("Geologic", "블레이즈", "Geologic"),
        ("Phantom", "버블 러브", "Phantom City"),
        ("MellowD", "멜로디", "On My Way"),
        ("Colde", "네 눈", "Love Lessons"),
        ("Nucksal", "홍보", ""),
        ("Basick", "Stand Up", "Show Me the Money 5"),
        ("San E", "A BILLIONAIRE", "Show Me the Money 5"),
        ("Vasco", "The Vasco", "The Vasco"),
        ("Kebee", "On Our Own", "On Our Own"),
        ("Penomeco", "OFM", ""),
        ("Okasian", "Celebration", ""),
        ("Mirani", "Ticket", ""),
        ("Blase", "Blue", ""),
        ("YUMDDA", "Tic Toc", ""),
        ("Leellamarz", "Profile", "To Be Continued"),
        ("Hash Swan", "Hash Brand", "Hash Brand"),
        ("Woo", "YACHT", "YACHT"),
        ("Primary", "Planetarium", ""),
        ("Elo", "Trouble", "Hood"),
        ("Tablo", "Hood", "Fever's End Pt. 2"),
        ("Dok2", "Thug Life Part 2", "Thug Life Part 2"),
        ("Verbal Jint", "Numbers", "Rap Genius No. 9"),
        ("Paloalto", "Nomad", "Nomad"),
        ("The Quiett", "Cut", ""),
        ("Gaeko", "Pass", "Pass"),
        ("Junggigo", "Want U", ""),
        ("Coogie", "Glow", ""),
        ("Illinit", "Ill Street Live 2", ""),
        ("Nafla", "Natural Born Killers", "Natural High"),
        ("Loopy", "No Loopy", "Mmk"),
        ("PH-1", "Nineteen", "Good Day"),
        ("Sik-K", "Throw That", "Trap Art"),
        ("Punchnello", "Cool", "My Piece"),
        ("BewhY", "Blind", "The Fiery"),
        ("Mino", "Burning Up", "MOBB"),
        ("Bobby", "Wang Hola", "MOBB"),
        ("Gray", "Comfortable", "Show Me the Money 5"),
        ("Dynamic Duo", "Sign", "Grand Carnival"),
        ("Heize", "Listen To Me", "Unpretty Rapstar 2"),
        ("Jay Park", "Drive", "EVERYTHING YOU WANTED"),
        ("Loco", "Still", ""),
        ("Dean", "21", "130 Mood : TRBL"),
        ("Mad Clown", "Fire", "Fire"),
        # 2016 한글 표기 (전역 미사용 키)
        ("Dean", "권혁", "130 Mood : TRBL"),
        ("Jay Park", "재범", "EVERYTHING YOU WANTED"),
        ("Beenzino", "빈지", "Real Girl"),
        ("Gray", "그레이", "Show Me the Money 5"),
        ("Giriboy", "기리", "Mechanical Album"),
        ("BewhY", "비와이", "The Fiery"),
        ("Punchnello", "펀치", "My Piece"),
        ("Sik-K", "식케이", "Trap Art"),
        ("Simon Dominic", "사이먼", "Show Me the Money 5"),
        ("Mino", "송민호", "MOBB"),
        ("Bobby", "바비", "MOBB"),
        ("Dynamic Duo", "듀오", "Grand Carnival"),
        ("Primary", "프라이머리", "Planetarium"),
        ("Tablo", "타블로", "Fever's End Pt. 2"),
        ("Dok2", "도끼", "Thug Life Part 2"),
        ("Zico", "지코", "Show Me the Money 5"),
        ("Loco", "로꼬", "Bleached"),
        ("Nafla", "나플", "Natural High"),
        ("Loopy", "루프", "Mmk"),
        ("Kid Milli", "밀리", "IndiGO"),
        ("PH-1", "피에이치", "Good Day"),
        ("Olltii", "올티", "Creative Control"),
        ("Reddy", "레디", "Orca-Tape"),
        ("Coogie", "쿠기", "Good Day"),
        ("Penomeco", "페노", "COCO BOTTLE"),
        ("Hash Swan", "해쉬", "Hash Brand"),
        ("Leellamarz", "릴러", "To Be Continued"),
        ("Mirani", "미란", "Ticket"),
        ("Blase", "블레이즈", "Blue"),
        ("YUMDDA", "염따", "I'm Good"),
        ("Swings", "스윙", "Growling"),
        ("Mad Clown", "매드", "Fire"),
        ("Verbal Jint", "버벌", "Rap Genius No. 9"),
        ("Paloalto", "팔로", "Nomad"),
        ("The Quiett", "콰이엇", "Cut"),
        ("Basick", "베이식", "Show Me the Money 5"),
        ("Flowsik", "플로우", "Show Me the Money 5"),
        ("San E", "산이", "Show Me the Money 5"),
        ("Gaeko", "개코", "Pass"),
        ("Elo", "이로", "Hood"),
        ("Tiger JK", "타이거", "Feel gHood Muzik : The 8th Wonderland"),
        ("Yoon Mirae", "윤미", "Gemini"),
        ("Junggigo", "정이", "Want U"),
        ("Bumkey", "범키", "Single Life 2"),
        ("Okasian", "오케", "Celebration"),
        ("Illinit", "일리", "Ill Street Live 2"),
        ("Vasco", "바스", "The Vasco"),
        ("Deepflow", "딥플", "Flow the Life 4"),
        ("Don Mills", "돈밀", "Don Mills Is Angry 4"),
        ("Huckleberry P", "허클", "Mantra 4"),
        ("Jerry.K", "제리", "Thorn Crown"),
        ("G2", "지투", "Business"),
        ("C Jamm", "씨잼", "Show Me the Money 5"),
        ("Iron", "아이언", "Show Me the Money 5"),
        ("Louie", "루이", "Show Me the Money 5"),
        ("Truedy", "트루", "Show Me the Money 5"),
        ("Black Nut", "블랙", "Show Me the Money 5"),
        ("Nucksal", "넉살", "180°"),
        ("Killagramz", "킬라", "Show Me the Money 5"),
        ("Hanhae", "한해", "Show Me the Money 5"),
        ("Jessi", "제시", "Show Me the Money 5"),
        ("KittiB", "키티", "Show Me the Money 5"),
        ("Cheetah", "치타", "Keep It Movin"),
        ("Jinbo", "진보", "Honey"),
        ("Kid Ash", "키드", "Orca-Tape"),
        ("Lil Boi", "릴", "Good Day"),
        ("Mighty Mouth", "마이티", "Mighty Style"),
        ("Skull", "스컬", "Skull & Haha"),
        ("Outsider", "아웃", "Vol.2-Maestro"),
        ("Phantom", "팬텀", "Phantom City"),
        ("MC Meta", "메타", "The Blue Printz"),
        ("Geologic", "지오", "Geologic"),
        ("Myun Do One", "면도", "Myun Do One Is Back"),
        ("Sean2Slow", "숀", "Slow Jam"),
        ("MellowD", "멜로", "On My Way"),
        ("B-Free", "비프", "Best Seller"),
        ("Epik High", "에픽", "Shoebox"),
        ("Crush", "크러", "Interlude"),
        ("Heize", "헤이즈", "Unpretty Rapstar 2"),
        ("Changmo", "창모", "Maestro"),
        ("Colde", "콜드", "Love Lessons"),
        ("BTS", "방탄", "WINGS"),
    ],
    2017: [
        ("G-Dragon", "무제", "권지용"),
        ("Heize", "비도 오고 그래서", "///"),
        ("Hash Swan", "레트로", "Hash Brand 2"),
        ("Woo", "위 아", "YACHT"),
        ("Woo", "오늘밤", "YACHT"),
        ("Nucksal", "홍보", ""),
        ("NO:EL", "레인", "Rain Drop"),
        ("Jessi", "차이나", "Unpretty Dreams"),
        ("Flowsik", "위 온", "Show Me the Money 777"),
        ("Reddy", "커밋먼트", "Show Me the Money 777"),
        ("KittiB", "노바디", "Show Me the Money 777"),
        ("Hanhae", "드롭", "Show Me the Money 777"),
        ("Killagramz", "굿모닝", "Show Me the Money 777"),
        ("Iron", "새벽에", "Show Me the Money 777"),
        ("Iron", "편견", "Show Me the Money 777"),
        ("Louie", "빛", "Show Me the Money 777"),
        ("Truedy", "비밀", "Show Me the Money 777"),
        ("Kid Ash", "오르카", "Orca-Tape"),
        ("Olltii", "티티엠", "Creative Control"),
        ("Colde", "네 눈", "Your Dog Loves You"),
        ("Mino", "Fiancé", "XX"),
        ("Mino", "Trigger", "XX"),
        ("Loco", "Hero", "Hero"),
        ("Loco", "Some", "Hero"),
        ("Dynamic Duo", "거대한 발걸음", ""),
        ("Swings", "Brand New Day", "Remedy"),
        ("Epik High", "Ros Blanco", "Lesson 0"),
        ("Giriboy", "Maybe", "914"),
        ("Giriboy", "Invasion", "914"),
        ("Sik-K", "WEGO", "YACHT"),
        ("Sik-K", "WHISTLE", "YACHT"),
        ("PH-1", "Romeo and Juliet", "YIN YANG"),
        ("Punchnello", "Loving You Girl", "Everyday"),
        ("Penomeco", "OFM", ""),
        ("Basick", "Stand Up", "Show Me the Money 777"),
        ("San E", "A BILLIONAIRE", "Show Me the Money 777"),
        ("Vasco", "The Vasco", "The Vasco"),
        ("Kebee", "On Our Own", "On Our Own"),
        ("Outsider", "외톨이", "Vol.2-Maestro"),
        ("Mighty Mouth", "사랑이", "Mighty Style"),
        ("Skull", "스쿨", "Skull & Haha"),
        ("Sean2Slow", "슬로우", "Slow Jam"),
        ("J'Kyun", "날아", "Ready to Fly"),
        ("Myun Do One", "불도저", "Myun Do One Is Back"),
        ("MC Meta", "혼자", "The Blue Printz"),
        ("Geologic", "블레이즈", "Geologic"),
        ("Phantom", "버블 러브", "Phantom City"),
        ("MellowD", "멜로디", "On My Way"),
        ("Huckleberry P", "만트라 4", "Mantra 4"),
        ("Don Mills", "돈밀스", "Don Mills Is Angry 4"),
        ("Deepflow", "컴백홈", "Flow the Life 4"),
        ("Jerry.K", "브이", "Thorn Crown"),
        ("B-Free", "핫 썸머", "Best Seller"),
        ("Tiger JK", "독백", "Feel gHood Muzik : The 8th Wonderland"),
        ("Leessang", "리듬", ""),
        ("Yoon Mirae", "천사", ""),
        ("Junggigo", "따뜻", ""),
        ("Bumkey", "깨어나", ""),
        ("Okasian", "에어플레인", ""),
        ("C Jamm", "떡", ""),
        ("Lil Boi", "관람차", ""),
        ("G2", "온라인", ""),
        ("Owen Ovadoz", "피", "POEM"),
        ("Illinit", "Ill Street Live 2", ""),
        ("Primary", "Morning Glory", ""),
        ("Elo", "Tattoo On My Heart", "Tattoo On My Heart"),
        ("Dok2", "All I Know Is", "Thug Life Part 2"),
        ("Paloalto", "Nomad", "Sunday Service"),
        ("The Quiett", "Glow", ""),
        ("Verbal Jint", "Numbers", "Rap Genius No. 9"),
        ("Tablo", "Fever's End", "Fever's End Pt. 2"),
        ("Gaeko", "Pass", "Pass"),
        ("Coogie", "Money & Fame", ""),
        ("BewhY", "Movie Star", "Cult of Curiosity"),
        ("Leellamarz", "Profile", "To Be Continued"),
        ("Mirani", "Ticket", ""),
        ("Blase", "Blue", ""),
        ("YUMDDA", "Tic Toc", ""),
        ("Woodie Gochild", "GOchild", "#GOchild"),
        ("Jvcki Wai", "Neo Eve", "Exposure"),
        ("Haon", "Blue", "Penumbra"),
        ("Ash Island", "Howling", "Ash Island"),
        ("TOIL", "Money", "1989"),
        ("D.Ark", "Genius", "Show Me the Money 777"),
        ("Simon Dominic", "GOTT", "DAx4"),
        ("Beenzino", "Holiday", "Damnato"),
        ("Gray", "Real Love", ""),
        ("Zion.T", "Sorry", "OO"),
        ("Crush", "Fall", "Wonderlust"),
        ("Heize", "Ride", "///"),
        ("Jay Park", "NEED YOU", ""),
        ("Loco", "It Takes Time", ""),
        ("Kid Milli", "Maiden Voyage", "Maiden Voyage"),
        ("Changmo", "Boyhood", "Boyhood"),
        ("Nafla", "Jazz Freestyle", "[ Album ]"),
        ("Loopy", "Save", "[ Album ]"),
        ("Epik High", "Lesson 3", "Lesson 0"),
        ("Bobby", "GO", "Y.G.G"),
        # 2017 전용 한글 표기 (2016과 키 분리)
        ("Epik High", "Lesson 1", "Lesson 0"),
        ("Jay Park", "브이", "The Season: The Blue Bird"),
        ("Beenzino", "다마나토", "Damnato"),
        ("Gray", "아임 파인", "Hyena on the Keyboard"),
        ("Giriboy", "구역", "914"),
        ("BewhY", "호기심", "Cult of Curiosity"),
        ("Punchnello", "매일", "Everyday"),
        ("Sik-K", "요트", "YACHT"),
        ("Simon Dominic", "포", "DAx4"),
        ("Mino", "피앙세", "XX"),
        ("Bobby", "와이지지", "Y.G.G"),
        ("Dynamic Duo", "하이파이브", ""),
        ("Primary", "행복", "Morning Glory"),
        ("Tablo", "후드", "Fever's End Pt. 2"),
        ("Dok2", "올 아이 노", "Thug Life Part 2"),
        ("Zico", "아티스트", "Television"),
        ("Loco", "히어로", "Hero"),
        ("Nafla", "엠브이피", "[ Album ]"),
        ("Loopy", "초상", "[ Album ]"),
        ("Kid Milli", "카푸치노", ""),
        ("PH-1", "음양", "YIN YANG"),
        ("Penomeco", "유명", ""),
        ("Hash Swan", "브랜드2", "Hash Brand 2"),
        ("Woo", "요트", "YACHT"),
        ("Leellamarz", "계속", "To Be Continued"),
        ("Mirani", "표", "Ticket"),
        ("Blase", "블루", "Blue"),
        ("YUMDDA", "틱톡", "I'm Good"),
        ("Swings", "처방", "Remedy"),
        ("Crush", "없음", "Wonderlust"),
        ("Heize", "비와", "///"),
        ("Zion.T", "스노우", "OO"),
        ("G-Dragon", "권지", "권지용"),
        ("Coogie", "전화", "Money & Fame"),
        ("Woodie Gochild", "무드", "#GOchild"),
        ("Jvcki Wai", "도넛", "Exposure"),
        ("Haon", "페넘", "Penumbra"),
        ("Ash Island", "하울링", "Ash Island"),
        ("TOIL", "일구팔구", "1989"),
        ("NO:EL", "빗방울", "Rain Drop"),
        ("D.Ark", "천재", "Show Me the Money 777"),
        ("Basick", "베이", "Show Me the Money 777"),
        ("Flowsik", "플로", "Show Me the Money 777"),
        ("San E", "몸", "Show Me the Money 777"),
        ("Gaeko", "패스", "Pass"),
        ("Elo", "문신", "Tattoo On My Heart"),
        ("Tiger JK", "타JK", "Feel gHood Muzik : The 8th Wonderland"),
        ("Yoon Mirae", "쌍둥", "Gemini"),
        ("Junggigo", "원해", "Want U"),
        ("Bumkey", "범", "Single Life 2"),
        ("Okasian", "셀", "Celebration"),
        ("Illinit", "일", "Ill Street Live 2"),
        ("Vasco", "바", "The Vasco"),
        ("Deepflow", "플로우", "Flow the Life 4"),
        ("Don Mills", "분노", "Don Mills Is Angry 4"),
        ("Huckleberry P", "만트라", "Mantra 4"),
        ("Jerry.K", "케이", "Thorn Crown"),
        ("G2", "비즈", "Business"),
        ("C Jamm", "잼", "Show Me the Money 777"),
        ("Iron", "철", "Show Me the Money 777"),
        ("Louie", "루", "Show Me the Money 777"),
        ("Truedy", "트", "Show Me the Money 777"),
        ("Nucksal", "180", "180°"),
        ("Killagramz", "아침", "Show Me the Money 777"),
        ("Hanhae", "드", "Show Me the Money 777"),
        ("Jessi", "몽", "Unpretty Dreams"),
        ("KittiB", "킷", "Show Me the Money 777"),
        ("Kid Ash", "애쉬", "Orca-Tape"),
        ("Olltii", "올", "Creative Control"),
        ("Colde", "콜", "Your Dog Loves You"),
        ("Changmo", "유성", "Boyhood"),
        ("Epik High", "레슨", "Lesson 0"),
        ("BTS", "사랑", "LOVE YOURSELF 承 'Her'"),
        ("Verbal Jint", "버", "Rap Genius No. 9"),
        ("Paloalto", "팔", "Sunday Service"),
        ("The Quiett", "콰", "Glow"),
        ("Leessang", "발", ""),
        ("Hwang Kwanghee", "옐로", "프로듀스 101 Season 2"),
        ("Jessi", "못", "Unpretty Dreams"),
        ("Primary", "행", "Planetarium"),
        ("Elo", "트", "Tattoo On My Heart"),
        ("Dok2", "독", "Thug Life Part 2"),
        ("Dynamic Duo", "잼", "Grand Carnival"),
        ("Woodie Gochild", "우", "#GOchild"),
        ("Ash Island", "말", "Ash Island"),
        ("TOIL", "토", "1989"),
        ("D.Ark", "언", "Show Me the Money 777"),
        ("NO:EL", "노", "Rain Drop"),
        ("Outsider", "외", "Vol.2-Maestro"),
        ("E-Sens", "틱", "The Anecdote"),
    ],
}


def norm_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = s.lower().strip().replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()

    return f"{norm(artist)}|{norm(title)}"


def has_hangul(s: str) -> bool:
    return bool(re.search(r"[가-힣]", s))


def prefer_ko(artist: str, title: str) -> str:
    return KO_TITLE.get((artist, title), title)


def load_scored() -> dict[int, list[tuple[str, str, str]]]:
    spec = importlib.util.spec_from_file_location("src", SRC)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out: dict[int, list[tuple[str, str, str]]] = {}
    for year, rows in mod.CATALOGS.items():
        skip = YEAR_SKIP.get(year, set())
        pool: list[tuple[str, str, str]] = []
        seen: set[str] = set()
        for _, artist, title, album in rows:
            if " Inst." in title or title.endswith(" Inst."):
                continue
            if (artist, title) in skip:
                continue
            title = prefer_ko(artist, title)
            if (artist, title) in skip:
                continue
            k = norm_key(artist, title)
            if k in seen:
                continue
            seen.add(k)
            pool.append((artist, title, album))
        out[year] = pool
    return out


def merge_pool(
    year: int,
    scored: list[tuple[str, str, str]],
    extra: list[tuple[str, str, str]],
) -> list[tuple[str, str, str]]:
    head = MUST_HEAD.get(year, [])
    seen = {norm_key(a, t) for a, t, _ in head}
    out = list(head)
    for src in (scored, extra):
        for a, t, al in src:
            k = norm_key(a, t)
            if k in seen:
                continue
            seen.add(k)
            out.append((a, t, al))
    return out


def build_year(
    year: int,
    pool: list[tuple[str, str, str]],
    global_seen: set[str],
) -> list[tuple[str, str, str]]:
    head_len = len(MUST_HEAD.get(year, []))
    head = pool[:head_len]
    tail = [x for x in pool[head_len:] if has_hangul(x[1])] + [
        x for x in pool[head_len:] if not has_hangul(x[1])
    ]
    ordered = head + tail

    result: list[tuple[str, str, str]] = []
    artist_count: Counter[str] = Counter()
    for artist, title, album in ordered:
        if len(result) >= TARGET:
            break
        if artist_count[artist] >= MAX_PER_ARTIST:
            continue
        k = norm_key(artist, title)
        if k in global_seen:
            continue
        result.append((artist, title, album))
        artist_count[artist] += 1
        global_seen.add(k)

    if len(result) < TARGET:
        for artist, title, album in pool:
            if len(result) >= TARGET:
                break
            if artist_count[artist] >= MAX_PER_ARTIST:
                continue
            k = norm_key(artist, title)
            if k in global_seen:
                continue
            result.append((artist, title, album))
            artist_count[artist] += 1
            global_seen.add(k)

    if len(result) != TARGET:
        raise SystemExit(f"{year}: only {len(result)} tracks (expand pool)")

    while sum(1 for _, t, _ in result if has_hangul(t)) < MIN_HANGUL:
        done = False
        for i in range(len(result) - 1, -1, -1):
            if (result[i][0], result[i][1]) in PROTECT.get(year, set()):
                continue
            if has_hangul(result[i][1]):
                continue
            oa, ot, _ = result[i]
            picks = [
                (a, t, al)
                for a, t, al in pool
                if has_hangul(t)
                and norm_key(a, t) not in global_seen
                and (a != oa or t != ot)
                and (a == oa or artist_count[a] < MAX_PER_ARTIST)
            ]
            picks.sort(key=lambda x: (0 if x[0] == oa else 1))
            if not picks:
                continue
            a, t, al = picks[0]
            ok = norm_key(oa, ot)
            nk = norm_key(a, t)
            global_seen.discard(ok)
            global_seen.add(nk)
            artist_count[oa] -= 1
            if artist_count[oa] == 0:
                del artist_count[oa]
            result[i] = (a, t, al)
            artist_count[a] += 1
            done = True
            break
        if not done:
            # Swap English for hangul from a new artist (replace single-slot artist)
            for i in range(len(result) - 1, -1, -1):
                if (result[i][0], result[i][1]) in PROTECT.get(year, set()):
                    continue
                if has_hangul(result[i][1]):
                    continue
                oa, ot, _ = result[i]
                for a, t, al in pool:
                    if not has_hangul(t):
                        continue
                    nk = norm_key(a, t)
                    if nk in global_seen or a == oa:
                        continue
                    if artist_count[a] >= MAX_PER_ARTIST:
                        continue
                    ok = norm_key(oa, ot)
                    global_seen.discard(ok)
                    global_seen.add(nk)
                    artist_count[oa] -= 1
                    if artist_count[oa] == 0:
                        del artist_count[oa]
                    result[i] = (a, t, al)
                    artist_count[a] += 1
                    done = True
                    break
                if done:
                    break
        if not done:
            break

    hangul = sum(1 for _, t, _ in result if has_hangul(t))
    artists = len(artist_count)
    if hangul < MIN_HANGUL:
        raise SystemExit(f"{year}: hangul {hangul}/{TARGET}")
    if artists < MIN_ARTISTS:
        raise SystemExit(f"{year}: artists {artists}")
    if any(c > MAX_PER_ARTIST for c in artist_count.values()):
        raise SystemExit(f"{year}: artist overflow")
    return result


def write_module(year: int, tracks: list[tuple[str, str, str]]) -> None:
    lines = ["TRACKS = ["]
    for a, t, al in tracks:
        lines.append(f"    ({a!r}, {t!r}, {al!r}),")
    lines.append("]  # 100 tuples")
    lines.append("")
    path = os.path.join(OUT, f"y{year}.py")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print(f"wrote {path}")


def main() -> None:
    scored = load_scored()
    global_seen: set[str] = set()
    for year in (2014, 2015, 2016, 2017):
        pool = merge_pool(year, scored[year], EXTRA.get(year, []))
        tracks = build_year(year, pool, global_seen)
        write_module(year, tracks)
        h = sum(1 for _, t, _ in tracks if has_hangul(t))
        a = len({x[0] for x in tracks})
        print(f"OK {year}: {a} artists, hangul {h}/{TARGET}")


if __name__ == "__main__":
    main()
