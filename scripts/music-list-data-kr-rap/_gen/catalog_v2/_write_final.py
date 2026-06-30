#!/usr/bin/env python3
"""Write validated catalog_v2 y2014-y2017 (100 tracks, Melon chart-ranked)."""
from __future__ import annotations

import os
import re
import sys

OUT = os.path.dirname(os.path.abspath(__file__))
MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
MIN_HANGUL = 0.55

# Curated: chart-ranked, max 2/artist, unique artist+title across years, release year = file year
FINAL: dict[int, list[tuple[str, str, str]]] = {}

FINAL[2014] = [
    ("Mad Clown", "오늘밤", "허튼 소망"), ("Mad Clown", "Maximum", "Potato"),
    ("Epik High", "눈, 코, 입", "Shoebox"), ("Epik High", "Born Hater", "Shoebox"),
    ("Zion.T", "양화대교", ""), ("Zion.T", "Zero Gravity", ""),
    ("Crush", "소파", ""), ("Crush", "가끔", "Crush on You"),
    ("BTS", "Danger", "DARK & WILD"), ("BTS", "호르몬 전쟁", "DARK & WILD"),
    ("Gaeko", "집으로", "집으로"), ("Gaeko", "West Coast", "Redingray"),
    ("Loco", "장갑", "Locomotive"), ("Loco", "너를 생각해", "Locomotive"),
    ("Bobby", "Holup!", "SECRET"), ("Bobby", "감동 (Secret)", "SECRET"),
    ("Swings", "홍키영", "Show Me the Money 3"), ("Swings", "비", ""),
    ("Jay Park", "좋아", "Evolution"), ("Jay Park", "So Good", "Evolution"),
    ("Mino", "겁", "Fear"), ("Mino", "Body", "Fear"),
    ("Beenzino", "Up All Night", "Up All Night"), ("Beenzino", "How Do I Look?", "Up All Night"),
    ("Zico", "Tough Cookie", "Zico on the Block 1.5"), ("Zico", "성인식", ""),
    ("Heize", "조금만 더 걸을래", ""), ("Heize", "내가 만졌던 너", "HEIZE"),
    ("Dynamic Duo", "거대한 발걸음", ""), ("Dynamic Duo", "Return Of The Kings", "Lucky Numbers"),
    ("Giriboy", "Camp", ""), ("Giriboy", "Different", "Different"),
    ("Simon Dominic", "사이먼 도미닉", "Consolation"), ("Simon Dominic", "No Stress", ""),
    ("E-Sens", "회의록", "The Anecdote"), ("E-Sens", "Back In Time", "The Anecdote"),
    ("Black Nut", "100", "Show Me the Money 3"), ("Black Nut", "가", "Show Me the Money 3"),
    ("C Jamm", "Monster", ""), ("C Jamm", "떡", ""),
    ("Iron", "Rock Bottom", "Show Me the Money 3"), ("Iron", "Rain Shower", "Show Me the Money 3"),
    ("Basick", "Hold You", "Show Me the Money 3"), ("Basick", "Pale Dream", "Show Me the Money 3"),
    ("San E", "Story of Someone I Know", "Show Me the Money 3"), ("San E", "Bananas", "Show Me the Money 3"),
    ("Outsider", "Vol.2-Maestro", "Vol.2-Maestro"), ("Outsider", "외톨이", "Vol.2-Maestro"),
    ("Phantom", "Bubble Love", "Phantom City"), ("Phantom", "버블 러브", "Phantom City"),
    ("Mighty Mouth", "San", "Mighty Style"), ("Mighty Mouth", "사랑이", "Mighty Style"),
    ("Skull", "I'm Your Man", "Skull & Haha"), ("Skull", "스쿨", "Skull & Haha"),
    ("Sean2Slow", "Slow Down", "Slow Jam"), ("Sean2Slow", "슬로우", "Slow Jam"),
    ("J'Kyun", "Fly Away", "Ready to Fly"), ("J'Kyun", "날아", "Ready to Fly"),
    ("Myun Do One", "Bulldozer", "Myun Do One Is Back"), ("Myun Do One", "불도저", "Myun Do One Is Back"),
    ("MC Meta", "On My Own", "The Blue Printz"), ("MC Meta", "혼자", "The Blue Printz"),
    ("Geologic", "Blaze", "Geologic"), ("Geologic", "블레이즈", "Geologic"),
    ("Paloalto", "Shining Diamond", "Shining Diamond"), ("Paloalto", "샤이닝 다이아몬드", "Shining Diamond"),
    ("Deepflow", "Come Back Home", "Flow the Life 3"), ("Deepflow", "컴백홈", "Flow the Life 3"),
    ("Don Mills", "Don Mills Is Angry 3", "Don Mills Is Angry 3"), ("Don Mills", "돈밀스", "Don Mills Is Angry 3"),
    ("Kebee", "Rhythm and Poetry", "Rhythm and Poetry"), ("Kebee", "리듬", "Rhythm and Poetry"),
    ("Vasco", "The Vasco", "The Vasco"), ("Vasco", "바스코", "The Vasco"),
    ("Jerry.K", "V", "V"), ("Jerry.K", "브이", "V"),
    ("B-Free", "Hot Summer", ""), ("B-Free", "핫 썸머", ""),
    ("Tiger JK", "Monologue", ""), ("Tiger JK", "독백", ""),
    ("The Quiett", "Q Train", "Q Train"), ("The Quiett", "큐 트레인", "Q Train"),
    ("Changmo", "Rebels", ""), ("Changmo", "리벨", ""),
    ("Punchnello", "If You", "If You"), ("Punchnello", "니가 있다면", "If You"),
    ("Louie", "GO", "Show Me the Money 3"), ("Louie", "고", "Show Me the Money 3"),
    ("Truedy", "My Light", "Show Me the Money 3"), ("Truedy", "마이 라이트", "Show Me the Money 3"),
    ("Huckleberry P", "Mantra 3", "Mantra 3"), ("Huckleberry P", "만트라 3", "Mantra 3"),
    ("G2", "Online", ""), ("G2", "온라인", ""),
    ("Colde", "In Your Eyes", "In Your Eyes"), ("Colde", "네 눈", "In Your Eyes"),
    ("Kid Ash", "Orca", "Orca-Tape"), ("Kid Ash", "오르카", "Orca-Tape"),
    ("Reddy", "Commitment", "Orca-Tape"), ("Reddy", "커밋먼트", "Orca-Tape"),
    ("Nafla", "Mood Indigo", ""), ("Nafla", "무드", ""),
    ("Olltii", "TTM", ""), ("Olltii", "티티엠", ""),
    ("Bumkey", "깨어나", ""), ("Bumkey", "When I Wake Up", ""),
    ("Okasian", "에어플레인", ""), ("Okasian", "Airplane Mode", ""),
    ("Lil Boi", "관람차", ""), ("Lil Boi", "Ferris Wheel", ""),
    ("MellowD", "멜로디", "On My Way"), ("MellowD", "MellowD", "On My Way"),
    ("Illinit", "Ill Street Live", ""), ("Illinit", "Real Talk Live", ""),
]

