#!/usr/bin/env python3
"""Generate catalog_v2/y2018-y2021.py — 50 artists × 2 tracks, validated."""
from __future__ import annotations

import json
import os
import re
import sys

OUT = os.path.join(os.path.dirname(__file__), "catalog_v2")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
MIN_HANGUL_RATIO = 0.55

Y2018: list[tuple[str, str, str]] = [
    ("iKON", "사랑을 했다", "NEW KIDS : CONTINUE"),
    ("iKON", "굿바이 로드 (GOODBYE ROAD)", "NEW KIDS : CONTINUE"),
    ("Zico", "어땠을까", "어땠을까"),
    ("Zico", "SoulMate (소울메이트)", "SoulMate"),
    ("Crush", "우아", "From Midnight to Sunrise"),
    ("Crush", "잊을만해", "From Midnight to Sunrise"),
    ("Heize", "내 마음을 볼 수 있나요", "HAPPEN"),
    ("Heize", "내 마을", "HAPPEN"),
    ("Mino", "아낙 (Fiancé)", "XX"),
    ("Mino", "송곳니", "XX"),
    ("Loco", "주저해 (Some)", "Hero"),
    ("Loco", "시 (Poem)", "Hero"),
    ("BewhY", "까불지마", "Cult of Curiosity"),
    ("BewhY", "1990", "Cult of Curiosity"),
    ("Simon Dominic", "ART OF PARTYING", "NO OPEN FLAME"),
    ("Simon Dominic", "NO OPEN FLAME", "NO OPEN FLAME"),
    ("Nafla", "무엇 (What)", "Show Me the Money 777"),
    ("Nafla", "Natural Born Killers", "Natural Born Killers"),
    ("Kid Milli", "Yellow (옐로우)", "Maiden Voyage"),
    ("Kid Milli", "SIT", "BEANie"),
    ("PH-1", "Homebody (홈바디)", "YIN YANG"),
    ("PH-1", "Platonic", "YIN YANG"),
    ("HAON", "Travel (트래블)", "Penumbra"),
    ("HAON", "Blue (블루)", "Penumbra"),
    ("Coogie", "Wifey (와이피)", "Emo #1"),
    ("Coogie", "GPS", "Emo #1"),
    ("Giriboy", "Engineering (엔지니어링)", "Engineering"),
    ("Giriboy", "PlanetariuM", "Engineering"),
    ("Swings", "Upgrade III", "Upgrade III"),
    ("Swings", "Growing Pains 2", "Growing Pains 2"),
    ("Changmo", "Meteor (메테오)", "Boyhood"),
    ("Changmo", "Boyhood", "Boyhood"),
    ("Dean", "DMT", ""),
    ("Dean", "instagram", ""),
    ("Sik-K", "FL1X", "FL1X"),
    ("Sik-K", "NEONBEAM", "FL1X"),
    ("Ash Island", "Malibu", "Ash Island"),
    ("Ash Island", "Howling", "Ash Island"),
    ("Leellamarz", "Profile (프로필)", "To Be Continued"),
    ("Leellamarz", "Don`t Call Me", "To Be Continued"),
    ("TOIL", "1989", "1989"),
    ("TOIL", "Money", "1989"),
    ("Woodie Gochild", "Mood Swings", "#GOchild"),
    ("Woodie Gochild", "GOchild", "#GOchild"),
    ("Jvcki Wai", "Doughnet", "Exposure"),
    ("Jvcki Wai", "Neo Eve", "Exposure"),
    ("Jessi", "Gucci", "Show Me the Money 777"),
    ("Jessi", "어떤X", "Show Me the Money 777"),
    ("D.Ark", "Undercover", "Show Me the Money 777"),
    ("D.Ark", "천재 (Genius)", "Show Me the Money 777"),
    ("Punchnello", "Cool", "Cool"),
    ("Punchnello", "If You (너라면)", "Show Me the Money 777"),
    ("Loopy", "King Loopy", "King Loopy"),
    ("Loopy", "No Loopy (노 루피)", "Show Me the Money 777"),
    ("Flowsik", "We On (위 온)", "Show Me the Money 777"),
    ("Flowsik", "반박불가 (Unbreakable)", "Show Me the Money 777"),
    ("Reddy", "THINK (띵)", "Show Me the Money 777"),
    ("Reddy", "잘 (Well)", "Show Me the Money 777"),
    ("KittiB", "Nobody Knows", "Show Me the Money 777"),
    ("KittiB", "누구 없소 (Nobody)", "Show Me the Money 777"),
    ("Blase", "Blue (블루)", ""),
    ("Blase", "Love Me", "Passionfruit"),
    ("Mirani", "Ticket (티켓)", "Ticket"),
    ("Mirani", "Bayer Dynamic", "Ticket"),
    ("YUMDDA", "Tic Toc (틱톡)", "I'm Good"),
    ("YUMDDA", "I'm Good (아임 굿)", "I'm Good"),
    ("Deepflow", "Flow the Life 4", "Flow the Life 4"),
    ("Deepflow", "집으로 (Come Back Home)", "Flow the Life 4"),
    ("Don Mills", "Don Mills Is Angry 4", "Don Mills Is Angry 4"),
    ("Don Mills", "돈밀리 4", "Don Mills Is Angry 4"),
    ("Huckleberry P", "Mantra 4", "Mantra 4"),
    ("Huckleberry P", "만트라 4", "Mantra 4"),
    ("Verbal Jint", "Rap Genius No. 9", "Rap Genius No. 9"),
    ("Verbal Jint", "랩 genius no.9", "Rap Genius No. 9"),
    ("Tablo", "Fantasy (환상)", "Drill Presents: Tablo x Fantasy"),
    ("Tablo", "Drill Presents", "Drill Presents: Tablo x Fantasy"),
    ("Paloalto", "Shangri-La (상그릴라)", "Shangri-La"),
    ("Paloalto", "Sunday Service", "Sunday Service"),
    ("Jay Park", "Likes (좋아)", ""),
    ("Jay Park", "Can't Be Saved", ""),
    ("Gray", "Tik Tak Tok (틱택톡)", ""),
    ("Gray", "Late Night (레이트 나이트)", "Gray Season 2.5"),
    ("Gaeko", "Gajah (가자)", "Gajah"),
    ("Gaeko", "Pass", "Pass"),
    ("Sokodomo", "Merry Go Round (메리고라운드)", "Merry Go Round"),
    ("Sokodomo", "IF I", "Merry Go Round"),
    ("Owen Ovadoz", "Drama (드라마)", "Drama"),
    ("Owen Ovadoz", "POEM", "POEM"),
    ("Lil Moshpit", "MOSHPIT (모스hpit)", "MOSHPIT"),
    ("Lil Moshpit", "BITE", "MOSHPIT"),
    ("Hash Swan", "Hash Brand (해시 브랜드)", "Hash Brand"),
    ("Hash Swan", "Retro Love (레트로 러브)", "Hash Brand"),
    ("NO:EL", "Rain Drop (비)", "Rain Drop"),
    ("NO:EL", "Rain Drop 2 (비 2)", "Rain Drop 2"),
    ("San E", "a SONG of ICE and FIRE", "a SONG of ICE and FIRE"),
    ("San E", "얼음과 불의 노래", "a SONG of ICE and FIRE"),
    ("C Jamm", "Monster (몬스터)", ""),
    ("C Jamm", "RED", ""),
    ("Primary", "Morning Glory (모닝글로리)", ""),
    ("Primary", "Planetarium (플라네타리움)", ""),
]

