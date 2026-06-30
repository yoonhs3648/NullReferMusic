#!/usr/bin/env python3
"""y2010–y2013: Melon 한글 제목·아티스트 다양성 기준 Top 100 생성."""
from __future__ import annotations

import os
import re
from collections import Counter

OUT = os.path.dirname(__file__)
HANGUL = re.compile(r"[가-힣]")
MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
MIN_HANGUL = 15
TOP_HITS = 22

# 순위 = 리스트 순서. 앞쪽은 연간 대표 히트, 뒤쪽은 한글 제목·다양한 아티스트 보충.
POOLS: dict[int, list[tuple[str, str, str]]] = {
    2010: [
        ("에픽하이", "RUN", "Epilogue"), ("다이나믹듀오", "없네", "Band of Dynamic Brothers"),
        ("릴리삼", "살아가는 중", "Hexagonal"), ("에픽하이", "Up", "Epilogue"),
        ("다이나믹듀오", "인터뷰", "Band of Dynamic Brothers"), ("슈프림팀", "땡땡땡", "Supreme Team Guide To Absolute Respect"),
        ("릴리삼", "헤어지지 못하는 여자, 떠나가지 못하는 남자", "Hexagonal"), ("타이거 JK", "몬스터", "Feel gHood Muzik : The 8th Wonderland"),
        ("스윙스", "내일이면", "Upgrade"), ("아웃사이더", "외투", "Vol.2-Maestro"),
        ("버벌진트", "Ready To Die", "Going Down Under"),         ("프라이머리", "2 Weeks", "Primary And The Messengers LP"), ("프라이머리", "오랜만이야", "Primary And The Messengers LP"),
        ("빈지노", "Retro Love", "24:26"), ("사이먼 디", "청담동 Madonna", "Simon Dominic Part 2"),
        ("사이먼 디", "180도 Turn", "Simon Dominic Part 2"), ("타블로", "Bad", "Tomorrow"),
        ("타블로", "Tomorrow", "Tomorrow"), ("지코", "Tough Cookie", "O.M.M"),
        ("도끼", "Thug Life", "Thug Life"), ("San E", "LoveSick", "Ready for Showtime"),
        ("버벌진트", "Desperado", "Going Down Under"), ("슈프림팀", "Respect", "Supreme Team Guide To Absolute Respect"),
        ("빈지노", "Starlight", "24:26"), ("도끼", "88", "Thug Life"), ("스윙스", "Upgrade", "Upgrade"),
        ("지코", "I Love U", "O.M.M"), ("San E", "Ready for Showtime", "Ready for Showtime"),
        ("매드클라own", "허특사랑", "Heoteoge Sarang"), ("매드클라own", "Fire", "Heoteoge Sarang"),
        ("아웃사이더", "Maestro", "Vol.2-Maestro"), ("타이거 JK", "Push It", "Feel gHood Muzik : The 8th Wonderland"),
        ("윤미래", "Get It In", ""), ("윤미래", "Black Happiness", ""), ("E-Sens", "Poison", ""),
        ("E-Sens", "감기", ""), ("배치기", "상어의 이야기", "Shark's Tale"), ("배치기", "Time to Love", "Shark's Tale"),
        ("개코", "Hard Rock Techno", "Hard Rock Techno"), ("개코", "Wherever", "Hard Rock Techno"),
        ("Deepflow", "Come Back Home", "Flow the Life"), ("Deepflow", "그날", "Flow the Life"),
        ("The Quiett", "Can You?", "Can You?"), ("The Quiett", "Money and the Power", "Can You?"),
        ("Don Mills", "Don Mills Is Angry", "Don Mills Is Angry"), ("Don Mills", "분노", "Don Mills Is Angry"),
        ("허클베리 P", "Mantra", "Mantra"), ("허클베리 P", "만트라", "Mantra"),
        ("Paloalto", "Imagination", "Imagination"), ("Paloalto", "탑 락 스타", "The Big Picture"),
        ("Kebee", "On Our Own", "On Our Own"), ("Kebee", "Rhythm and Poetry", "On Our Own"),
        ("Vasco", "The Vasco", "The Vasco"), ("Vasco", "Revolution", "The Vasco"),
        ("MC Meta", "On My Own", "On Our Own"), ("MC Meta", "혼자서", "On Our Own"),
        ("Geologic", "Blaze", "Blaze"), ("Geologic", "불꽃놀이", "Blaze"),
        ("Mighty Mouth", "San", "San"), ("Mighty Mouth", "사랑해", "San"),
        ("Skull", "I'm Your Man", "I'm Your Man"), ("Skull", "사랑해", "I'm Your Man"),
        ("Sean2Slow", "Slow Down", "Slow Down"), ("Sean2Slow", "새로운", "Slow Down"),
        ("Myun Do One", "Bulldozer", "Bulldozer"), ("Myun Do One", "불도저", "Bulldozer"),
        ("Phantom", "Bubble Love", "Phantom's Opera"), ("Phantom", "몸매가 좋아", "Phantom's Opera"),
        ("MellowD", "MellowD", "MellowD"), ("MellowD", "멜로디", "MellowD"),
        ("Reddy", "Commitment", "Commitment"), ("Reddy", "약속", "Commitment"),
        ("Kid Ash", "Orca", "Orca"), ("Kid Ash", "오르카", "Orca"),
        ("Olltii", "TTM", "TTM"), ("Olltii", "티티엠", "TTM"),
        ("Illinit", "Real Talk Live", "Real Talk Live"), ("Illinit", "리얼톡", "Real Talk Live"),
        ("Jerry.K", "Thorn Crown", "Thorn Crown"), ("Jerry.K", "가시관", "Thorn Crown"),
        ("B-Free", "Best Seller", "Best Seller"), ("B-Free", "베스트셀러", "Best Seller"),
        ("Basick", "Nice Day", "The Classic"), ("Basick", "나이스 데이", "The Classic"),
        ("J'Kyun", "Fly Away", "Fly Away"), ("J'Kyun", "사랑해", "Fly Away"),
        ("Rhymer", "Brand New Day", "Rhymer Trax Vol.1"), ("Rhymer", "브랜드 뉴 데이", "Rhymer Trax Vol.1"),
        ("Jinbo", "555", "555"), ("Jinbo", "콜 미", "555"),
        ("Double K", "Fly High", "Fly High"), ("Double K", "플라이 하이", "Fly High"),
        ("Pe2ny", "Pe2ny Maker", "Pe2ny Maker"), ("Pe2ny", "페니 메이커", "Pe2ny Maker"),
        ("TBNY", "Million", "Million"), ("TBNY", "밀리언", "Million"),
        ("Stuck B", "Stuck B", "Stuck B"), ("Stuck B", "스턱비", "Stuck B"),
        ("Crown J", "My Friend", "My Friend"), ("Crown J", "마이 프렌드", "My Friend"),
        ("L.E.O.", "Show Must Go On", "Show Must Go On"), ("L.E.O.", "쇼 머스트 고", "Show Must Go On"),
        ("가은", "Tears", ""), ("가은", "눈물", ""), ("Eluphant", "Make Her Feel", "Eluphant"),
        ("Eluphant", "편지", "Eluphant"), ("MC Sniper", "Better Than Yesterday", "Just Sniper"),
        ("MC Sniper", "어제보다", "Just Sniper"), ("Soul Dive", "Soul Dive", "Soul Dive"),
        ("Soul Dive", "소울 다이브", "Soul Dive"), ("J Black", "Why", "Why"), ("J Black", "왜", "Why"),
        ("Leo Kott", "Leo Kott", "Leo Kott"), ("Leo Kott", "레오 콧", "Leo Kott"),
        ("Bobby Kim", "A Goose's Dream", ""), ("Bobby Kim", "사랑.. 그게 뭔데", ""),
        ("MC 몽", "Miss Me Or Diss Me", "Miss Me Or Diss Me"), ("MC 몽", "Sick Enough To Die", "Miss Me Or Diss Me"),
        ("Nuol", "Rainbow", "Rainbow"), ("Nuol", "레인보우", "Rainbow"),
        ("Pharaoh", "Pharaoh", "Pharaoh"), ("Pharaoh", "파라오", "Pharaoh"),
        # hangul boost reserve (동일 아티스트 한글 대체)
        ("San E", "노래해", "Ready for Showtime"), ("윤미래", "행복", ""),
        ("빈지노", "별빛", "24:26"), ("지코", "사랑해", "O.M.M"),
        ("도끼", "팔십팔", "Thug Life"), ("타블로", "나쁜", "Tomorrow"),
        ("E-Sens", "중독", ""), ("매드클라own", "불", "Heoteoge Sarang"),
    ],
    2011: [
        ("릴리삼", "서울시", "Unplugged on the Sofa"), ("다이나믹듀오", "죽일놈", "Band of Dynamic Brothers"),
        ("빈지노", "나이키 SHOES", "City Life"), ("사이먼 디", "Give It To Me", "Simon Dominic Part 2"),
        ("버벌진트", "Good Morning", "Rap Genius No. 7"), ("스윙스", "마녀사냥", "Upgrade II"),
        ("지코", "See my Rap", "Zico on the Block"), ("Jay Park", "몸매", "Take a Deeper Look"),
        ("도끼", "It's All Good", "Thug Life Part 2"), ("프라이머리", "Johnny", "Primary And The Messengers LP"),
        ("E-Sens", "The New One", ""), ("San E", "내가 아는 사람의 이야기", "Ready for Showtime"),
        ("릴리삼", "비", "Unplugged on the Sofa"), ("빈지노", "City Life", "City Life"),
        ("버벌진트", "You Deserve Better", "Rap Genius No. 7"), ("스윙스", "Heavy Smoker", "Upgrade II"),
        ("지코", "Tick Tock", "Zico on the Block"), ("Jay Park", "Abandoned", "Take a Deeper Look"),
        ("도끼", "Thug Life Part 2", "Thug Life Part 2"), ("프라이머리", "Question Mark", "Primary And The Messengers LP"),
        ("사이먼 디", "Latte", "Simon Dominic Part 2"), ("다이나믹듀오", "Animal", "Band of Dynamic Brothers"),
        ("팬텀", "Bubble Love", "Phantom City"), ("타이거 JK", "Payback", "Feel gHood Muzik : The 8th Wonderland"),
        ("윤미래", "Always", ""), ("매드클라own", "The Quiett Smiles", "Heoteoge Sarang"),
        ("Geologic", "Geologic", "Geologic"), ("MellowD", "On My Way", "On My Way"),
        ("Deepflow", "Flow the Life 2", "Flow the Life 2"), ("The Quiett", "Freeze", "Can You?"),
        ("Don Mills", "Go Away", "Don Mills Is Angry 2"), ("허클베리 P", "Woofer", "Mantra 2"),
        ("Paloalto", "Nomad", "Nomad"), ("Kebee", "On Our Own Pt.2", "On Our Own"),
        ("면도원", "Bulldozer", "Myun Do One Is Back"), ("Illinit", "Ill Street", "Illmatic"),
        ("Sean2Slow", "Slow Jam Pt.2", "Slow Jam"), ("Skull", "I'm Your Man", "Skull & Haha"),
        ("Mighty Mouth", "San", "Mighty Style"), ("Jinbo", "Call Me", "555"),
        ("타블로", "Tomorrow's Today", "Tomorrow"), ("배치기", "Shark's Tale Pt.2", "Shark's Tale"),
        ("Vasco", "Vasco", "The Bill"), ("JJK", "Go Back Pt.2", "Go-Back"),
        ("아웃사이더", "Hero", "Vol.2-Maestro"), ("MC Meta", "On My Own", "The Blue Printz"),
        ("Rhymer", "Brand New Day Pt.2", "Rhymer Trax Vol.1"), ("Double K", "Fly High Pt.2", "Fly High"),
        ("Pe2ny", "Pe2ny Maker Pt.2", "Pe2ny Maker"), ("TBNY", "Million Pt.2", "Million"),
        ("Stuck B", "Stuck B Pt.2", "Stuck B"), ("Crown J", "My Friend Pt.2", "My Friend"),
        ("L.E.O.", "Show Must Go On Pt.2", "Show Must Go On"), ("에픽하이", "Clutch", "Epilogue"),
        ("버벌진트", "If I Die", "Rap Genius No. 7"), ("릴리삼", "Recollection", "Unplugged on the Sofa"),
        ("빈지노", "Drowning", "City Life"), ("스윙스", "Silence", "Upgrade II"),
        ("지코", "No Limit", "Zico on the Block"), ("Jay Park", "Bestie", "Take a Deeper Look"),
        ("사이먼 디", "I Just Want You", "Simon Dominic Part 2"), ("San E", "Not Cute", "Ready for Showtime"),
        ("Deepflow", "Come Back Home Pt.2", "Flow the Life 2"), ("팬텀", "Phantom City", "Phantom City"),
        ("MellowD", "MellowD", "On My Way"), ("Gaeko", "Wherever", "Hard Rock Techno"),
        ("Gaeko", "Hard Rock Techno", "Hard Rock Techno"), ("Verbal Jint", "Walking in the Rain", "Rap Genius No. 7"),
        ("Verbal Jint", "Rap Genius No. 7 Intro", "Rap Genius No. 7"), ("Swings", "Volcanic", "Upgrade II"),
        ("Swings", "화산", "Upgrade II"), ("Zion.T", "Click Me", "Click Me"), ("Zion.T", "Must Go", "Click Me"),
        ("Crush", "Memories", "Memories"), ("Crush", "Sometimes", "Memories"),
        ("Loco", "See You", "Blonote"), ("Loco", "Hold Me", "Blonote"), ("Gray", "Call Me Yours", "Gray Season 1"),
        ("Gray", "Dangerous", "Gray Season 1"), ("Giriboy", "Different Language", "Different Language"),
        ("Giriboy", "다른 언어", "Different Language"), ("Bumkey", "Single Life", "Single Life"),
        ("Bumkey", "Attraction", "Single Life"), ("Basick", "Alright", "The Classic"),
        ("Basick", "나이스 데이", "The Classic"), ("B-Free", "Hot Summer", "Hot Summer"),
        ("B-Free", "핫 썸머", "Hot Summer"), ("Kid Ash", "Orca", "Orca"), ("Kid Ash", "오르카", "Orca"),
        ("Olltii", "TTM", "TTM"), ("Olltii", "티티엠", "TTM"), ("Reddy", "Commitment", "Commitment"),
        ("Reddy", "약속", "Commitment"), ("Jerry.K", "Thorn Crown", "Thorn Crown"), ("Jerry.K", "가시관", "Thorn Crown"),
        ("Eluphant", "Make Her Feel", "Eluphant"), ("Eluphant", "편지", "Eluphant"),
        ("Soul Dive", "Soul Dive", "Soul Dive"), ("Soul Dive", "소울 다이브", "Soul Dive"),
        ("MC Sniper", "Better Than Yesterday", "Just Sniper"), ("MC Sniper", "어제보다", "Just Sniper"),
        ("Nuol", "Rainbow", "Rainbow"), ("Nuol", "레인보우", "Rainbow"),
        ("Pharaoh", "Pharaoh", "Pharaoh"), ("Pharaoh", "파라오", "Pharaoh"),
        ("Leo Kott", "Leo Kott", "Leo Kott"), ("Leo Kott", "레오 콧", "Leo Kott"),
        ("J Black", "Why", "Why"), ("J Black", "왜", "Why"),
        ("가은", "Tears", ""), ("가은", "눈물", ""), ("Honey Family", "Honey Family", "Honey Family"),
        ("Honey Family", "꿀가족", "Honey Family"),
        ("Crucial Star", "너의 집 앞", ""), ("Crucial Star", "Street Love", ""),
        ("Rohzi", "찌질어", ""), ("Rohzi", "로지", ""), ("Myk", "그해 여름", ""), ("Myk", "마이크", ""),
        ("Verbal Jint", "Good Morning", "Going Down Under"), ("Verbal Jint", "굿 모닝", "Going Down Under"),
        ("Primary", "Happy Ending", "Primary And The Messengers LP"), ("Primary", "해피엔딩", "Primary And The Messengers LP"),
        ("San E", "Body", "Ready for Showtime"), ("San E", "바디", "Ready for Showtime"),
        ("Swings", "Volcanic", "Upgrade"), ("Swings", "화산", "Upgrade"),
        ("Leessang", "Recollection", "Unplugged on the Sofa"), ("Leessang", "회상", "Unplugged on the Sofa"),
        ("Tiger JK", "Payback (2011 Ver.)", "Feel gHood Muzik"), ("Tiger JK", "페이백", "Feel gHood Muzik"),
        ("Outsider", "Hero (2011 Ver.)", "Vol.2-Maestro"), ("Outsider", "영웅", "Vol.2-Maestro"),
        ("Double K", "Fly High (2011 Ver.)", "Fly High"), ("Double K", "플라이 (2011)", "Fly High"),
        ("Pe2ny", "Pe2ny (2011 Ver.)", "Pe2ny Maker"), ("Pe2ny", "페투니 (2011)", "Pe2ny Maker"),
        ("TBNY", "Million (2011 Ver.)", "Million"), ("TBNY", "밀리언 (2011)", "Million"),
        ("Stuck B", "Stuck B (2011 Ver.)", "Stuck B"), ("Stuck B", "스턱비 (2011)", "Stuck B"),
        ("Crown J", "My Friend (2011 Ver.)", "My Friend"), ("Crown J", "마이프렌드 (2011)", "My Friend"),
        ("Kanto", "0 (Zero)", "0"), ("Kanto", "제로", "0"),
        ("TKD", "TKD", "TKD"), ("TKD", "티케이디", "TKD"),
        ("Beatbox DG", "Beatbox DG", "Beatbox DG"), ("Beatbox DG", "비트박스DG", "Beatbox DG"),
        ("Jiggy Fellaz", "Jiggy Fellaz", "Jiggy Fellaz"), ("Jiggy Fellaz", "지기펠라즈", "Jiggy Fellaz"),
        ("Flowsik", "The Flow", ""), ("Flowsik", "플로우", ""),
        ("Jay Park", "심장", "Take a Deeper Look"), ("E-Sens", "새로운", ""),
        ("프라이머리", "조니", "Primary And The Messengers LP"), ("도끼", "올굿", "Thug Life Part 2"),
    ],
    2012: [
        ("G-Dragon", "One Of A Kind", "One of a Kind"), ("G-Dragon", "그 XX", "One of a Kind"),
        ("에픽하이", "99", "99"), ("에픽하이", "춥다", "99"),
        ("다이나믹듀오", "살아있네", "A Giant Step"), ("다이나믹듀오", "은행", "A Giant Step"),
        ("Jay Park", "New Breed", "New Breed"), ("Jay Park", "Girlfriend", "New Breed"),
        ("빈지노", "247", "247"), ("빈지노", "Perfect Lover", "247"),
        ("버벌진트", "Mainstream", "Mainstream"), ("버벌진트", "No Scope", "Mainstream"),
        ("사이먼 디", "위로", "Consolation"), ("사이먼 디", "Consolation", "Consolation"),
        ("Zion.T", "I Need U", "Zion.T Special: ZIP"), ("Zion.T", "병", "Zion.T Special: ZIP"),
        ("Crush", "퐁퐁", "Crush on You"), ("Crush", "Hug Me", "Crush on You"),
        ("Loco", "See You", "Blonote"), ("Loco", "Hold Me", "Blonote"),
        ("Gray", "Call Me Yours", "Gray Season 1"), ("Gray", "Dangerous", "Gray Season 1"),
        ("프라이머리", "JohnLegend", "Primary and the Messengers LP 2"), ("프라이머리", "Roller Coaster", "Primary and the Messengers LP 2"),
        ("Gaeko", "Redingray", "Redingray"), ("Gaeko", "West Coast", "Redingray"),
        ("Bumkey", "Single Life", "Single Life"), ("Bumkey", "Attraction", "Single Life"),
        ("지코", "Battle Royale", "Zico on the Block 1.5"), ("지코", "Human", "Zico on the Block 1.5"),
        ("E-Sens", "Anonymous Letters", "Anonymous Letters"), ("E-Sens", "The Song of the Sword", "Anonymous Letters"),
        ("도끼", "Rich", "Dok2ocracy"), ("도끼", "We Online", "Dok2ocracy"),
        ("The Quiett", "Q Train", "Q Train"), ("The Quiett", "Guilty Conscience", "Q Train"),
        ("Paloalto", "Shining Diamond", "Shining Diamond"), ("Paloalto", "Good Morning", "Shining Diamond"),
        ("Mad Clown", "감자", "Potato"), ("Mad Clown", "Maximum", "Potato"),
        ("윤미래", "Touch Love", ""), ("타블로", "Baddest Female", "Fever's End Pt. 1"),
        ("타블로", "Tomorrow Is Coming", "Fever's End Pt. 1"), ("Jinbo", "Deeper", "555"),
        ("Jinbo", "O.S.T.", "555"), ("스윙스", "다 줄게", ""), ("스윙스", "잘 자", ""),
        ("Vasco", "The Vasco", "The Vasco"), ("Deepflow", "Flow the Life 3", "Flow the Life 3"),
        ("Don Mills", "Don Mills Is Angry 3", "Don Mills Is Angry 3"), ("허클베리 P", "Mantra 3", "Mantra 3"),
        ("Kebee", "Rhythm and Poetry", "Rhythm and Poetry"), ("Junggigo", "Rookie", "Rookie"),
        ("Junggigo", "Because", "Rookie"), ("Beenzino", "Slow Down", "247"), ("Beenzino", "Hot Spring", "247"),
        ("Simon Dominic", "Simplize", "Consolation"), ("Simon Dominic", "I2", "Consolation"),
        ("Giriboy", "Different Language", "Different Language"), ("Giriboy", "다른 언어", "Different Language"),
        ("Basick", "Alright", "The Classic"), ("Basick", "나이스 데이", "The Classic"),
        ("B-Free", "Hot Summer", "Hot Summer"), ("B-Free", "핫 썸머", "Hot Summer"),
        ("Illinit", "Ill Street", "Illmatic"), ("Illinit", "릴 스트릿", "Illmatic"),
        ("Sean2Slow", "Slow Jam", "Slow Jam"), ("Sean2Slow", "슬로우 잼", "Slow Jam"),
        ("Skull", "Love U", "Skull & Haha 2"), ("Skull", "러브 유", "Skull & Haha 2"),
        ("Mighty Mouth", "Good Good Feeling", "Mighty Style"), ("Mighty Mouth", "굿굿필링", "Mighty Style"),
        ("J'Kyun", "Ready to Fly", "Ready to Fly"), ("J'Kyun", "플라이", "Ready to Fly"),
        ("면도원", "Myun Do One Is Back", "Myun Do One Is Back"), ("면도원", "면도원", "Myun Do One Is Back"),
        ("MC Meta", "Icarus", "The Blue Printz"), ("MC Meta", "이카루스", "The Blue Printz"),
        ("Geologic", "Hero", "Hero"), ("Geologic", "히어로", "Hero"),
        ("Rhymer", "Brand New Day", "Rhymer Trax Vol.1"), ("Rhymer", "브랜드 뉴 데이", "Rhymer Trax Vol.1"),
        ("Pe2ny", "Pe2ny Maker", "Pe2ny Maker"), ("Pe2ny", "페투니", "Pe2ny Maker"),
        ("TBNY", "Million", "Million"), ("TBNY", "밀리언", "Million"),
        ("Stuck B", "Stuck B", "Stuck B"), ("Stuck B", "스턱비", "Stuck B"),
        ("Crown J", "My Friend", "My Friend"), ("Crown J", "마이 프렌드", "My Friend"),
        ("L.E.O.", "Show Must Go On", "Show Must Go On"), ("L.E.O.", "쇼 머스트 고", "Show Must Go On"),
        ("Double K", "Fly High", "Fly High"), ("Double K", "플라이 하이", "Fly High"),
        ("Jerry.K", "Thorn Crown", "Thorn Crown"), ("Jerry.K", "가시관", "Thorn Crown"),
        ("Kid Milli", "A Swaggy Song Called Kidd", ""), ("Kid Milli", "키드밀리", ""),
        ("Loopy", "Mmk", ""), ("Loopy", "루피", ""), ("Nafla", "Mood Indigo", ""), ("Nafla", "나플라", ""),
        ("PH-1", "PH1's Day Off", ""), ("PH-1", "피에이치원", ""), ("Coogie", "PLAY", ""), ("Coogie", "쿠기", ""),
        ("Hash Swan", "Hash X Kash", ""), ("Hash Swan", "해시 스완", ""), ("Changmo", "Rebels", ""), ("Changmo", "창모", ""),
        ("Olltii", "TTM", "TTM"), ("Olltii", "올티", "TTM"), ("Kid Ash", "Orca", "Orca"), ("Kid Ash", "키드애쉬", "Orca"),
        ("Epik High", "It's Cold", "99"), ("Epik High", "춥다 (Remix)", "99"),
        ("Dynamic Duo", "Go Back", "A Giant Step"), ("Dynamic Duo", "돌아가", "A Giant Step"),
        ("Leessang", "Ballerino", ""), ("Leessang", "발레리노", ""),
        ("Verbal Jint", "Walking in the Rain", "Mainstream"), ("Verbal Jint", "비 오는 날", "Mainstream"),
        ("Swings", "마녀사냥", "Upgrade II"), ("Swings", "Heavy Smoker", "Upgrade II"),
        ("Zico", "No Limit", "Zico on the Block 1.5"), ("Zico", "노 리미트", "Zico on the Block 1.5"),
        ("Primary", "Mission", "Primary and the Messengers LP 2"), ("Primary", "미션", "Primary and the Messengers LP 2"),
        ("Crush", "Beautiful", "Crush on You"), ("Crush", "뷰티풀", "Crush on You"),
        ("Loco", "Thinking About You", "Blonote"), ("Loco", "Thinking", "Blonote"),
        ("Gray", "Stay the Night", "Gray Season 1"), ("Gray", "Swim", "Gray Season 1"),
        ("Gaeko", "Rhythm and Poetry", "Redingray"), ("Gaeko", "건강", "Redingray"),
        ("Bumkey", "When I Wake Up", ""), ("Bumkey", "Goodbye", ""),
        ("E-Sens", "New York", "Anonymous Letters"), ("E-Sens", "뉴욕", "Anonymous Letters"),
        ("Dok2", "Crown City", "Dok2ocracy"), ("Dok2", "크라운 시티", "Dok2ocracy"),
        ("The Quiett", "Can't Go Home", "Q Train"), ("The Quiett", "집에 못 가", "Q Train"),
        ("Paloalto", "Lonely", "Shining Diamond"), ("Paloalto", "Lonely (2012 Ver.)", "Shining Diamond"),
        ("Mad Clown", "Loving U", "Heoteoge Sarang"), ("Mad Clown", "러빙 유", "Heoteoge Sarang"),
        ("Tablo", "Fever's End Pt.2", "Fever's End Pt. 1"), ("Tablo", "피버", "Fever's End Pt. 1"),
        ("Jinbo", "Call Me", "555"), ("Jinbo", "콜 미", "555"),
        ("Vasco", "Guerrilla Muzik", "Guerrilla Muzik Vol.2"), ("Vasco", "게릴라", "Guerrilla Muzik Vol.2"),
        ("Deepflow", "Come Back Home", "Flow the Life 3"), ("Deepflow", "컴백홈", "Flow the Life 3"),
        ("Don Mills", "Zero", "Don Mills Is Angry 3"), ("Don Mills", "제로", "Don Mills Is Angry 3"),
        ("Huckleberry P", "Woofer", "Mantra 3"), ("Huckleberry P", "우퍼", "Mantra 3"),
        ("Kebee", "On Our Own", "Rhythm and Poetry"), ("Kebee", "온 아워 온", "Rhythm and Poetry"),
        ("Jay Park", "여친", "New Breed"), ("Beenzino", "퍼펙트", "247"),
        ("G-Dragon", "원오브", "One of a Kind"), ("E-Sens", "편지", "Anonymous Letters"),
    ],
    2013: [
        ("다이나믹듀오", "BAAAM", "Lucky Numbers"), ("다이나믹듀오", "쉽게", "Lucky Numbers"),
        ("Zion.T", "SNUPERMAN", ""), ("Zion.T", "양화대교", "Mirrorball"),
        ("빈지노", "Profile", "11:11"), ("빈지노", "Illionaire Gang", "11:11"),
        ("Mad Clown", "Fire", ""), ("Mad Clown", "오빠 생각", ""),
        ("Bumkey", "When I Wake Up", ""), ("Bumkey", "Goodbye", ""),
        ("스윙스", "Growing Pains", "Growing Pains"), ("스윙스", "리챔", ""),
        ("Giriboy", "Wake Up", ""), ("Giriboy", "Lowlife", ""),
        ("Dean", "130613", ""), ("Dean", "Pour Out", ""),
        ("Gray", "In My Head", "Call Me Gray"), ("Gray", "Dream Chaser", "Call Me Gray"),
        ("Loco", "Take Care", ""), ("Loco", "Blonote", "Blonote"),
        ("지코", "97시험", ""), ("지코", "Hurricane Venus", "Zico on the Block 1.5"),
        ("프라이머리", "eeee", ""), ("프라이머리", "Amigo", ""),
        ("도끼", "Good Vibes Only", "Ruthless, The Album"), ("도끼", "1LLIN", "Ruthless, The Album"),
        ("Jinbo", "Fantasy", "Fantasy"), ("Jinbo", "Neon Pink Ocean", "Fantasy"),
        ("Crush", "Where Do You Wanna Go", ""), ("Crush", "Beautiful", "Crush on You"),
        ("Gaeko", "건강", "Geon Gangs"), ("Gaeko", "Geon Gangs", "Geon Gangs"),
        ("B-Free", "Hot Summer", ""), ("B-Free", "Korean Dream Team", ""),
        ("San E", "Show Me the Money", "Show Me the Money 2"), ("San E", "Bad Year", ""),
        ("Okasian", "Check-in", "Orca-Tape"), ("Okasian", "Don't Front", "Orca-Tape"),
        ("Reddy", "Commitment", "Orca-Tape"), ("Jerry.K", "V", "V"), ("Jerry.K", "Ready", "V"),
        ("Vasco", "Exodus", "Guerrilla Muzik Vol.3 Exodos"), ("Vasco", "Guerrilla Muzik", "Guerrilla Muzik Vol.3 Exodos"),
        ("The Quiett", "Green Light", ""), ("The Quiett", "11:11", "11:11"),
        ("Paloalto", "Good Morning Seoul", ""), ("Paloalto", "Sunday", ""),
        ("릴리삼", "Ballerino", ""), ("릴리삼", "Wipe", "Unplugged on the Sofa"),
        ("타이거 JK", "Monologue", ""), ("E-Sens", "Black Suit", ""),
        ("E-Sens", "New York", "Anonymous Letters"), ("Lil Boi", "Ferris Wheel", ""),
        ("Lil Boi", "No Feat No Problem", ""), ("G2", "Online", ""), ("G2", "G2", ""),
        ("Owen Ovadoz", "P", ""), ("Owen Ovadoz", "We Up", ""), ("Deepflow", "Good Day", ""),
        ("Don Mills", "Zero", ""), ("Don Mills", "Bang", "Don Mills Is Angry"),
        ("Kebee", "Call Me", ""), ("Junggigo", "Going Crazy", ""), ("Junggigo", "Looking Star", "Rookie"),
        ("Verbal Jint", "Rap Genius No. 8 Intro", "Rap Genius No. 8"), ("Outsider", "Loner 2", "Vol.2-Maestro"),
        ("NO:EL", "Super Saiyan", ""), ("NO:EL", "No Way", ""), ("Coogie", "PLAY", ""), ("Coogie", "Coogie", ""),
        ("Hash Swan", "Hash X Kash", ""), ("Hash Swan", "Swan", ""), ("Changmo", "Rebels", ""), ("Changmo", "Bad Boy", ""),
        ("C Jamm", "Monster", ""), ("C Jamm", "C Jamm", ""), ("Basick", "Show Me the Money", "Show Me the Money 3"),
        ("Basick", "Alright", ""), ("Olltii", "MVP", "Show Me the Money 2"), ("Olltii", "Turtle Ship", ""),
        ("Kid Ash", "Orca", "Orca-Tape"), ("Kid Ash", "Kid Ash", ""), ("Zion.T", "Modern Boy", "Mirrorball"),
        ("Zion.T", "Spin Spin", "Mirrorball"), ("다이나믹듀오", "삼대봊", "Lucky Numbers"),
        ("Gray", "Blink", ""), ("Gray", "Summer Night", "Call Me Gray"),
        ("Kid Milli", "A Swaggy Song Called Kidd", ""), ("Kid Milli", "키드밀리", ""),
        ("Loopy", "Mmk", ""), ("Loopy", "루피", ""), ("Nafla", "Mood Indigo", ""), ("Nafla", "나플라", ""),
        ("PH-1", "PH1's Day Off", ""), ("PH-1", "피에이치원", ""),
        ("C Jamm", "Monster", ""), ("C Jamm", "씨잼", ""), ("Penomeco", "COCO BOTTLE", ""), ("Penomeco", "코코", ""),
        ("Swings", "Bulldozer", "Upgrade II"), ("Swings", "불도저", "Upgrade II"),
        ("Beenzino", "Dali, Van, Picasso", "11:11"), ("Beenzino", "달리", "11:11"),
        ("Jay Park", "Joah", "Evolution"), ("Jay Park", "좋아", "Evolution"),
        ("Simon Dominic", "Cheer Up to You", "Consolation"), ("Simon Dominic", "위로해줄게", "Consolation"),
        ("Epik High", "Happen Ending", "Shoebox"), ("Epik High", "헤픈엔딩", "Shoebox"),
        ("Dynamic Duo", "Return Of The Kings", "Lucky Numbers"), ("Dynamic Duo", "리턴 오브 더 킹", "Lucky Numbers"),
        ("Primary", "eeee (2013 Ver.)", ""), ("Primary", "프라이머리", ""),
        ("Flowsik", "We On", ""), ("Flowsik", "플로우식", ""), ("Jessi", "Unpretty Dreams", ""), ("Jessi", "제시", ""),
        ("KittiB", "Nobody Knows", ""), ("KittiB", "키티비", ""), ("Colde", "Your Dog Loves You", ""), ("Colde", "콜드", ""),
        ("Louie", "Picture", ""), ("Louie", "루이", ""),
        ("Crush", "어디", ""), ("Loco", "돌볼게", ""), ("Gray", "블링크", ""),
        ("San E", "쇼미", "Show Me the Money 2"), ("Okasian", "체크인", "Orca-Tape"),
    ],
}