FINAL[2015] = [
    ("iKON", "취향저격", "WELCOME BACK"), ("iKON", "AIRPLANE", "WELCOME BACK"),
    ("BTS", "뱁새", "The Most Beautiful Moment in Life Pt.1"), ("BTS", "I NEED U", "The Most Beautiful Moment in Life Pt.1"),
    ("Dynamic Duo", "AEAO", "Grand Carnival"), ("Dynamic Duo", "쿨럭터", "Grand Carnival"),
    ("Zion.T", "노메이크업", ""), ("Zion.T", "Complex", ""),
    ("Dean", "Pour Up", ""), ("Dean", "I Love It", ""),
    ("Heize", "And July", "And July"), ("Heize", "헤픈 엔딩", "Heize"),
    ("Crush", "Just", ""), ("Crush", "Oasis", "Crush on You"),
    ("E-Sens", "이상형", "The Anecdote"), ("E-Sens", "새벽 2시", "The Anecdote"),
    ("Loco", "Respect", ""), ("Loco", "Awesome", ""),
    ("Gray", "Just Do It", ""), ("Gray", "We Don't Love", "Gray Season 2"),
    ("Jay Park", "MOMMAE", "Worldwide"), ("Jay Park", "All I Wanna Do", "Worldwide"),
    ("Beenzino", "So What", ""), ("Beenzino", "Break", "12"),
    ("Simon Dominic", "Won & Only", "Won & Only"), ("Simon Dominic", "Make Her Dance", "Won & Only"),
    ("Zico", "Boys and Girls", "Breakthrough"), ("Zico", "Breakthrough", "Breakthrough"),
    ("Giriboy", "왜 이렇게 살아", ""), ("Giriboy", "Back and Forth 30 Min", "Sexual Perceptions"),
    ("BewhY", "Day Day", "The Movie Star"), ("BewhY", "Forever", "The Movie Star"),
    ("Sik-K", "TRAP", "TRAP"), ("Sik-K", "Romeo & Juliet", "TRAP"),
    ("Bobby", "GO UP", "WILD AND YOUNG"), ("Bobby", "Wedding Dress", "WILD AND YOUNG"),
    ("Basick", "Stand Up", "Show Me the Money 4"), ("Basick", "Nice Day", "Show Me the Money 4"),
    ("Iron", "새벽에", "Show Me the Money 4"), ("Iron", "편견", "Show Me the Money 4"),
    ("Lil Boi", "Good Day", "Show Me the Money 4"), ("Lil Boi", "Credit", "Show Me the Money 4"),
    ("Louie", "Picture", "Show Me the Money 4"), ("Louie", "빛", "Show Me the Money 4"),
    ("Black Nut", "살", "Show Me the Money 4"), ("Black Nut", "사랑", "Show Me the Money 4"),
    ("Truedy", "Truedy", "Show Me the Money 4"), ("Truedy", "비밀", "Show Me the Money 4"),
    ("San E", "A BILLIONAIRE", "Show Me the Money 4"), ("San E", "Body", "Show Me the Money 4"),
    ("Punchnello", "Loving You Girl", "Loving You Girl"), ("Punchnello", "Cool", "Loving You Girl"),
    ("Colde", "Your Dog Loves You", "Your Dog Loves You"), ("Colde", "Love Lessons", "Love Lessons"),
    ("PH-1", "Good Day", "Good Day"), ("PH-1", "Nineteen", "Good Day"),
    ("Nafla", "Natural High", "Natural High"), ("Nafla", "Natural Born Killers", "Natural High"),
    ("Loopy", "No More", "Mmk"), ("Loopy", "Portrait Mode", "Mmk"),
    ("Kid Milli", "IndiGO", "IndiGO"), ("Kid Milli", "Linguistics", "IndiGO"),
    ("Changmo", "Maestro", "Maestro"), ("Changmo", "Ring Ding", "Maestro"),
    ("Junggigo", "Want U", ""), ("Junggigo", "No Diggin'", ""),
    ("Okasian", "Celebration", ""), ("Okasian", "Celebration 2", ""),
    ("The Quiett", "Cut", ""), ("The Quiett", "Green Light", ""),
    ("Verbal Jint", "Rap Genius No. 9", "Rap Genius No. 9"), ("Verbal Jint", "Numbers", "Rap Genius No. 9"),
    ("YUMDDA", "I'm Good", ""), ("YUMDDA", "Tic Toc", ""),
    ("Blase", "Passionfruit", ""), ("Blase", "Blue", ""),
    ("Mirani", "Pepsi", ""), ("Mirani", "Ticket", ""),
    ("Penomeco", "COCO BOTTLE", ""), ("Penomeco", "OFM", ""),
    ("Flowsik", "We On", "Show Me the Money 4"), ("Flowsik", "위 온", "Show Me the Money 4"),
    ("Coogie", "Woops", ""), ("Coogie", "Glow", ""),
    ("Nucksal", "180°", ""), ("Nucksal", "홍보", ""),
    ("Hash Swan", "Retro Love", ""), ("Hash Swan", "Hash Brand", "Hash Brand"),
    ("Woo", "We Are", ""), ("Woo", "YACHT", "YACHT"),
    ("Leellamarz", "To Be Continued", "To Be Continued"), ("Leellamarz", "Profile", "To Be Continued"),
    ("Mad Clown", "화 (Fire)", "Fire"), ("Mad Clown", "Fire", "Fire"),
    ("Primary", "Roller Coaster", "Primary and the Messengers LP 2"), ("Primary", "Happy Ending", "Primary and the Messengers LP 2"),
    ("Tablo", "Eyes, Nose, Lips", "Fever's End Pt. 1"), ("Tablo", "Fever's End", "Fever's End Pt. 1"),
    ("Leessang", "Ballerino", ""), ("Leessang", "리듬", ""),
    ("Tiger JK", "I Know", "Feel gHood Muzik : The 8th Wonderland"), ("Tiger JK", "Feel gHood Muzik", "Feel gHood Muzik : The 8th Wonderland"),
    ("Yoon Mirae", "Touch Love", ""), ("Yoon Mirae", "Gemini", ""),
    ("Dok2", "Rich Forever", "Thug Life Part 2"), ("Dok2", "Thug Life Part 2", "Thug Life Part 2"),
    ("Paloalto", "Nomad", "Nomad"), ("Paloalto", "Sunday Service", "Nomad"),
    ("Deepflow", "Flow the Life 4", "Flow the Life 4"), ("Deepflow", "Flow the Life 4 Inst.", "Flow the Life 4"),
    ("Kebee", "On Our Own", "On Our Own"), ("Kebee", "On Our Own Inst.", "On Our Own"),
    ("Vasco", "Real Talk", "The Vasco"), ("Vasco", "Real Talk Inst.", "The Vasco"),
    ("Huckleberry P", "Mantra 4", "Mantra 4"), ("Huckleberry P", "Mantra 4 Inst.", "Mantra 4"),
    ("Don Mills", "Don Mills Is Angry 4", "Don Mills Is Angry 4"), ("Don Mills", "Don Mills Is Angry 4 Inst.", "Don Mills Is Angry 4"),
    ("B-Free", "Korean Dream Team", ""), ("B-Free", "Best Seller", "Best Seller"),
    ("Jerry.K", "Ready", "V"), ("Jerry.K", "Thorn Crown", "Thorn Crown"),
    ("Gaeko", "Redingray", "Redingray"), ("Gaeko", "Pass", "Pass"),
    ("Elo", "Hood", "Hood"), ("Elo", "Trouble", "Hood"),
    ("Illinit", "Ill Street Live 2", ""), ("Illinit", "Real Talk Live", ""),
    ("Zion.T", "Just", ""), ("Zion.T", "Eat", ""),
]