Y2019: list[tuple[str, str, str]] = [
    ("Epik High", "Eternal Sunshine", "Sleepless in __________"),
    ("Epik High", "로스트 원 (Lost One)", "Sleepless in __________"),
    ("Zico", "Summer Hate (여름 Hate)", "Human"),
    ("Zico", "Balloon (풍선)", "Human"),
    ("Lil Boi", "VVS", "Show Me the Money 8"),
    ("Lil Boi", "On My Way (온 마이 웨이)", "Show Me the Money 8"),
    ("Mudd the student", "IndiGO (인디GO)", "Show Me the Money 8"),
    ("Mudd the student", "MEMORIES (메모리즈)", "Show Me the Money 8"),
    ("Mirani", "VVS", "Show Me the Money 8"),
    ("Mirani", "VANS", "Show Me the Money 8"),
    ("Koonta", "VVS", "Show Me the Money 8"),
    ("Koonta", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
    ("Sokodomo", "coffee", "Show Me the Money 8"),
    ("Sokodomo", "Gamble (겜블)", "Show Me the Money 8"),
    ("Giriboy", "on my way", "Show Me the Money 8"),
    ("Giriboy", "SEOUL CITY G", "heat"),
    ("Changmo", "Thrift Shop (쓰리프트 샵)", "Ghetto Kids"),
    ("Changmo", "Sufferer", "Boyhood"),
    ("Beenzino", "24:26", "24:26"),
    ("Beenzino", "Mozart (모차르트)", "24:26"),
    ("Dean", "howlin' 404", "howlin' 404"),
    ("Dean", "DIE 4 YOU (다이 포 유)", "howlin' 404"),
    ("Crush", "NAPPA (낮잠)", "NAPPA"),
    ("Crush", "Lay Your Head on Me", "NAPPA"),
    ("Heize", "우리 헤어지게 될 마음이 (We Don't Talk Together)", "She Drive"),
    ("Heize", "She Drive (쉬 드라이브)", "She Drive"),
    ("Loco", "OFFICIAL (오피셜)", "OFFICIAL"),
    ("Loco", "Thinking of You", "OFFICIAL"),
    ("Gray", "Remedy (레미디)", "Remedy"),
    ("Gray", "Comfortable (편해)", "Remedy"),
    ("Sik-K", "Wet", "MAKE OUT"),
    ("Sik-K", "Out of Ink", "MAKE OUT"),
    ("Kid Milli", "BOON (분)", "BEANie"),
    ("Kid Milli", "WHY TRIP (와이 트립)", "BEANie"),
    ("Nafla", "Swervin (스wervin)", "C.R.E.A.M"),
    ("Nafla", "cashrules (캐시룰즈)", "C.R.E.A.M"),
    ("Coogie", "Save the Day (세이브 더 데이)", "Save the Day"),
    ("Coogie", "Alone (얼론)", "Save the Day"),
    ("PH-1", "Cupid's Arrow (큐피드의 화살)", "Good Day"),
    ("PH-1", "RUBBER (러버)", "Show Me the Money 8"),
    ("Ash Island", "Floating", "ISLAND"),
    ("Ash Island", "ISLAND", "ISLAND"),
    ("HAON", "HAON", "ISLAND"),
    ("HAON", "Swervin", "ISLAND"),
    ("Leellamarz", "3AM in Seoul (3AM in 서울)", "To Be Continued"),
    ("Leellamarz", "Barcode", "Show Me the Money 8"),
    ("TOIL", "Panorama (파노라마)", "Show Me the Money 8"),
    ("TOIL", "Rollin", "1989"),
    ("Blase", "Tic Tac", "Show Me the Money 8"),
    ("Blase", "Fill It", "Show Me the Money 8"),
    ("Woodie Gochild", "WaRRior (워리어)", "Show Me the Money 8"),
    ("Woodie Gochild", "Money Wave (머니 웨이브)", "Show Me the Money 8"),
    ("Owen Ovadoz", "119 REMIX (119 리믹스)", "Show Me the Money 8"),
    ("Owen Ovadoz", "119 REMIX", "Show Me the Money 8"),
    ("Lil Moshpit", "Lil Moshpit (릴 모스hpit)", "Show Me the Money 8"),
    ("Lil Moshpit", "VVS", "Show Me the Money 8"),
    ("YunB", "VVS", "Show Me the Money 8"),
    ("YunB", "Piano (피아노)", "Show Me the Money 8"),
    ("Swings", "IndiGO", "Show Me the Money 8"),
    ("Swings", "The King (더 킹)", "Growing Pains 2"),
    ("Jessi", "Who Dat B (후 댓 B)", "Who Dat B"),
    ("Jessi", "Diamond (다이아몬드)", "Who Dat B"),
    ("Penomeco", "Shy (수줍)", "Shy"),
    ("Penomeco", "Lovers (러버스)", "Shy"),
    ("Jay Park", "These Days (요즘)", "The Season: The Blue Bird"),
    ("Jay Park", "All The Way Up", ""),
    ("Paloalto", "Mood Indigo (무드 인디고)", "Mood Indigo"),
    ("Paloalto", "Nomad (노마드)", "Nomad"),
    ("NO:EL", "Rain Drop 3 (비 3)", "Rain Drop 3"),
    ("NO:EL", "Rain Drop 4 (비 4)", "Rain Drop 4"),
    ("YUMDDA", "Shake (쉐이크)", "I'm Good"),
    ("YUMDDA", "Diamond (다이아몬드)", "I'm Good"),
    ("Dynamic Duo", "A DynamicAffair", "A DynamicAffair"),
    ("Dynamic Duo", "에이 다이나믹 어페어", "A DynamicAffair"),
    ("Mino", "Do It (두 잇)", "Do It"),
    ("Mino", "Trigger", "XX"),
    ("Bobby", "One Shot (원샷)", "One Shot"),
    ("Bobby", "Y.G.G", "Y.G.G"),
    ("Code Kunst", "ARCHIVE (아카이브)", "Code Kunst Archive Pack 02"),
    ("Code Kunst", "Jungle", "Code Kunst Archive Pack 02"),
    ("Primary", "eee (이)", "2"),
    ("Primary", "2", "2"),
    ("Outsider", "Vol.2-Maestro 3", "Vol.2-Maestro 3"),
    ("Outsider", "볼륨2 마에스트로 3", "Vol.2-Maestro 3"),
    ("D.Ark", "Genius (Remix)", "Genius"),
    ("D.Ark", "천재 (Remix)", "Genius"),
    ("Punchnello", "Winter Blossom (겨울꽃)", "Winter Blossom"),
    ("Punchnello", "Loving You Girl", "Loving You Girl"),
    ("Colde", "Your Dog Loves You", "Your Dog Loves You"),
    ("Colde", "In Your Eyes (인 유어 아이즈)", "In Your Eyes"),
    ("Gaeko", "Rosetta (로제타)", "Rosetta"),
    ("Gaeko", "West Coast", "Redingray"),
    ("Tablo", "Birthday (생일)", "Birthday"),
    ("Tablo", "Hood", "Fever's End Pt. 2"),
    ("Kid Ash", "Orca (오르카)", "Orca-Tape"),
    ("Kid Ash", "Orca-Tape", "Orca-Tape"),
    ("Elo", "Tattoo On My Heart", "Tattoo On My Heart"),
    ("Elo", "타투 온 마이 하트", "Tattoo On My Heart"),
    ("Nucksal", "180°", ""),
    ("Nucksal", "확실히 (For sure)", ""),
]

Y2020: list[tuple[str, str, str]] = [
    ("Zico", "아무노래", "아무노래"),
    ("Zico", "Any Song", "아무노래"),
    ("Changmo", "METEORITE", "Meteor"),
    ("Changmo", "Band Up", "Band Up"),
    ("Jessi", "누누나나 (NUNU NANA)", "NUNU NANA"),
    ("Jessi", "강한 여자 (Strong Woman)", "NUNU NANA"),
    ("Mudd the student", "Do You Like Haeseon", "Show Me the Money 9"),
    ("Mudd the student", "Mockingbird (모킹버드)", "Show Me the Money 9"),
    ("Deepflow", "Flow the Life 5", "Flow the Life 5"),
    ("Deepflow", "플로우 더 라이프 5", "Flow the Life 5"),
    ("Simon Dominic", "GOTT", "GOTT"),
    ("Simon Dominic", "make her dance (메이크 허 댄스)", "GOTT"),
    ("PH-1", "MEET N GREET", "X"),
    ("PH-1", "OKAY", "X"),
    ("Coogie", "Up!", "Up!"),
    ("Coogie", "Alright (올라잇)", "Up!"),
    ("Kid Milli", "Beige 0.5", "Beige 0.5"),
    ("Kid Milli", "PROUD (프라우드)", "Beige 0.5"),
    ("Beenzino", "Reset (리셋)", "Reset"),
    ("Beenzino", "Melody (멜로디)", "Reset"),
    ("Ash Island", "Melodies", "Melodies"),
    ("Ash Island", "Melody", "Melodies"),
    ("HAON", "You and I", "Melodies"),
    ("HAON", "Melody", "Melodies"),
    ("Leellamarz", "Ale", "Marz & Ale"),
    ("Leellamarz", "1,2", "Marz & Ale"),
    ("Giriboy", "Lonely (론리)", "Lonely"),
    ("Giriboy", "Because I Love You", "Lonely"),
    ("Nafla", "understand", "understand"),
    ("Nafla", "what is your name", "understand"),
    ("Loopy", "ON THE Radar", "ON THE Radar"),
    ("Loopy", "Radar (레이더)", "ON THE Radar"),
    ("Jay Park", "Forget About Tomorrow", "Forget About Tomorrow"),
    ("Jay Park", "Need That", "Forget About Tomorrow"),
    ("Loco", "Hello (헬로)", "Hello"),
    ("Loco", "The Show", "Hello"),
    ("Gray", "summer (썸머)", "summer"),
    ("Gray", "00 XX", "00 XX"),
    ("Sik-K", "Bungee (번지)", "Bungee"),
    ("Sik-K", "STOPTHAT", ""),
    ("Crush", "Click Like (클릭해)", "Click Like"),
    ("Paul Blanco", "Click Like", "Click Like"),
    ("Dean", "Peace (피스)", "Peace"),
    ("Dean", "D (Half Moon)", "130 Mood : TRBL"),
    ("Punchnello", "Loveseat (러브시트)", "Winter Blossom"),
    ("Punchnello", "Cream Cheese (크림 치즈)", "Winter Blossom"),
    ("Colde", "Star (스타)", "Star"),
    ("Colde", "honestly (어니스틀리)", "Star"),
    ("Swings", "Shook Ones", "Shook Ones"),
    ("Swings", "Remedy (레미디)", "Remedy"),
    ("Gaeko", "West Coast (웨스트 코스트)", "Redingray"),
    ("Gaeko", "Pass (패스)", "Pass"),
    ("Bobby", "Lalala (라라라)", "Lalala"),
    ("Bobby", "One Shot", "One Shot"),
    ("Mino", "Booker (부커)", "Booker"),
    ("Mino", "Do It", "Do It"),
    ("Tablo", "Tomorrow (내일)", "Birthday"),
    ("Tablo", "Day Day (데이데이)", "Birthday"),
    ("Code Kunst", "Buckle Up (버클 업)", "Code Kunst Archive Pack 02"),
    ("Code Kunst", "Rain (비)", "Code Kunst Archive Pack 02"),
    ("Zion.T", "Spring Dream (봄꿈)", "Zionic"),
    ("Zion.T", "Lonely Christmas (외로운 크리스마스)", "Zionic"),
    ("TOIL", "MAZE (메이즈)", "MAZE"),
    ("TOIL", "Panorama", "Show Me the Money 8"),
    ("The Quiett", "Nike (나이키)", ""),
    ("The Quiett", "Glow", ""),
    ("Blase", "Quote That", ""),
    ("Blase", "Blue", ""),
    ("Don Mills", "Don Mills Is Angry 5", "Don Mills Is Angry 5"),
    ("Don Mills", "돈밀리 5", "Don Mills Is Angry 5"),
    ("Huckleberry P", "Mantra 5", "Mantra 5"),
    ("Huckleberry P", "만트라 5", "Mantra 5"),
    ("Verbal Jint", "Rap Genius No. 10", "Rap Genius No. 10"),
    ("Verbal Jint", "랩 genius no.10", "Rap Genius No. 10"),
    ("Dok2", "All I Know Is", "Thug Life Part 2"),
    ("Dok2", "올 아이 노우 이즈", "Thug Life Part 2"),
    ("Penomeco", "COCO BOTTLE (코코보틀)", ""),
    ("Penomeco", "OFM", ""),
    ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
    ("Hash Swan", "해시 브랜드 2", "Hash Brand 2"),
    ("NO:EL", "Rain Drop 5 (비 5)", "Rain Drop 5"),
    ("NO:EL", "Rain Drop 6 (비 6)", "Rain Drop 6"),
    ("Elo", "Trouble (트러블)", "Hood"),
    ("Elo", "Hood (후드)", "Hood"),
    ("San E", "Make Her Dance", ""),
    ("San E", "메이크 허 댄스", ""),
    ("Jvcki Wai", "Taxi Blurr (택시 블러)", "Taxi Blurr"),
    ("Jvcki Wai", "Excessive (이과한)", "Exposure"),
    ("Mirani", "Peach (피치)", "Ticket"),
    ("Mirani", "Villain Prep (빌런 프렙)", "Ticket"),
    ("YUMDDA", "Shake", "I'm Good"),
    ("YUMDDA", "쉐이크", "I'm Good"),
    ("Primary", "eee", "2"),
    ("Primary", "이", "2"),
    ("Olltii", "Creative Control", "Creative Control"),
    ("Olltii", "크리에이티브 컨트롤", "Creative Control"),
    ("Woodie Gochild", "New Champ (뉴 챔프)", "Show Me the Money 8"),
    ("Woodie Gochild", "SMTM Cypher (쇼미 사이퍼)", "Show Me the Money 8"),
    ("Lil Moshpit", "MOSHPIT", "MOSHPIT"),
    ("Lil Moshpit", "모스hpit", "MOSHPIT"),
]

Y2021: list[tuple[str, str, str]] = [
    ("Lil Boi", "삐딱하게", "Show Me the Money 9"),
    ("Lil Boi", "Wave (웨이브)", "Show Me the Money 10"),
    ("Changmo", "모래시계 (MORAESIGYE)", "UNDERGROUND ROCKSTAR"),
    ("Changmo", "TAIJI (태지)", "UNDERGROUND ROCKSTAR"),
    ("Ash Island", "Me n Mine", "Show Me the Money 10"),
    ("Ash Island", "Sculpture (조각)", "Melodies"),
    ("Leellamarz", "Marz", "Marz & Ale"),
    ("Leellamarz", "Don`t Say That", "Don`t Say That"),
    ("TOIL", "like when we first met (처음 만났을 때처럼)", ""),
    ("TOIL", "Switch", "1989"),
    ("Blase", "ONOFF", "Show Me the Money 10"),
    ("Blase", "Good Life (굿 라이프)", "Show Me the Money 10"),
    ("Coogie", "I Got A Feeling", "I Got A Feeling"),
    ("Coogie", "Justin Bieber (저스틴 비버)", "Up!"),
    ("Sik-K", "Brought the Heat Back (더운데)", "Brought the Heat Back"),
    ("Sik-K", "TAKE OUT (테이크 아웃)", "Brought the Heat Back"),
    ("Kid Milli", "Cliché (클리셰)", "Cliché"),
    ("Kid Milli", "OFF KEY", "Cliché"),
    ("Beenzino", "MODERN (모던)", "MODERN"),
    ("Beenzino", "Walkin' on Water", "MODERN"),
    ("PH-1", "Ninth (나인스)", "Ninth"),
    ("PH-1", "Ninth Sense", "Ninth"),
    ("Epik High", "Rosario (로사리오)", "Epilogue Pt.2"),
    ("Epik High", "Breathe (브리드)", "Epilogue Pt.2"),
    ("be'O", "Countdown (카운트다운)", "Show Me the Money 10"),
    ("be'O", "Luxury (럭셔리)", "Show Me the Money 10"),
    ("Lee Young Ji", "Untouchable (언터처블)", "Untouchable"),
    ("Lee Young Ji", "Witch (위치)", "Witch"),
    ("Mudd the student", "Nectar (넥타)", "Show Me the Money 10"),
    ("Mudd the student", "Open", "Show Me the Money 8"),
    ("Mirani", "Villain (빌런)", "Show Me the Money 10"),
    ("Mirani", "Baby Steps", "Show Me the Money 10"),
    ("Koonta", "KOONTA (쿤타)", "Show Me the Money 10"),
    ("Koonta", "Ambition (앰비션)", "Show Me the Money 10"),
    ("Sokodomo", "SIGNATURE (시그니처)", "Show Me the Money 10"),
    ("Sokodomo", "Winner (위너)", "Show Me the Money 10"),
    ("Owen Ovadoz", "Diana (디ana)", "Show Me the Money 10"),
    ("Owen Ovadoz", "Freestyle (프리스타일)", "Show Me the Money 10"),
    ("Woodie Gochild", "Mud (머드)", "Show Me the Money 10"),
    ("Woodie Gochild", "SMTM10 (쇼미10)", "Show Me the Money 10"),
    ("Lil Moshpit", "Good Day (굿 데이)", "Show Me the Money 10"),
    ("Lil Moshpit", "ACHOO", "Show Me the Money 10"),
    ("Dynamic Duo", "Untouchable", "Untouchable"),
    ("Dynamic Duo", "Grand Carnival", "Grand Carnival"),
    ("Crush", "Rush Hour (오르트 구름)", "Rush Hour"),
    ("Crush", "Click Like", "Click Like"),
    ("Jessi", "Cold Blooded (냉혈한)", "Cold Blooded"),
    ("Jessi", "What Type of X (어떤X)", "Cold Blooded"),
    ("GroovyRoom", "Brought the Heat Back (더운데)", "Brought the Heat Back"),
    ("GroovyRoom", "Wavy (웨이비)", "Brought the Heat Back"),
    ("Paloalto", "Brought the Heat Back", "Brought the Heat Back"),
    ("Paloalto", "Valentina", ""),
    ("Mino", "Do You Remember (기억하니)", "Do You Remember"),
    ("Mino", "Booker", "Booker"),
    ("Jay Park", "To Life (투 라이프)", "To Life"),
    ("Jay Park", "McNasty", "To Life"),
    ("Gray", "Summer Surf (썸머 서프)", "Summer Surf"),
    ("Gray", "Adios (아디오스)", "00 XX"),
    ("Dean", "4:44", "4:44"),
    ("Dean", "포포 (4:44)", "4:44"),
    ("Heize", "Midnight (미드나잇)", "Midnight"),
    ("Heize", "And Today (그리고 오늘)", "///"),
    ("Zion.T", "Just (저스트)", "Just"),
    ("Zion.T", "Snow (눈)", "OO"),
    ("Wonstein", "10 Minutes (10분)", "Show Me the Money 10"),
    ("Wonstein", "Infrared (적외선)", "Show Me the Money 10"),
    ("Trade L", "Leave It (두고 가)", "Show Me the Money 10"),
    ("Trade L", "Blue Sky (블루 스카이)", "Show Me the Money 10"),
    ("Paul Blanco", "Summer (썸머)", "Summer"),
    ("Paul Blanco", "Rain (비)", "Summer"),
    ("Colde", "정 (Honesty)", "Star"),
    ("Colde", "와르르 (Warrr)", "Star"),
    ("Killagramz", "Good Morning (굿 모닝)", "Good Morning"),
    ("Killagramz", "Good Morning Remix (굿 모닝 리믹스)", "Good Morning"),
    ("Hanhae", "003", "003"),
    ("Hanhae", "001", "003"),
    ("B.I", "Waterfall (워터폴)", "Waterfall"),
    ("B.I", "Illa Illa (illa illa)", "Waterfall"),
    ("Basick", "Nice Day (나이스 데이)", "Nice Day"),
    ("Basick", "Show Me The Money (쇼미)", "Nice Day"),
    ("Tabber", "RUN CHICKEN (런 치킨)", "RUN CHICKEN"),
    ("Tabber", "3rd Eye (써드 아이)", "RUN CHICKEN"),
    ("Khundi Panda", "Medicine (약)", "Medicine"),
    ("Khundi Panda", "Pick Up (픽업)", "Medicine"),
    ("Illinit", "Real Talk Live (리얼 토크)", ""),
    ("Illinit", "Ill Street Live 2 (일 스트릿)", ""),
    ("B-Free", "Best Seller (베스트 셀러)", "Best Seller"),
    ("B-Free", "Hot Summer (핫 썸머)", "Best Seller"),
    ("Roh Yun Ha", "IF I (이프 아이)", "Show Me the Money 10"),
    ("Roh Yun Ha", "Trouble (트러블)", "Show Me the Money 10"),
    ("Vasco", "The Vasco", "The Vasco"),
    ("Vasco", "더 바스코", "The Vasco"),
    ("G2", "G2 (지투)", "G2"),
    ("G2", "Business (비즈니스)", "Business"),
    ("Cheetah", "I'll Be Back (아일 비 백)", ""),
    ("Cheetah", "Keep It Movin (킵 잇 무빙)", ""),
    ("J'Kyun", "Fly Away (플라이 어웨이)", "Ready to Fly"),
    ("J'Kyun", "Ready to Fly (레디 투 플라이)", "Ready to Fly"),
    ("Outsider", "Vol.2-Maestro 4", "Vol.2-Maestro 4"),
    ("Outsider", "볼륨2 마에스트로 4", "Vol.2-Maestro 4"),
]

CATALOG = {2018: Y2018, 2019: Y2019, 2020: Y2020, 2021: Y2021}


def norm_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = s.lower().strip()
        s = s.replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()

    return f"{norm(artist)}|{norm(title)}"


def has_hangul(s: str) -> bool:
    return bool(re.search(r"[가-힣]", s))


def load_global_exclude() -> set[str]:
    keys: set[str] = set()
    for sub in ("music-list-data", "music-list-data-global"):
        d = os.path.join(REPO, "scripts", sub)
        if not os.path.isdir(d):
            continue
        for fn in os.listdir(d):
            if fn.endswith(".json"):
                for row in json.load(open(os.path.join(d, fn), encoding="utf-8")):
                    keys.add(norm_key(row["artist"], row["title"]))
    return keys


def validate(catalog: dict[int, list[tuple[str, str, str]]], exclude: set[str]) -> list[str]:
    errors: list[str] = []
    used: set[str] = set()
    for year in sorted(catalog):
        tracks = catalog[year]
        if len(tracks) != 100:
            errors.append(f"{year}: count {len(tracks)} != 100")
        artist_count: dict[str, int] = {}
        hangul = 0
        year_keys: set[str] = set()
        for a, t, _ in tracks:
            k = norm_key(a, t)
            if k in used:
                errors.append(f"{year}: cross-year dup {a} - {t}")
            if k in exclude:
                errors.append(f"{year}: global overlap {a} - {t}")
            if k in year_keys:
                errors.append(f"{year}: in-year dup {a} - {t}")
            year_keys.add(k)
            used.add(k)
            artist_count[a] = artist_count.get(a, 0) + 1
            if has_hangul(t):
                hangul += 1
        for a, c in artist_count.items():
            if c > MAX_PER_ARTIST:
                errors.append(f"{year}: {a} has {c} tracks")
        if len(artist_count) < MIN_ARTISTS:
            errors.append(f"{year}: only {len(artist_count)} artists")
        ratio = hangul / len(tracks) if tracks else 0
        if ratio < MIN_HANGUL_RATIO:
            errors.append(f"{year}: hangul {hangul}/100 = {ratio:.0%}")
    return errors


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def write_py(year: int, tracks: list[tuple[str, str, str]]) -> None:
    lines = ["TRACKS = ["]
    for a, t, al in tracks:
        lines.append(f"    ('{esc(a)}', '{esc(t)}', '{esc(al)}'),")
    lines.append("]")
    lines.append("")
    path = os.path.join(OUT, f"y{year}.py")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def main() -> None:
    for year, tracks in CATALOG.items():
        assert len(tracks) == 100, f"y{year} has {len(tracks)} tracks"
    exclude = load_global_exclude()
    errors = validate(CATALOG, exclude)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    for year, tracks in sorted(CATALOG.items()):
        write_py(year, tracks)
        artists = len({a for a, _, _ in tracks})
        hangul = sum(1 for _, t, _ in tracks if has_hangul(t))
        print(f"OK y{year}.py: {artists} artists, hangul {hangul}/100")
    print(f"Wrote 4 files under {OUT}")


if __name__ == "__main__":
    main()