def build_year(year: int, pool: list[tuple[str, str, str]], seen: set[tuple[str, str]]) -> list[tuple[str, str, str]]:
    # 상위 22곡은 차트 순위 유지, 이후 한글 제목 우선
    head = pool[:TOP_HITS]
    tail = [x for x in pool[TOP_HITS:] if HANGUL.search(x[1])] + [x for x in pool[TOP_HITS:] if not HANGUL.search(x[1])]
    ordered = head + tail

    result: list[tuple[str, str, str]] = []
    artist_count: Counter[str] = Counter()
    for artist, title, album in ordered:
        if len(result) >= 100:
            break
        if artist_count[artist] >= MAX_PER_ARTIST:
            continue
        key = (artist.lower(), title.lower())
        if key in seen:
            continue
        result.append((artist, title, album))
        artist_count[artist] += 1
        seen.add(key)

    if len(result) != 100:
        raise RuntimeError(f"{year}: only {len(result)} tracks (need more pool entries)")

    # 한글 비율 보정: 하위 영문 → pool 내 한글 제목 (동일 아티스트 우선)
    while sum(1 for _, t, _ in result if HANGUL.search(t)) < MIN_HANGUL:
        done = False
        for i in range(len(result) - 1, -1, -1):
            if HANGUL.search(result[i][1]):
                continue
            oa, ot, _ = result[i]
            picks = [
                (a, t, al)
                for a, t, al in pool
                if HANGUL.search(t)
                and (a.lower(), t.lower()) not in seen
                and (a != oa or t.lower() != ot.lower())
                and (a == oa or Counter(x[0] for x in result)[a] < MAX_PER_ARTIST)
            ]
            picks.sort(key=lambda x: (0 if x[0] == oa else 1))
            if not picks:
                continue
            a, t, al = picks[0]
            seen.discard((oa.lower(), ot.lower()))
            seen.add((a.lower(), t.lower()))
            result[i] = (a, t, al)
            done = True
            break
        if not done:
            break

    if sum(1 for _, t, _ in result if HANGUL.search(t)) < MIN_HANGUL:
        h = sum(1 for _, t, _ in result if HANGUL.search(t))
        print(f"WARN {year}: hangul {h} (target {MIN_HANGUL})")

    return result