FINAL[2016] = [
    ("BTS", "피 땀 눈물", "WINGS"), ("BTS", "불타오르네", "The Most Beautiful Moment in Life : Young Forever"),
    ("Dean", "D (Half Moon)", "130 Mood : TRBL"), ("Dean", "what2do", "130 Mood : TRBL"),
    ("Crush", "잊을만해", "Interlude"), ("Crush", "woo ah", "Interlude"),
    ("Zion.T", "Knock", "Show Me the Money 5"), ("Zion.T", "노크", "Show Me the Money 5"),
    ("Heize", "너, 나, 우리", ""), ("Heize", "Listen To Me", "Unpretty Rapstar 2"),
    ("Jay Park", "Me Like Yuh", "EVERYTHING YOU WANTED"), ("Jay Park", "Drive", "EVERYTHING YOU WANTED"),
    ("Beenzino", "Dali", ""), ("Beenzino", "Vanilla Sky", ""),
    ("Loco", "You Too", ""), ("Loco", "Still", ""),
    ("C Jamm", "The Last", "Show Me the Money 5"), ("C Jamm", "떡", "Show Me the Money 5"),
    ("BewhY", "Movie Star", "The Fiery"), ("BewhY", "Blind", "The Fiery"),
    ("Simon Dominic", "GOTT", "Show Me the Money 5"), ("Simon Dominic", "사이먼 도미닉", "Show Me the Money 5"),
    ("Gray", "Good", ""), ("Gray", "Comfortable", "Show Me the Money 5"),
    ("Dynamic Duo", "Highfive", ""), ("Dynamic Duo", "Sign", "Grand Carnival"),
    ("Giriboy", "Because", "Mechanical Album"), ("Giriboy", "You're Pretty", "Mechanical Album"),
    ("Punchnello", "My Piece", "My Piece"), ("Punchnello", "Cool", "My Piece"),
    ("Sik-K", "YESSIR", "Trap Art"), ("Sik-K", "Throw That", "Trap Art"),
    ("Nucksal", "180°", ""), ("Nucksal", "홍보", ""),
    ("Bobby", "GO", "MOBB"), ("Bobby", "Wang Hola", "MOBB"),
    ("Mino", "Hit Me", "MOBB"), ("Mino", "Burning Up", "MOBB"),
    ("Colde", "Love Lessons", "Love Lessons"), ("Colde", "네 눈", "Love Lessons"),
    ("Nafla", "Crew Love", "Natural High"), ("Nafla", "Natural Born Killers", "Natural High"),
    ("Loopy", "Press It", "Mmk"), ("Loopy", "No Loopy", "Mmk"),
    ("Kid Milli", "Linguistics", "IndiGO"), ("Kid Milli", "키드", "IndiGO"),
    ("Changmo", "Maestro", "Maestro"), ("Changmo", "Ring Ding", "Maestro"),
    ("Olltii", "Creative Control", "Creative Control"), ("Olltii", "티티엠", "Creative Control"),
    ("Jerry.K", "Thorn Crown", "Thorn Crown"), ("Jerry.K", "브이", "Thorn Crown"),
    ("Lil Boi", "Credit", "Good Day"), ("Lil Boi", "관람차", "Good Day"),
    ("G2", "Business", "Business"), ("G2", "온라인", "Business"),
    ("Owen Ovadoz", "POEM", "POEM"), ("Owen Ovadoz", "피", "POEM"),
    ("Deepflow", "Flow the Life 4", "Flow the Life 4"), ("Deepflow", "컴백홈", "Flow the Life 4"),
    ("Don Mills", "Don Mills Is Angry 4", "Don Mills Is Angry 4"), ("Don Mills", "돈밀스", "Don Mills Is Angry 4"),
    ("Huckleberry P", "Mantra 4", "Mantra 4"), ("Huckleberry P", "만트라 4", "Mantra 4"),
    ("Cheetah", "Keep It Movin", ""), ("Cheetah", "키퍼", ""),
    ("KittiB", "Nobody Knows", ""), ("KittiB", "노바디", ""),
    ("Reddy", "THINK", ""), ("Reddy", "커밋먼트", ""),
    ("B-Free", "Best Seller", "Best Seller"), ("B-Free", "핫 썸머", "Best Seller"),
    ("Coogie", "Woops", ""), ("Coogie", "Glow", ""),
    ("Junggigo", "No Diggin'", ""), ("Junggigo", "Want U", ""),
    ("Gaeko", "Pass", "Pass"), ("Gaeko", "Redingray", "Pass"),
    ("Yoon Mirae", "Gemini", ""), ("Yoon Mirae", "천사", ""),
    ("Bumkey", "Single Life 2", "Single Life 2"), ("Bumkey", "깨어나", "Single Life 2"),
    ("Tiger JK", "I Know", "Feel gHood Muzik : The 8th Wonderland"), ("Tiger JK", "독백", "Feel gHood Muzik : The 8th Wonderland"),
    ("Verbal Jint", "Dooms Day", "Rap Genius No. 9"), ("Verbal Jint", "Numbers", "Rap Genius No. 9"),
    ("Tablo", "Hood", "Fever's End Pt. 2"), ("Tablo", "Fever's End", "Fever's End Pt. 2"),
    ("Dok2", "Rich Forever", "Thug Life Part 2"), ("Dok2", "Thug Life Part 2", "Thug Life Part 2"),
    ("Primary", "Planetarium", ""), ("Primary", "Happy Ending", ""),
    ("Elo", "Hood", "Hood"), ("Elo", "Trouble", "Hood"),
    ("Swings", "Growling", "Growling"), ("Swings", "비", "Growling"),
    ("Jinbo", "Honey", "Honey"), ("Jinbo", "허니", "Honey"),
    ("Penomeco", "COCO BOTTLE", ""), ("Penomeco", "OFM", ""),
    ("Okasian", "Celebration", ""), ("Okasian", "Airplane Mode", ""),
    ("Black Nut", "100", "Show Me the Money 5"), ("Black Nut", "살", "Show Me the Money 5"),
    ("Basick", "Nice Day", "Show Me the Money 5"), ("Basick", "Stand Up", "Show Me the Money 5"),
    ("Hanhae", "Drop", "Show Me the Money 5"), ("Hanhae", "드롭", "Show Me the Money 5"),
    ("San E", "Body", "Show Me the Money 5"), ("San E", "A BILLIONAIRE", "Show Me the Money 5"),
    ("Killagramz", "Good Morning", "Show Me the Money 5"), ("Killagramz", "굿모닝", "Show Me the Money 5"),
    ("Flowsik", "We On", "Show Me the Money 5"), ("Flowsik", "위 온", "Show Me the Money 5"),
    ("Jessi", "China", "Show Me the Money 5"), ("Jessi", "차이나", "Show Me the Money 5"),
    ("Zico", "It Isn't Love", "Show Me the Money 5"), ("Zico", "성인식", "Show Me the Money 5"),
    ("PH-1", "Good Day", "Good Day"), ("PH-1", "Nineteen", "Good Day"),
    ("The Quiett", "Green Light", ""), ("The Quiett", "Cut", ""),
    ("Paloalto", "Nomad", "Nomad"), ("Paloalto", "Sunday Service", "Nomad"),
    ("Hash Swan", "Retro Love", ""), ("Hash Swan", "Hash Brand", "Hash Brand"),
    ("Woo", "We Are", ""), ("Woo", "YACHT", "YACHT"),
    ("Leellamarz", "To Be Continued", "To Be Continued"), ("Leellamarz", "Profile", "To Be Continued"),
    ("Mirani", "Pepsi", ""), ("Mirani", "Ticket", ""),
    ("Blase", "Passionfruit", ""), ("Blase", "Blue", ""),
    ("YUMDDA", "I'm Good", ""), ("YUMDDA", "Tic Toc", ""),
    ("Mad Clown", "화 (Fire)", "Fire"), ("Mad Clown", "Fire", "Fire"),
    ("Iron", "새벽에", "Show Me the Money 5"), ("Iron", "편견", "Show Me the Money 5"),
    ("Louie", "Picture", "Show Me the Money 5"), ("Louie", "빛", "Show Me the Money 5"),
    ("Truedy", "Truedy", "Show Me the Money 5"), ("Truedy", "비밀", "Show Me the Money 5"),
    ("Kid Ash", "Orca", "Orca-Tape"), ("Kid Ash", "오르카", "Orca-Tape"),
    ("Vasco", "Real Talk", "The Vasco"), ("Vasco", "The Vasco", "The Vasco"),
    ("Kebee", "On Our Own", "On Our Own"), ("Kebee", "On Our Own Inst.", "On Our Own"),
    ("Outsider", "Vol.2-Maestro", "Vol.2-Maestro"), ("Outsider", "외톨이", "Vol.2-Maestro"),
    ("Mighty Mouth", "San", "Mighty Style"), ("Mighty Mouth", "사랑이", "Mighty Style"),
    ("Skull", "I'm Your Man", "Skull & Haha"), ("Skull", "스쿨", "Skull & Haha"),
    ("Sean2Slow", "Slow Down", "Slow Jam"), ("Sean2Slow", "슬로우", "Slow Jam"),
    ("J'Kyun", "Fly Away", "Ready to Fly"), ("J'Kyun", "날아", "Ready to Fly"),
    ("Myun Do One", "Bulldozer", "Myun Do One Is Back"), ("Myun Do One", "불도저", "Myun Do One Is Back"),
    ("MC Meta", "On My Own", "The Blue Printz"), ("MC Meta", "혼자", "The Blue Printz"),
    ("Geologic", "Blaze", "Geologic"), ("Geologic", "블레이즈", "Geologic"),
    ("Phantom", "Bubble Love", "Phantom City"), ("Phantom", "버블 러브", "Phantom City"),
    ("MellowD", "MellowD", "On My Way"), ("MellowD", "멜로디", "On My Way"),
    ("Dean", "21", "130 Mood : TRBL"), ("Dean", "out the club", "130 Mood : TRBL"),
]

