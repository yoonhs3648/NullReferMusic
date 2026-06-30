#!/usr/bin/env python3
"""K-pop Top 100 catalog per year (2015-2019). Melon/Gaon-based curation."""
from __future__ import annotations

import re
import unicodedata
from collections import Counter

# (artist, title, album) — album "" for singles; release year = file year
CATALOG_2015_2019: dict[int, list[tuple[str, str, str]]] = {
    2015: [
        ("BIGBANG", "뱅뱅뱅", ""),
        ("BIGBANG", "LOSER", ""),
        ("Naul", "같은 시간 속의 너", ""),
        ("Zion.T", "꺼내 먹어요", ""),
        ("Zion.T", "양화대교", ""),
        ("Baek A Yeon", "이럴거면 그러지말지", ""),
        ("Hyukoh", "위잉위잉", "20"),
        ("Hyukoh", "와리가리", "20"),
        ("SISTAR", "SHAKE IT", ""),
        ("SISTAR", "I Swear", "I Swear - The 4th Mini Album"),
        ("EXID", "위아래", ""),
        ("AOA", "심쿵해", ""),
        ("AOA", "Heart Attack", "Heart Attack"),
        ("Song Minho", "겁", ""),
        ("miss A", "Only You", ""),
        ("Davichi", "두 사랑", ""),
        ("IU", "Heart", "CHAT-SHIRE"),
        ("EXO", "CALL ME BABY", "EXODUS"),
        ("EXO", "LOVE ME RIGHT", "LOVE ME RIGHT"),
        ("Mamamoo", "음오아예", ""),
        ("Mamamoo", "Ahh Oop!", ""),
        ("iKON", "취향저격", ""),
        ("iKON", "지금처럼", ""),
        ("Girls' Generation", "PARTY", ""),
        ("Girls' Generation", "Lion Heart", "Lion Heart - The 5th Album"),
        ("Taeyeon", "I", "I - The 1st Mini Album"),
        ("BTS", "I NEED U", "The Most Beautiful Moment in Life Pt.1"),
        ("BTS", "RUN", "The Most Beautiful Moment in Life Pt.2"),
        ("GFRIEND", "유리구슬", "Season Of Glasses"),
        ("GFRIEND", "오늘부터 우리는", "Flower Bud"),
        ("Red Velvet", "Dumb Dumb", "The Red - The 1st Album"),
        ("Red Velvet", "Ice Cream Cake", "Ice Cream Cake - The 1st Mini Album"),
        ("SHINee", "View", "Odd - The 5th Album"),
        ("SHINee", "Married To The Music", "Married To The Music - The 4th Album Repackage"),
        ("SEVENTEEN", "아낀다", "BOYS BE"),
        ("SEVENTEEN", "만세", "BOYS BE"),
        ("TWICE", "OOH-AHH하게", "THE STORY BEGINS"),
        ("PSY", "DADDY", ""),
        ("Block B", "HER", "Her"),
        ("Wonder Girls", "I Feel You", "REBOOT"),
        ("f(x)", "4 Walls", "4 Walls - The 4th Album"),
        ("Park Hyo Shin", "야생화", ""),
        ("JYP", "Who's Your Mama", ""),
        ("San E", "ME YOU", ""),
        ("MC the Max", "그 남자", ""),
        ("Huh Gak", "4월의 눈물", ""),
        ("Loco", "우연이 아니야", ""),
        ("Zico", "Eureka", "Break Up 2 Make Up"),
        ("Crush", "어떻게 지내", ""),
        ("GOT7", "Just Right", "Just Right"),
        ("GOT7", "If You Do", "MAD"),
        ("MONSTA X", "Trespass", "TRESPASS"),
        ("MONSTA X", "Rush", "RUSH"),
        ("WINNER", "SENTIMENTAL", "EXIT : E"),
        ("BEAST", "Yey", "Time"),
        ("Taeyang", "눈, 코, 입", "RISE"),
        ("G-DRAGON", "무제", ""),
        ("Ailee", "Mind Your Own Business", "VIVID"),
        ("Heize", "And July", ""),
        ("Dean", "21", ""),
        ("Urban Zakapa", "이 밤의 끝을 잡고", "02"),
        ("BOL4", "힘", ""),
        ("AKMU", "200%", "PLAY"),
        ("AKMU", "가끔 내가", "PLAY"),
        ("Im Chang Jung", "다시 사랑한다 말할까", ""),
        ("Standing Egg", "눈사태", "With"),
        ("10CM", "Sseudam Sswuda", "1.0"),
        ("K.Will", "Love Blossom", ""),
        ("Soyou", "광화문에서", ""),
        ("Girl's Day", "Ring My Bell", "Love"),
        ("Super Junior", "DEVIL", "DEVIL - The 7th Album Special Edition"),
        ("CNBLUE", "Cinderella", "2gether"),
        ("FTISLAND", "Pray", "I Will"),
        ("Apink", "LUV", "Pink LUV"),
        ("BTOB", "그리워하다", "Move"),
        ("INFINITE", "Bad", "Reality"),
        ("VIXX", "사랑하지 않아도 괜찮아", "Chained Up"),
        ("B1A4", "White", "Good Timing"),
        ("SISTAR19", "가시나", ""),
        ("EXID", "애써", "Ah Yeah"),
        ("Lee Seung Gi", "꽃길", ""),
        ("Rain", "LA SONG", ""),
        ("Teen Top", "MISS RIGHT", "MISS RIGHT"),
        ("U-KISS", "Playground", "Always"),
        ("B.A.P", "Young, Wild & Free", "Matrix"),
        ("N.Flying", "Awesome", "Awesome"),
        ("Lovelyz", "Hi~", "Girls' Invasion"),
        ("OH MY GIRL", "Closer", "Closer"),
        ("DIA", "Somehow", "DIA&4U"),
        ("CLC", "Eighteen", "REFRESH"),
        ("Stellar", "떨려요", ""),
        ("Crayon Pop", "Uh-ee", ""),
        ("Noel", "목소리", ""),
        ("Mad Clown", "Fire", ""),
        ("Gary", "TAKE OFF", ""),
        ("Yoon Mi Rae", "너를 사랑해", ""),
        ("Eddy Kim", "이별하는 방법", ""),
        ("Jung Seung Hwan", "너였다면", ""),
        ("Park Boram", "Pretty", ""),
        ("Son Dam Bi", "댄싱Queen", ""),
        ("Primary", "Johnny", ""),
        ("Nell", "기억을 걷는 시간", ""),
        ("Bobby", "꽃을 들었네", ""),
        ("Melomance", "선물", ""),
        ("Punch", "Forever", ""),
        ("Roy Kim", "Bom Bom Bom", ""),
        ("VIXX LR", "Beautiful Liar", "Beautiful Liar"),
        ("NCT U", "일곱번째 감각", ""),
    ],
    2016: [
        ("TWICE", "CHEER UP", ""),
        ("TWICE", "TT", "TWICEcoaster : LANE 1"),
        ("GFRIEND", "시간을 달려서", "GFRIEND 3rd Mini Album '시간을 달려서'"),
        ("GFRIEND", "NAVILLERA", "LOL"),
        ("MC the Max", "어디에도", ""),
        ("Urban Zakapa", "널 사랑하지 않아", "02"),
        ("Zico", "너는 나 나는 너", ""),
        ("Zico", "Boys And Girls", ""),
        ("Gummy", "You Are My Everything", "I Wanna Be With You"),
        ("Lee Juck", "걱정말아요 그대", ""),
        ("Crush", "잊지말아요", ""),
        ("Crush", "Beautiful", ""),
        ("DEAN", "D (Half Moon)", "130 Mood : TRBL"),
        ("DEAN", "instagram", "130 Mood : TRBL"),
        ("Mamamoo", "넌 is 뭔들", "MELTING"),
        ("Mamamoo", "You're the Best", "MELTING"),
        ("Jung Eunji", "하늘바라기", ""),
        ("BOL4", "Galaxy", ""),
        ("BOL4", "우주를 줄게", ""),
        ("Yoon Mi Rae", "Always", "And"),
        ("BewhY", "Day Day", ""),
        ("Wonder Girls", "Why So Lonely", ""),
        ("Heize", "돌아오지마", ""),
        ("Baekhyun", "Dream", ""),
        ("10CM", "봄이 좀 다른 것 같아", "4.0"),
        ("K.Will", "Talk Love", ""),
        ("Chen", "Everytime", ""),
        ("Taeyeon", "Rain", "Rain - The 1st Mini Album"),
        ("Taeyeon", "11:11", "11:11"),
        ("Lee Hi", "BREATHE", "SEOULITE"),
        ("BLACKPINK", "WHISTLE", "SQUARE ONE"),
        ("BLACKPINK", "붐바야", "SQUARE ONE"),
        ("BTS", "피 땀 눈물", "WINGS"),
        ("BTS", "불타오르네", "The Most Beautiful Moment in Life : Young Forever"),
        ("EXO", "Monster", "EX'ACT - The 3rd Album"),
        ("EXO", "Lucky One", "EX'ACT - The 3rd Album"),
        ("WINNER", "BABY BABY", "EXIT : E"),
        ("WINNER", "FOOL", "EXIT : E"),
        ("SEVENTEEN", "아주 NICE", "Love & Letter Repackage Album 'Love&Letter'"),
        ("SEVENTEEN", "Q&A", "Love & Letter"),
        ("GOT7", "Fly", "FLIGHT LOG : DEPARTURE"),
        ("GOT7", "Hard Carry", "FLIGHT LOG : TURBULENCE"),
        ("SHINee", "1 of 1", "1 of 1 - The 5th Album Repackage"),
        ("SHINee", "View", "Odd - The 5th Album"),
        ("Red Velvet", "Russian Roulette", "Russian Roulette - The 3rd Mini Album"),
        ("Red Velvet", "Lucky Girl", "Russian Roulette - The 3rd Mini Album"),
        ("AKMU", "RE-BYE", "WINTER"),
        ("AKMU", "사람들이 움직이는 것", "WINTER"),
        ("Block B", "Toy", "Blooming Period"),
        ("BTOB", "It's Okay", "New Men"),
        ("Apink", "Remember", "Pink MEMORY"),
        ("SISTAR", "I Like That", "INSANE LOVE"),
        ("Soyou", "밤이 되니까", ""),
        ("VIXX", "Dynamite", "Chained Up"),
        ("INFINITE", "That Summer", "INFINITE ONLY"),
        ("B1A4", "A Lie", "Good Timing"),
        ("CNBLUE", "You're So Fine", "BLUEMING"),
        ("FTISLAND", "Take Me Now", "I Will"),
        ("I.O.I", "너무너무너무", "miss me?"),
        ("I.O.I", "소나기", "miss me?"),
        ("MONSTA X", "Fighter", "RUSH"),
        ("NCT 127", "Fire Truck", "NCT #127"),
        ("NCT DREAM", "Chewing Gum", "The First"),
        ("ASTRO", "Hide & Seek", "Spring Up"),
        ("SF9", "Fanfare", "Feeling Sensation"),
        ("Cosmic Girls", "Secret", "THE SECRET"),
        ("CLC", "No", "Amigo"),
        ("Girl's Day", "I'll Be Yours", "Everyday"),
        ("Lovelyz", "Destiny", "Lovelyz8"),
        ("OH MY GIRL", "Windy Day", "Windy Day"),
        ("Son Seung Yeon", "너의 모든 순간", ""),
        ("Ben", "Like a Dream", ""),
        ("Huh Gak", "봄비", ""),
        ("Ailee", "If You", "VIVID"),
        ("Park Hyo Shin", "Beautiful Tomorrow", ""),
        ("San E", "Romeo N Juliet", ""),
        ("Gray", "Late Night", ""),
        ("Hyuna", "How's This?", "A'wesome"),
        ("Hyuna", "Roll Deep", "A'wesome"),
        ("DIA", "On The Road", "LOVE GENERATION"),
        ("Berry Good", "Don't Believe", "Very Berry"),
        ("UP10TION", "Attention", "Top Secret"),
        ("PENTAGON", "Gorilla", "Pentagon"),
        ("f(x)", "All Mine", ""),
        ("EXID", "L.I.E", "Street"),
        ("Stellar", "Sting", "Sting"),
        ("Zion.T", "Complex", "OO"),
        ("Loco", "엄지척", ""),
        ("B.A.P", "Skydive", "Put 'Em Up"),
        ("B.A.P", "Carnival", "Carnival"),
        ("Standing Egg", "Confession", "With Her"),
        ("Melomance", "You&Me", ""),
        ("XIA", "Flower", "XIA 4th Album 'XIGNATURE'"),
        ("Roy Kim", "The Great Dipper", ""),
        ("Jung Seung Hwan", "The Fan", ""),
        ("Primary", "Bawling", ""),
        ("NCT U", "Without You", ""),
        ("VIXX LR", "Whisper", "Beautiful Liar"),
        ("Punch", "Stay With Me", ""),
        ("Jessi", "SSENTTEKI", ""),
        ("Im Chang Jung", "Home", ""),
        ("Epik High", "Born Hater", "Shoebox"),
        ("Davichi", "Beside Me", "Davichi Code - Mini Album Vol.3 '13"),
        ("N.Flying", "Fantastic", "Fantastic"),
        ("BewhY", "Forever", ""),
        ("Lee Hi", "My Star", "SEOULITE"),
        ("GOT7", "Never Ever", "7 for 7"),
        ("SEVENTEEN", "Boom Boom", "Going Seventeen"),
        ("MONSTA X", "Beautiful", "THE CLAN 2.5 PART.1 'LOST'"),
        ("ASTRO", "Baby", "Winter Dream"),
        ("SF9", "Roar", "Feeling Sensation"),
        ("Cosmic Girls", "I Wish", "THE SECRET"),
        ("CLC", "Hobgoblin", "CRYSTYLE"),
        ("PENTAGON", "Pentagon", "Pentagon"),
        ("UP10TION", "Going Crazy", "Top Secret"),
        ("Berry Good", "Don't Make Me Cry", "Very Berry"),
        ("DIA", "Will You Go Out With Me", "LOVE GENERATION"),
        ("Stellar", "Archangels", "Sting"),
        ("EXID", "Hot Pink", "Ah Yeah"),
        ("BLACKPINK", "PLAYING WITH FIRE", "SQUARE TWO"),
        ("BTS", "Save Me", "The Most Beautiful Moment in Life : Young Forever"),
    ],
}