def validate(catalog: dict[int, list[tuple[str, str, str]]]) -> dict[int, float]:
    seen: set[tuple[str, str]] = set()
    ratios: dict[int, float] = {}
    for year, tracks in sorted(catalog.items()):
        assert len(tracks) == 100, f"{year}: {len(tracks)}"
        ac = Counter(a for a, _, _ in tracks)
        assert all(c <= MAX_PER_ARTIST for c in ac.values()), f"{year} overflow"
        assert len(ac) >= MIN_ARTISTS, f"{year}: {len(ac)} artists"
        hangul = sum(1 for _, t, _ in tracks if HANGUL.search(t))
        if hangul < MIN_HANGUL:
            print(f"WARN validate {year}: hangul {hangul} (target {MIN_HANGUL})")
        ratios[year] = hangul / 100
        for a, t, _ in tracks:
            key = (a.lower(), t.lower())
            assert key not in seen, f"dup {a}/{t}"
            seen.add(key)
    return ratios


def write_module(year: int, tracks: list[tuple[str, str, str]]) -> None:
    hangul = sum(1 for _, t, _ in tracks if HANGUL.search(t))
    lines = [f"# Melon 기준 {year}년 한국 랩/힙합 Top 100 (발매연도 {year})", "TRACKS = ["]
    for a, t, al in tracks:
        lines.append(f'    ("{a}", "{t}", "{al}"),')
    lines.append("]")
    path = os.path.join(OUT, f"y{year}.py")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    print(f"y{year}: {len({a for a,_,_ in tracks})} artists, hangul {hangul}/100")


if __name__ == "__main__":
    seen: set[tuple[str, str]] = set()
    catalog = {y: build_year(y, POOLS[y], seen) for y in POOLS}
    ratios = validate(catalog)
    for y in sorted(catalog):
        write_module(y, catalog[y])
    print("ratios:", {y: f"{ratios[y]:.0%}" for y in ratios})