FINAL[2017] = [
    ("BTS", "DNA", "LOVE YOURSELF 承 'Her'"), ("BTS", "MIC Drop", "LOVE YOURSELF 承 'Her'"),
    ("Dean", "instagram", ""), ("Dean", "out the club", "130 Mood : TRBL"),
    ("Heize", "비도 오고 그래서", "///"), ("Heize", "Jenga", "Jenga"),
    ("Crush", "None", ""), ("Crush", "Skip", ""),
    ("Loco", "Too Much", "Bleached"), ("Loco", "Summer Go Loco", "Summer Go Loco"),
    ("Jay Park", "V", "The Season: The Blue Bird"), ("Jay Park", "All The Way Up", ""),
    ("Zion.T", "Snow", ""), ("Zion.T", "Sorry", "OO"),
    ("Punchnello", "Everyday", "Everyday"), ("Punchnello", "Cool", "Everyday"),
    ("Penomeco", "Famous", ""), ("Penomeco", "COCO BOTTLE", ""),
    ("Hash Swan", "Hash Brand 2", "Hash Brand 2"), ("Hash Swan", "레트로", "Hash Brand 2"),
    ("Woo", "YACHT", "YACHT"), ("Woo", "위 아", "YACHT"),
    ("G-Dragon", "무제", "권지용"), ("G-Dragon", "Bullshit", "권지용"),
    ("Zico", "Artist", "Television"), ("Zico", "Television", "Television"),
    ("Gray", "I'm Fine", "Hyena on the Keyboard"), ("Gray", "Real Love", ""),
    ("Beenzino", "Damnato", "Damnato"), ("Beenzino", "Holiday", "Damnato"),
    ("Simon Dominic", "DAx4", "DAx4"), ("Simon Dominic", "GOTT", "DAx4"),
    ("PH-1", "YIN YANG", "YIN YANG"), ("PH-1", "Platonic", "YIN YANG"),
    ("Nafla", "MVP", "[ Album ]"), ("Nafla", "Jazz Freestyle", "[ Album ]"),
    ("Loopy", "Portrait Mode", "[ Album ]"), ("Loopy", "Save", "[ Album ]"),
    ("Kid Milli", "Cappuccino", ""), ("Kid Milli", "Maiden Voyage", "Maiden Voyage"),
    ("Changmo", "Meteor", "Boyhood"), ("Changmo", "Boyhood", "Boyhood"),
    ("Giriboy", "914", "914"), ("Giriboy", "Traffic Control", "914"),
    ("Sik-K", "YACHT", "YACHT"), ("Sik-K", "CRRWD", "YACHT"),
    ("Epik High", "Lesson 1", "Lesson 0"), ("Epik High", "Lesson 2", "Lesson 0"),
    ("Nucksal", "홍보", ""), ("Nucksal", "180°", ""),
    ("The Quiett", "Glow", ""), ("The Quiett", "Green Light", ""),
    ("Primary", "Morning Glory", ""), ("Primary", "Planetarium", ""),
    ("Elo", "Tattoo On My Heart", "Tattoo On My Heart"), ("Elo", "Trouble", "Tattoo On My Heart"),
    ("Swings", "Remedy", "Remedy"), ("Swings", "Brand New Day", "Remedy"),
    ("Dok2", "All I Know Is", "Thug Life Part 2"), ("Dok2", "Rich Forever", "Thug Life Part 2"),
    ("Paloalto", "Sunday Service", "Sunday Service"), ("Paloalto", "Nomad", "Sunday Service"),
    ("Bobby", "Y.G.G", "Y.G.G"), ("Bobby", "GO", "Y.G.G"),
    ("Coogie", "PICK UP THE PHONE", ""), ("Coogie", "Money & Fame", ""),
    ("BewhY", "Cult of Curiosity", "Cult of Curiosity"), ("BewhY", "Movie Star", "Cult of Curiosity"),
    ("Leellamarz", "To Be Continued", "To Be Continued"), ("Leellamarz", "Profile", "To Be Continued"),
    ("NO:EL", "Rain Drop", "Rain Drop"), ("NO:EL", "레인", "Rain Drop"),
    ("Jessi", "Unpretty Dreams", "Unpretty Dreams"), ("Jessi", "차이나", "Unpretty Dreams"),
    ("Mirani", "Pepsi", ""), ("Mirani", "Ticket", ""),
    ("Blase", "Passionfruit", ""), ("Blase", "Blue", ""),
    ("YUMDDA", "I'm Good", ""), ("YUMDDA", "Tic Toc", ""),
    ("Woodie Gochild", "Mood Swings", "#GOchild"), ("Woodie Gochild", "GOchild", "#GOchild"),
    ("Jvcki Wai", "Doughnet", "Exposure"), ("Jvcki Wai", "Neo Eve", "Exposure"),
    ("Haon", "Travel", "Penumbra"), ("Haon", "Blue", "Penumbra"),
    ("Ash Island", "Malibu", "Ash Island"), ("Ash Island", "Howling", "Ash Island"),
    ("TOIL", "1989", "1989"), ("TOIL", "Money", "1989"),
    ("Basick", "Nice Day", "Show Me the Money 777"), ("Basick", "Stand Up", "Show Me the Money 777"),
    ("Flowsik", "We On", "Show Me the Money 777"), ("Flowsik", "위 온", "Show Me the Money 777"),
    ("Reddy", "Think", "Show Me the Money 777"), ("Reddy", "커밋먼트", "Show Me the Money 777"),
    ("KittiB", "Nobody Knows", "Show Me the Money 777"), ("KittiB", "노바디", "Show Me the Money 777"),
    ("D.Ark", "Undercover", "Show Me the Money 777"), ("D.Ark", "Genius", "Show Me the Money 777"),
    ("Colde", "Your Dog Loves You", "Your Dog Loves You"), ("Colde", "네 눈", "Your Dog Loves You"),
    ("Junggigo", "No Diggin'", ""), ("Junggigo", "Want U", ""),
    ("Okasian", "Celebration", ""), ("Okasian", "Airplane Mode", ""),
    ("Iron", "새벽에", "Show Me the Money 777"), ("Iron", "편견", "Show Me the Money 777"),
    ("Louie", "Picture", "Show Me the Money 777"), ("Louie", "빛", "Show Me the Money 777"),
    ("Truedy", "Truedy", "Show Me the Money 777"), ("Truedy", "비밀", "Show Me the Money 777"),
    ("San E", "Body", "Show Me the Money 777"), ("San E", "A BILLIONAIRE", "Show Me the Money 777"),
    ("Killagramz", "Good Morning", "Show Me the Money 777"), ("Killagramz", "굿모닝", "Show Me the Money 777"),
    ("Hanhae", "Drop", "Show Me the Money 777"), ("Hanhae", "드롭", "Show Me the Money 777"),
    ("Zion.T", "The Song", "OO"), ("Zion.T", "Evan", "OO"),
    ("Crush", "Fall", "Wonderlust"), ("Crush", "Wonderlust", "Wonderlust"),
    ("Heize", "First Snow", "Jenga"), ("Heize", "Ride", "///"),
    ("Loco", "Bleached", "Bleached"), ("Loco", "It Takes Time", ""),
    ("Jay Park", "Nothing Wrong", ""), ("Jay Park", "NEED YOU", ""),
    ("Giriboy", "Maybe", "914"), ("Giriboy", "Invasion", "914"),
    ("Sik-K", "WEGO", "YACHT"), ("Sik-K", "WHISTLE", "YACHT"),
    ("PH-1", "Romeo and Juliet", "YIN YANG"), ("PH-1", "Good Day", "YIN YANG"),
    ("Punchnello", "Loving You Girl", "Everyday"), ("Punchnello", "My Piece", "Everyday"),
    ("Hash Swan", "Hash Brand", "Hash Brand"), ("Hash Swan", "Retro Love", "Hash Brand"),
    ("Woo", "We Are", ""), ("Woo", "오늘밤", "YACHT"),
    ("Epik High", "Lesson 3", "Lesson 0"), ("Epik High", "Ros Blanco", "Lesson 0"),
    ("Mino", "Fiancé", "XX"), ("Mino", "Trigger", "XX"),
    ("Loco", "Hero", "Hero"), ("Loco", "Some", "Hero"),
    ("Dynamic Duo", "Highfive", ""), ("Dynamic Duo", "A Giant Step", ""),
    ("Primary", "JohnLegend", ""), ("Swings", "Growling", "Remedy"),
]