def track_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = unicodedata.normalize("NFKC", s or "")
        s = s.lower()
        s = re.sub(r"&", " and ", s)
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
        s = re.sub(r"\s+", " ", s).strip()
        return s

    return f"{norm(artist)}|{norm(title)}"


def validate() -> None:
    global_keys: dict[str, tuple[int, str]] = {}
    for year in sorted(CATALOG_2015_2019):
        tracks = CATALOG_2015_2019[year]
        if len(tracks) != 100:
            raise SystemExit(f"year {year}: expected 100 tracks, got {len(tracks)}")
        seen: set[str] = set()
        artist_counts: Counter[str] = Counter()
        for artist, title, album in tracks:
            key = track_key(artist, title)
            if key in seen:
                raise SystemExit(f"duplicate within {year}: {artist} - {title}")
            seen.add(key)
            artist_counts[artist] += 1
            if artist_counts[artist] > 2:
                raise SystemExit(
                    f"max 2 per artist per year ({year}): {artist} has {artist_counts[artist]}"
                )
            if key in global_keys:
                prev_y, _ = global_keys[key]
                raise SystemExit(
                    f"duplicate across years: {artist} - {title} ({year} vs {prev_y})"
                )
            global_keys[key] = (year, title)


def main() -> None:
    validate()
    for year in sorted(CATALOG_2015_2019):
        tracks = CATALOG_2015_2019[year]
        artists = {a for a, _, _ in tracks}
        print(f"{year}: {len(tracks)} tracks, {len(artists)} artists")


if __name__ == "__main__":
    main()