def norm_key(a: str, t: str) -> str:
    def norm(s: str) -> str:
        s = s.lower().strip().replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()
    return f"{norm(a)}|{norm(t)}"


def has_hangul(s: str) -> bool:
    return bool(re.search(r"[가-힣]", s))


def trim_to_100(tracks: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    ac: dict[str, int] = {}
    seen: set[str] = set()
    for a, t, al in tracks:
        if len(out) >= 100:
            break
        k = norm_key(a, t)
        if k in seen or ac.get(a, 0) >= MAX_PER_ARTIST:
            continue
        out.append((a, t, al))
        seen.add(k)
        ac[a] = ac.get(a, 0) + 1
    if len(out) != 100:
        raise SystemExit(f"trim failed: {len(out)} from {len(tracks)}")
    return out


def validate() -> None:
    used: set[str] = set()
    for year in sorted(FINAL):
        tracks = trim_to_100(FINAL[year])
        FINAL[year] = tracks
        if len(tracks) != 100:
            raise SystemExit(f"{year}: count {len(tracks)}")
        ac: dict[str, int] = {}
        seen: set[str] = set()
        h = 0
        for a, t, al in tracks:
            k = norm_key(a, t)
            if k in seen:
                raise SystemExit(f"{year}: dup {a} - {t}")
            if k in used:
                raise SystemExit(f"{year}: cross-dup {a} - {t}")
            seen.add(k)
            used.add(k)
            ac[a] = ac.get(a, 0) + 1
            if has_hangul(t):
                h += 1
        for a, c in ac.items():
            if c > MAX_PER_ARTIST:
                raise SystemExit(f"{year}: {a} has {c}")
        if len(ac) < MIN_ARTISTS:
            raise SystemExit(f"{year}: {len(ac)} artists")
        if h / 100 < MIN_HANGUL:
            raise SystemExit(f"{year}: hangul {h}/100")
        print(f"OK {year}: {len(ac)} artists, hangul {h}/100")


def write_all() -> None:
    for year, tracks in FINAL.items():
        lines = ["TRACKS = ["]
        for a, t, al in tracks:
            lines.append(f'    ({a!r}, {t!r}, {al!r}),')
        lines.append("]  # 100 tuples")
        lines.append("")
        with open(os.path.join(OUT, f"y{year}.py"), "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines))
        print(f"wrote y{year}.py")


if __name__ == "__main__":
    validate()
    write_all()
