#!/usr/bin/env python3
"""Build catalog_v2 y2022-y2025 with constraint-aware selection."""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
MIN_HANGUL = 55
TARGET = 100

# (year, artist, title, album, priority)  priority: 0=must-have hit, 1=normal
RAW: list[tuple[int, str, str, str, int]] = []

def add(year: int, artist: str, title: str, album: str = "", pri: int = 1) -> None:
    RAW.append((year, artist, title, album, pri))


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


# ── 2022 must hits ──
add(2022, "Beenzino", "MONET", "", 0)
add(2022, "Zico", "새삥 (Prod. ZICO) (Feat. 호미들)", "Street Man Fighter Original Vol.3", 0)
add(2022, "Epik High", "그래서 그래 (Feat. 윤하)", "Epik High Is Here 下, Part 2", 0)
add(2022, "Kid Milli", "가볍게", "", 0)
add(2022, "Coogie", "굿나잇", "Re:Up", 0)
add(2022, "Leellamarz", "그러지마", "Toystory3", 0)
add(2022, "이영지", "낫 쏘리 (Feat. pH-1)", "Show Me the Money 11", 0)
add(2022, "JUSTHIS", "마이웨이 (MY WAY) (Prod. by Alti)", "Show Me the Money 11", 0)

# ── 2022 pool ──
for a, t, al in [
    ("Beenzino", "덤보", "Dumbo"),
    ("Zico", "Grown Ass Kid", "Grown Ass Kid"),
    ("Zico", "Seoul Drift", "Grown Ass Kid"),
    ("Epik High", "비 오는 날 듣기 좋은 노래 (Feat. 콜드)", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Face ID (페이스 아이디) (Feat. 기리보이, Sik-K, JUSTHIS)", "Epik High Is Here 下, Part 2"),
    ("Kid Milli", "SUMMER", ""),
    ("Coogie", "혼자", "Re:Up"),
    ("Leellamarz", "마지막 기회", "Toystory3"),
    ("Leellamarz", "Never Ending Story", "Toystory3"),
    ("이영지", "WITCH (Feat. 박재범, 황소윤)", "Show Me the Money 11"),
    ("Don Malik", "눈 (EYE) (Feat. BIG Naughty, JUSTHIS)", "Show Me the Money 11"),
    ("Don Malik", "빡 (Feat. JUSTHIS, Paloalto)", "Show Me the Money 11"),
    ("허성현", "미운오리새끼 (Prod. R.Tee)", "Show Me the Money 11"),
    ("허성현", "펄펄 (Feat. Dynamic Duo)", "Show Me the Money 11"),
    ("JUSTHIS", "Signature (Prod. by Alti)", "Show Me the Money 11"),
    ("Kan", "나침반 (Feat. UNEDUCATED KID, Superbee)", "Show Me the Money 11"),
    ("Kan", "Therapy + 으리으리 (Feat. 호미들)", "Show Me the Money 11"),
    ("Blase", "Holiday (Feat. Lil Boi, 기리보이)", "Show Me the Money 11"),
    ("Blase", "Quote That", ""),
    ("Crush", "Rush Hour (Feat. j-hope of BTS)", ""),
    ("Crush", "Oasis", ""),
    ("PH-1", "BUT FOR NOW LEAVE ME ALONE", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Zombies", "BUT FOR NOW LEAVE ME ALONE"),
    ("Loco", "WIN", ""),
    ("Loco", "Focus", ""),
    ("GRAY", "Remedy", ""),
    ("GRAY", "Sweaty (Prod. GRAY) (Feat. 로꼬, Coogie)", "Street Man Fighter Original Vol.3"),
    ("Lil Moshpit", "MOSHPIT ONLY", "AAA"),
    ("Lil Moshpit", "ACHOO", "ACHOO"),
    ("GroovyRoom", "Whistle (Prod. GroovyRoom) (Feat. 식케이, Mirani)", "Street Man Fighter Original Vol.3"),
    ("GroovyRoom", "Brought the Heat Back (Feat. 식케이, Paloalto)", "Brought the Heat Back"),
    ("Giriboy", "Vice Versa", "Vice Versa"),
    ("Giriboy", "Braille", "Vice Versa"),
    ("Ash Island", "안전지대", "Safety Zone"),
    ("Ash Island", "Malibu Night", "Safety Zone"),
    ("Dynamic Duo", "ECO", "ECO"),
    ("Dynamic Duo", "Smoke", "ECO"),
    ("Paloalto", "Valentina", ""),
    ("Paloalto", "Issues", "BUT FOR NOW LEAVE ME ALONE"),
    ("The Quiett", "Bentley", ""),
    ("The Quiett", "Bentley 2", ""),
    ("TOIL", "처음 만났을 때처럼", ""),
    ("TOIL", "Rollin", "1989"),
    ("Swings", "우리를 기억해", "Growing Pains"),
    ("Swings", "Per se", "Per se"),
    ("Mirani", "Drama", "Drama"),
    ("Mirani", "Kangaroo", "Drama"),
    ("Woodie Gochild", "Channel Surfing", "#GOchild"),
    ("Woodie Gochild", "Mud", "Show Me the Money 10"),
    ("Owen Ovadoz", "119", "119"),
    ("Owen Ovadoz", "Diamond", "119"),
    ("Punchnello", "Loveseat", ""),
    ("Punchnello", "Cream Cheese", ""),
    ("Colde", "Star", ""),
    ("Colde", "honestly", ""),
    ("Changmo", "Just the Two of Us", ""),
    ("Changmo", "SMF", ""),
    ("Dean", "4:44", ""),
    ("Heize", "Undo", ""),
    ("Jessi", "Zoom", ""),
    ("Zion.T", "Lonely Christmas", ""),
    ("QM", "Come To My Stu (Feat. 릴러말즈)", "Show Me the Money 11"),
    ("노윤하", "Flick (Feat. BE'O, HAON)", "Show Me the Money 11"),
    ("잠비노", "Bingo (Feat. 미노이, George)", "Show Me the Money 11"),
    ("YUNHWAY", "100°C (Prod. 기리보이, YEOHO) (Feat. YUNHWAY)", "Street Man Fighter Original Vol.3"),
    ("Tablo", "Super Rare (슈퍼 레어) (Feat. Wonstein, pH-1)", "Epik High Is Here 下, Part 2"),
    ("Tablo", "Stop the Rain", ""),
    ("Primary", "BILLING", "BILLING"),
    ("Primary", "2", "2"),
    ("Gaeko", "Sturgis", "Sturgis"),
    ("Simon Dominic", "Make Her Dance", "Simon Dominic Part 3"),
    ("Nafla", "Freestyle", ""),
    ("Loopy", "Freestyle", ""),
    ("Sokodomo", "SIGNATURE", "Show Me the Money 10"),
    ("Mudd the student", "Nectar", "Show Me the Money 10"),
    ("Lil Boi", "Good Day", "Show Me the Money 10"),
    ("Mino", "안녕", "To Infinity"),
    ("Mino", "겁", "Fear"),
    ("Bobby", "감동 (Secret)", "SECRET"),
    ("Bobby", "봄이 와 (Cherry Blossom)", "S.i.R"),
    ("Penomeco", "Shy (수줍)", "Shy"),
    ("Penomeco", "Lovers", "Shy"),
    ("Lee Young Ji", "Yumeyo", "16"),
    ("Koonta", "KOONTA", "Show Me the Money 10"),
    ("BE'O", "Countdown", "Show Me the Money 10"),
    ("Sik-K", "Brought the Heat Back", "Brought the Heat Back"),
    ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
    ("Jvcki Wai", "Taxi Blurr", "Taxi Blurr"),
    ("D.Ark", "Genius", "Genius"),
    ("BewhY", "Day Day", "The Movie Star"),
    ("YUMDDA", "Tic Toc", "I'm Good"),
    ("Woodie Gochild", "Honest", "#GOchild"),
    ("Mirani", "Villain", "Show Me the Money 10"),
    ("Owen Ovadoz", "Freeze", "119"),
    ("GroovyRoom", "LAW (Prod. Czaer)", "Street Man Fighter Original Vol.3"),
    ("Giriboy", "100°C (Prod. Giriboy, YEOHO) (Feat. YUNHWAY)", "Street Man Fighter Original Vol.3"),
    ("Epik High", "가족관계증명서 (Feat. 김필)", "Epik High Is Here 下, Part 2"),
    ("Epik High", "Rich Kids Anthem (리치 키즈 앤섬) (Feat. 이하이)", "Epik High Is Here 下, Part 2"),
    ("Swings", "Blueprint 2015", "Per se"),
    ("Giriboy", "Lingering", "Vice Versa"),
    ("Loco", "Aniya", ""),
    ("Dean", "Die 4 You", ""),
    ("Heize", "Jenga", "And July"),
    ("Jessi", "Cold Blooded", "Cold Blooded"),
    ("Zion.T", "Just (2022)", "Zion.T Special: OO"),
    ("Colde", "Your Dog Loves You", "Your Dog Loves You"),
    ("Punchnello", "Loving You Girl", "Loving You Girl"),
    ("Dynamic Duo", "AEAO", "A DynamicAffair"),
    ("Lee Young Ji", "Not Sure", "16"),
    ("Mirani", "Ticket", "Ticket"),
    ("Owen Ovadoz", "Diana", "Show Me the Money 10"),
    ("Lil Boi", "Empty Head", ""),
    ("Loopy", "King Loopy", "King Loopy"),
    ("Sokodomo", "Merry Go Round", "Merry Go Round"),
    ("Mudd the student", "Sleepy Beauty", ""),
    ("Gaeko", "Gajah", "Gajah"),
    ("Simon Dominic", "ART OF PARTYING", "NO OPEN FLAME"),
    ("Nafla", "Natural Born Killers", "Natural Born Killers"),
    ("Jvcki Wai", "Neo Eve", "Exposure"),
    ("D.Ark", "Undercover", "Genius"),
    ("BewhY", "Forever", "The Movie Star"),
    ("YUMDDA", "Shake", "I'm Good"),
    ("Hash Swan", "Retro Love", ""),
    ("Koonta", "Ambition", "Show Me the Money 10"),
    ("BE'O", "Luxury", "Show Me the Money 10"),
    ("NSW yoon", "Therapy + 으리으리 (Feat. 호미들)", "Show Me the Money 11"),
]:
    add(2022, a, t, al)

# ── 2023 must hits ──
add(2023, "Jay Park", "McNasty", "", 0)
add(2023, "Beenzino", "Trippy", "NOWITZKI", 0)
add(2023, "Beenzino", "In Bed/막걸리", "NOWITZKI", 0)
add(2023, "Don Malik", "MADE IN SEOUL", "MADE IN SEOUL", 0)
add(2023, "Lil Moshpit", "TO GO", "", 0)
add(2023, "PLT", "Summer", "Summer", 0)
add(2023, "82MAJOR", "FIRST CLASS", "ON", 0)

for a, t, al in [
    ("Jay Park", "Candy", ""),
    ("Jay Park", "Sunday Night Drive", ""),
    ("Jay Park", "Why", ""),
    ("Don Malik", "49", "49"),
    ("Lil Moshpit", "Money Only Shows Hustle", ""),
    ("PLT", "Way Back Home", "Way Back Home"),
    ("82MAJOR", "Sure Thing", "ON"),
    ("Epik High", "Strawberry", "Strawberry"),
    ("Epik High", "On My Way", "Strawberry"),
    ("Kid Milli", "BEIGE theme", "BEIGE"),
    ("Kid Milli", "HONDA!", "BEIGE"),
    ("Coogie", "Buck", "DIFF"),
    ("Coogie", "Just For Fun", "DIFF"),
    ("Leellamarz", "모른 척", "DAYDATE"),
    ("Leellamarz", "Money dance", "DAYDATE"),
    ("Zico", "SPOT!", ""),
    ("Zico", "Earthquake", ""),
    ("Crush", "Hmm-cheat", "wonderego"),
    ("Crush", "Click Like (Prod. Crush)", "Street Woman Fighter 2 Original Vol.1"),
    ("Loco", "VOLVO", ""),
    ("Loco", "INEEDYOURLOVE", ""),
    ("Dean", "Die 4 You", ""),
    ("Dean", "NO FUN", "howlin' 404"),
    ("Heize", "Perhaps Happy Ending", "Last Winter"),
    ("Heize", "From Autumn to Winter", "Last Winter"),
    ("Zion.T", "UNLOVE", "Zip"),
    ("Zion.T", "Happy Ending", "Zip"),
    ("Bobby", "Drowning", "S.i.R"),
    ("Bobby", "봄이 와 (Cherry Blossom)", "S.i.R"),
    ("Mino", "Smoke", "BODY"),
    ("Mino", "Aero", "BODY"),
    ("Changmo", "VOOM", ""),
    ("Changmo", "FWB", ""),
    ("PH-1", "Rosario", "But For Now Leave Me Alone 2"),
    ("PH-1", "Final Bout", "But For Now Leave Me Alone 2"),
    ("Gray", "Summer Surf", "Summer Surf"),
    ("Punchnello", "Motive", ""),
    ("Colde", "Wave", ""),
    ("Giriboy", "Engineering", "Engineering"),
    ("Ash Island", "Me n Mine", "Show Me the Money 10"),
    ("Dynamic Duo", "Smoke (Prod. Dynamicduo, Padi)", "Street Woman Fighter 2 Original Vol.1"),
    ("Dynamic Duo", "AEAO", "A DynamicAffair"),
    ("The Quiett", "King Is Back", "Luxury Flow"),
    ("The Quiett", "Mercedes", "Luxury Flow"),
    ("Paloalto", "GONE", ""),
    ("TOIL", "1989", "1989"),
    ("Swings", "Growing Pains 2", "Growing Pains 2"),
    ("Mirani", "Villain", "Show Me the Money 10"),
    ("Woodie Gochild", "Mud", "Show Me the Money 10"),
    ("Owen Ovadoz", "Diana", "Show Me the Money 10"),
    ("Blase", "ONOFF", "Show Me the Money 10"),
    ("Sokodomo", "Winner", "Show Me the Money 10"),
    ("Lil Boi", "Wave", "Show Me the Money 10"),
    ("BE'O", "Countdown", "Show Me the Money 10"),
    ("Lee Young Ji", "WITCH", "Witch"),
    ("Jessi", "Cold Blooded", "Cold Blooded"),
    ("Sik-K", "FL1X", "FL1X"),
    ("Tablo", "Hood", "Drill Presents: Tablo x Fantasy"),
    ("Primary", "BILLING", "BILLING"),
    ("Nafla", "C.R.E.A.M", "C.R.E.A.M"),
    ("Loopy", "Portrait Mode", "[ Album ]"),
    ("YUMDDA", "I'm Good", "I'm Good"),
    ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
    ("Jvcki Wai", "Doughnet", "Exposure"),
    ("Mudd the student", "Nectar", "Show Me the Money 10"),
    ("BewhY", "Movie Star", "The Movie Star"),
    ("Penomeco", "Famous", ""),
    ("Simon Dominic", "NO OPEN FLAME", "NO OPEN FLAME"),
    ("Gaeko", "Geon Gangs", "Geon Gangs"),
    ("Deepflow", "Come Back Home", "Flow the Life 3"),
    ("Huckleberry P", "Mantra 3", "Mantra 3"),
    ("D.Ark", "Genius", "Genius"),
    ("Kid Ash", "Orca", "Orca-Tape"),
    ("C Jamm", "Monster", ""),
    ("Olltii", "Creative Control", "Creative Control"),
    ("Flowsik", "We On", "Show Me the Money 777"),
    ("Reddy", "Think", "Show Me the Money 777"),
    ("KittiB", "Nobody Knows", "Show Me the Money 777"),
    ("Koonta", "Unbreakable", "Show Me the Money 8"),
    ("NO:EL", "Rain Drop 2", "Rain Drop 2"),
    ("Blued", "Blue", "Blue"),
    ("E-Sens", "이상형", "The Anecdote"),
    ("San E", "Story of Someone I Know", "Ready for Showtime"),
    ("Vasco", "The Vasco", "The Vasco"),
    ("Outsider", "Vol.2-Maestro 3", "Vol.2-Maestro 3"),
    ("MC Meta", "On My Own", "The Blue Printz"),
    ("Rhymer", "Brand New Day", "Rhymer Trax Vol.1"),
    ("Double K", "Fly High", "Fly High"),
    ("Pe2ny", "Pe2ny Maker", "Pe2ny Maker"),
    ("TBNY", "Million", "Million"),
    ("Stuck B", "Stuck B", "Stuck B"),
    ("Crown J", "My Friend", "My Friend"),
    ("L.E.O.", "Show Must Go On", "Show Must Go On"),
    ("Mad Clown", "Loving U", "Heoteoge Sarang"),
    ("Tiger JK", "Payback", "Feel gHood Muzik : The 8th Wonderland"),
    ("Leessang", "The Rain", "Unplugged on the Sofa"),
    ("Phantom", "Bubble Love", "Phantom City"),
    ("MellowD", "On My Way", "On My Way"),
    ("Verbal Jint", "Mainstream", "Mainstream"),
    ("Geeks", "Officially Missing You", "Officially Missing You"),
    ("Bumkey", "Single Life", "Single Life"),
    ("Junggigo", "Rookie", "Rookie"),
    ("Don Mills", "Don Mills Is Angry 3", "Don Mills Is Angry 3"),
    ("Myun Do One", "Bulldozer", "Myun Do One Is Back"),
    ("J'Kyun", "Ready to Fly", "Ready to Fly"),
    ("Illinit", "Ill Street", "Illmatic"),
    ("Sean2Slow", "Slow Jam", "Slow Jam"),
    ("JJK", "Go Back", "Go-Back"),
    ("Baechigi", "Shark's Tale", "Shark's Tale"),
    ("Dok2", "Dok2ocracy", "Dok2ocracy"),
    ("GroovyRoom", "Brought the Heat Back", "Brought the Heat Back"),
    ("Lee Young Ji", "Untouchable", "Untouchable"),
    ("Dynamic Duo", "Untouchable", "Untouchable"),
    ("Heize", "Forgotten Love", "Last Winter"),
    ("Kid Milli", "BORA", "BEIGE"),
    ("Leellamarz", "Russian Roulette", "Life is Once"),
    ("Crush", "EZPZ", "wonderego"),
    ("Loco", "Pick Pick", "WEAK"),
    ("Loco", "BROKEN IPHONE", "WEAK"),
    ("Beenzino", "Travel Again", "NOWITZKI"),
    ("Beenzino", "990", "NOWITZKI"),
    ("Jessi", "Gum", "Gum"),
    ("Sik-K", "NEONBEAM", "FL1X"),
    ("Zion.T", "NOT FOR SALE", "Zip"),
    ("Zion.T", "Whale", "Zip"),
    ("Paloalto", "Mood Indigo", "Mood Indigo"),
    ("TOIL", "Money", "1989"),
    ("Swings", "Brand New Day", "Upgrade III"),
    ("Mirani", "Baby Steps", "Show Me the Money 10"),
    ("Woodie Gochild", "WaRRior", "Show Me the Money 8"),
    ("Owen Ovadoz", "119", "119"),
    ("Blase", "Blue", ""),
    ("Sokodomo", "IF I", "Show Me the Money 8"),
    ("Lil Boi", "Good Day", "Show Me the Money 10"),
    ("BE'O", "Luxury", "Show Me the Money 10"),
    ("Lee Young Ji", "O.K?", "O.K?"),
    ("Tablo", "Fantasy", "Drill Presents: Tablo x Fantasy"),
    ("Primary", "2", "2"),
    ("Nafla", "Swervin", "C.R.E.A.M"),
    ("Loopy", "Save", "[ Album ]"),
    ("YUMDDA", "Shake", "I'm Good"),
    ("Hash Swan", "Retro Love", ""),
    ("Jvcki Wai", "Neo Eve", "Exposure"),
    ("Mudd the student", "Open", "Show Me the Money 8"),
    ("BewhY", "Forever", "The Fiery"),
    ("Penomeco", "OFM", ""),
    ("Simon Dominic", "DAx4", "DAx4"),
    ("Gaeko", "West Coast", "Redingray"),
    ("Deepflow", "Flow the Life 3", "Flow the Life 3"),
    ("Huckleberry P", "Woofer", "Mantra 3"),
    ("D.Ark", "Undercover", "Genius"),
    ("Koonta", "Grandma", "Show Me the Money 8"),
    ("Kid Milli", "Simple Poem", "BEIGE"),
    ("Coogie", "I Go", "DIFF"),
    ("Leellamarz", "Can't stop", "DAYDATE"),
    ("Epik High", "Catch", "Strawberry"),
    ("Heize", "Lips", "Last Winter"),
    ("Punchnello", "Everyday", "Everyday"),
    ("Colde", "Reno", ""),
    ("Giriboy", "PlanetariuM", "Engineering"),
    ("Ash Island", "Floating", "ISLAND"),
    ("Paloalto", "Valentina", ""),
    ("Changmo", "Just the Two of Us", ""),
]:
    add(2023, a, t, al)

# ── 2024 must hits ──
add(2024, "G-Dragon", "HOME SWEET HOME (Feat. 태양, 대성)", "Übermensch", 0)
add(2024, "Beenzino", "Train", "", 0)
add(2024, "Changmo", "Wonderful Days", "", 0)
add(2024, "Lil Moshpit", "K-FLIP", "K-FLIP+", 0)
add(2024, "Qwala", "ㅍㅍㅍㅍ (Feat. Kid Milli)", "ㅍㅍㅍㅍ", 0)
add(2024, "Sokodomo", "SIGNATURE", "Show Me the Money 10", 0)

for a, t, al in [
    ("G-Dragon", "POWER", "Übermensch"),
    ("G-Dragon", "TAKE ME", "Übermensch"),
    ("Zico", "SPOT!", ""),
    ("Zico", "ZOOM", ""),
    ("Changmo", "ZOOM", ""),
    ("Lil Moshpit", "KC2", "K-FLIP+"),
    ("Lil Moshpit", "LALALA", "K-FLIP+"),
    ("Qwala", "If WONA becomes a gangster (Feat. Qwala, New Champ)", ""),
    ("Qwala", "델러가 (Feat. MELOH & Posadic)", "yorter"),
    ("Sokodomo", "Merry Go Round", "Merry Go Round"),
    ("Kid Milli", "5AM", "RAD MILLI"),
    ("Kid Milli", "술", "RAD MILLI"),
    ("Dean", "NASA", "3:33"),
    ("Dean", "Ctrl", "3:33"),
    ("Jay Park", "Taxi Blurr", ""),
    ("Jay Park", "Stand Out", ""),
    ("Loco", "random summer night", ""),
    ("Loco", "Smeraldo Garden Marching Band", ""),
    ("Crush", "Yes or No", ""),
    ("Crush", "Fallin'", ""),
    ("Heize", "Even if", ""),
    ("Leellamarz", "Let me go to heaven", ""),
    ("Leellamarz", "GONE", ""),
    ("The Quiett", "LF Intro", "Luxury Flow"),
    ("The Quiett", "Look Inside", "Luxury Flow"),
    ("Bobby", "Sae", "Sir.Robert"),
    ("Bobby", "Moon", "Sir.Robert"),
    ("Coogie", "ON FIRE", ""),
    ("Coogie", "Flame", "UPSET"),
    ("PH-1", "FLAT COKE", ""),
    ("PH-1", "GOSHA", "WHAT HAVE WE DONE"),
    ("Paloalto", "GONE", ""),
    ("Punchnello", "before you", ""),
    ("Colde", "Reno", ""),
    ("Gray", "SLIDIN'", ""),
    ("Giriboy", "heat", "heat"),
    ("Dynamic Duo", "Highfive", ""),
    ("Epik High", "Stop the Rain", ""),
    ("Ash Island", "Malibu", "Ash Island"),
    ("TOIL", "염염상망", ""),
    ("Blase", "INDUSTRY", "SELF MADE"),
    ("Blase", "12345678", "SELF MADE"),
    ("Mirani", "Drama", "Drama"),
    ("Woodie Gochild", "GOchild", "#GOchild"),
    ("Owen Ovadoz", "Freeze", "119"),
    ("BE'O", "Momentum", "Show Me the Money 10"),
    ("Lee Young Ji", "Yumeyo", "16"),
    ("Jessi", "Who Dat B", "Who Dat B"),
    ("Sik-K", "MAKE OUT", "MAKE OUT"),
    ("Tablo", "Stop the Rain", ""),
    ("Primary", "Morning Glory", ""),
    ("Nafla", "MVP", "[ Album ]"),
    ("Loopy", "DOPE", "SEOUL pt.A"),
    ("Loopy", "DEAD MAN WALKING", "SEOUL pt.A"),
    ("YUMDDA", "Tic Toc", "I'm Good"),
    ("Hash Swan", "Hash Brand", "Hash Brand"),
    ("Jvcki Wai", "Taxi Blurr", "Taxi Blurr"),
    ("Mudd the student", "Sleepy Beauty", ""),
    ("BewhY", "Cult of Curiosity", "Cult of Curiosity"),
    ("Penomeco", "COCO BOTTLE", ""),
    ("Simon Dominic", "Simon Dominic Part 3", "Simon Dominic Part 3"),
    ("Gaeko", "Gajah", "Gajah"),
    ("Deepflow", "Flow the Life 3", "Flow the Life 3"),
    ("Huckleberry P", "Mantra 3", "Mantra 3"),
    ("D.Ark", "Genius", "Genius"),
    ("Swings", "Per se", "Per se"),
    ("Lil Boi", "Empty Head", ""),
    ("Mino", "Trigger", "XX"),
    ("Zion.T", "Snooze", "Zion.T Special: OO"),
    ("Heize", "비도 오고 그래서", "///"),
    ("Crush", "None", "From Midnight To Sunrise"),
    ("Loco", "Some", "Hero"),
    ("Gray", "Tik Tak Tok", ""),
    ("Punchnello", "Cool", "Cool"),
    ("Colde", "In Your Eyes", "In Your Eyes"),
    ("Kid Milli", "Jab", "+"),
    ("82MAJOR", "뭘 봐 (TAKEOVER)", "X-82"),
    ("82MAJOR", "Stuck", "Beat Road"),
    ("Don Malik", "THURSDAYCLUB MIXTAPE", "THURSDAYCLUB MIXTAPE"),
    ("PH-1", "WHAT HAVE WE DONE", "WHAT HAVE WE DONE"),
    ("Coogie", "Shut Up", "UPSET"),
    ("Changmo", "HOLDUP", "Op.1"),
    ("Leellamarz", "Hell yea", "L&B"),
    ("The Quiett", "Crystal Crates", "Luxury Flow"),
    ("Bobby", "Intro", "Sir.Robert"),
    ("Epik High", "Born Hater", "Shoebox"),
    ("Epik High", "헤픈 엔딩", "Shoebox"),
    ("Swings", "Upgrade III", "Upgrade III"),
    ("Giriboy", "Mechanical Album", "Mechanical Album"),
    ("Ash Island", "ISLAND", "ISLAND"),
    ("Mirani", "Ticket", "Ticket"),
    ("Woodie Gochild", "Mood Swings", "#GOchild"),
    ("Owen Ovadoz", "Drama", "Drama"),
    ("Blase", "Passionfruit", ""),
    ("Sokodomo", "Winner", "Show Me the Money 10"),
    ("BE'O", "Healing", "Show Me the Money 10"),
    ("Lee Young Ji", "Not Sure", "16"),
    ("Jessi", "Zoom", ""),
    ("Sik-K", "Wet", "MAKE OUT"),
    ("Tablo", "Champagne", "Epik High Is Here 下, Part 2"),
    ("Nafla", "Jazz Freestyle", "[ Album ]"),
    ("Loopy", "CROWN", "SEOUL pt.A"),
    ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
    ("Mudd the student", "Nectar", "Show Me the Money 10"),
    ("BewhY", "Day Day", "The Movie Star"),
    ("Simon Dominic", "Make Her Dance", "Simon Dominic Part 3"),
    ("Deepflow", "Come Back Home", "Flow the Life 3"),
    ("Huckleberry P", "Woofer", "Mantra 3"),
    ("D.Ark", "Undercover", "Genius"),
    ("Swings", "Remedy", "Remedy"),
    ("Lil Boi", "ONFleek", "Show Me the Money 9"),
    ("Mino", "Fiancé", "XX"),
    ("Zion.T", "Yanghwa Bridge", "Zion.T Special: OO"),
    ("Heize", "Jenga", "Jenga"),
    ("Loco", "Hero", "Hero"),
    ("Giriboy", "Aquadotted", "heat"),
    ("Dynamic Duo", "Smoke", "ECO"),
    ("Kid Milli", "Bet", "++"),
    ("Leellamarz", "Two Pills", "STILL YOUNG BOY L"),
    ("The Quiett", "Ocean View", "Luxury Flow"),
    ("Bobby", "Why Stop Now", "Sir.Robert"),
    ("Coogie", "Spaceship", "UPSET"),
    ("Changmo", "ANTHEM", "Op.1"),
    ("Blase", "KKUCKDARI", "SELF MADE"),
    ("Mirani", "Pepsi", ""),
    ("Woodie Gochild", "Dirtbag", "#GOchild"),
    ("Owen Ovadoz", "119", "119"),
    ("BE'O", "Countdown", "Show Me the Money 10"),
    ("Jessi", "Cold Blooded", "Cold Blooded"),
    ("Sik-K", "Brought the Heat Back", "Brought the Heat Back"),
    ("Primary", "BILLING", "BILLING"),
    ("Loopy", "PINK SPILL", "SEOUL pt.A"),
    ("YUMDDA", "Shake", "I'm Good"),
    ("Jvcki Wai", "Neo Eve", "Exposure"),
    ("Penomeco", "Shy (수줍)", "Shy"),
    ("Gaeko", "Sturgis", "Sturgis"),
    ("Lil Moshpit", "MADE IN KCOREA", "K-FLIP+"),
    ("G-Dragon", "Bonamana", "Übermensch"),
    ("Jay Park", "Mayday", "THE ONE YOU WANTED"),
    ("Loco", "ON FIRE", ""),
    ("Crush", "Fallin'", "From Midnight To Sunrise"),
    ("Heize", "Fallin'", "From Midnight To Sunrise"),
    ("Leellamarz", "Japan", "STILL YOUNG BOY L"),
    ("Paloalto", "Valentina", ""),
    ("Gray", "Real Love", "Remedy"),
    ("Giriboy", "Different", "Different"),
    ("Ash Island", "Howling", "Ash Island"),
    ("TOIL", "ON FIRE", "1989"),
    ("Blase", "BREAKERS", "SELF MADE"),
    ("Mirani", "Bayer Dynamic", "Ticket"),
    ("Woodie Gochild", "Channel Surfing", "#GOchild"),
    ("Owen Ovadoz", "Diamond", "119"),
    ("Blase", "Love Me", "Passionfruit"),
    ("Sokodomo", "IF I", "Show Me the Money 8"),
    ("BE'O", "Luxury", "Show Me the Money 10"),
    ("Lee Young Ji", "WITCH", "Witch"),
    ("Jessi", "Gum", "Gum"),
    ("Sik-K", "FL1X", "FL1X"),
    ("Primary", "2", "2"),
    ("Nafla", "C.R.E.A.M", "C.R.E.A.M"),
    ("Loopy", "BAD KUROMI GAL", "SEOUL pt.A"),
    ("Hash Swan", "Retro Love", ""),
    ("Mudd the student", "Open", "Show Me the Money 8"),
    ("BewhY", "Forever", "The Movie Star"),
    ("Penomeco", "Lovers", "Shy"),
    ("Simon Dominic", "ART OF PARTYING", "NO OPEN FLAME"),
    ("Gaeko", "Geon Gangs", "Geon Gangs"),
    ("Swings", "Growing Pains 2", "Growing Pains 2"),
    ("Lil Boi", "Wave", "Show Me the Money 10"),
    ("Lil Boi", "Good Day", "Show Me the Money 10"),
    ("Don Malik", "MADE IN SEOUL", "MADE IN SEOUL"),
    ("Kid Milli", "Summer Time", "RAD MILLI"),
    ("Kid Milli", "Feel Good", "RAD MILLI"),
    ("Dean", "D (Half Moon)", "130 Mood : TRBL"),
    ("Jay Park", "Gimme A Minute", "THE ONE YOU WANTED"),
    ("Loco", "random summer night", ""),
    ("Punchnello", "Motive", ""),
    ("Colde", "Wave", ""),
    ("Changmo", "HOLDUP", "Op.1"),
    ("Leellamarz", "L & B", "L&B"),
    ("The Quiett", "King Is Back", "Luxury Flow"),
    ("Bobby", "Harmless", "Sir.Robert"),
    ("Coogie", "BABYFACE", "UPSET"),
    ("PH-1", "PARTY PPL", "WHAT HAVE WE DONE"),
    ("Epik High", "Frost", "Strawberry"),
    ("Ash Island", "Limousine Vision", "Ash Island"),
    ("Mirani", "Villain", "Show Me the Money 10"),
    ("Woodie Gochild", "Mud", "Show Me the Money 10"),
    ("Owen Ovadoz", "Diana", "Show Me the Money 10"),
    ("Blase", "ONOFF", "Show Me the Money 10"),
    ("Blase", "Blue", ""),
    ("Lee Young Ji", "O.K?", "O.K?"),
    ("Tablo", "Fantasy", "Drill Presents: Tablo x Fantasy"),
    ("Nafla", "Swervin", "C.R.E.A.M"),
    ("Loopy", "YOU'D BETTER", "SEOUL pt.A"),
    ("E-Sens", "이상형", "The Anecdote"),
    ("San E", "a SONG of ICE and FIRE", "a SONG of ICE and FIRE"),
    ("Vasco", "The Vasco", "The Vasco"),
    ("Outsider", "Vol.2-Maestro 3", "Vol.2-Maestro 3"),
    ("MC Meta", "On My Own", "The Blue Printz"),
    ("Rhymer", "Brand New Day", "Rhymer Trax Vol.1"),
    ("Double K", "Fly High", "Fly High"),
    ("Pe2ny", "Pe2ny Maker", "Pe2ny Maker"),
    ("TBNY", "Million", "Million"),
    ("Stuck B", "Stuck B", "Stuck B"),
    ("Crown J", "My Friend", "My Friend"),
    ("L.E.O.", "Show Must Go On", "Show Must Go On"),
    ("Mad Clown", "Loving U", "Heoteoge Sarang"),
    ("Tiger JK", "Payback", "Feel gHood Muzik : The 8th Wonderland"),
    ("Leessang", "The Rain", "Unplugged on the Sofa"),
    ("Phantom", "Bubble Love", "Phantom City"),
    ("MellowD", "On My Way", "On My Way"),
    ("Verbal Jint", "Mainstream", "Mainstream"),
    ("Geeks", "Officially Missing You", "Officially Missing You"),
    ("Bumkey", "Single Life", "Single Life"),
    ("Junggigo", "Rookie", "Rookie"),
    ("Don Mills", "Don Mills Is Angry 3", "Don Mills Is Angry 3"),
    ("Myun Do One", "Bulldozer", "Myun Do One Is Back"),
    ("J'Kyun", "Ready to Fly", "Ready to Fly"),
    ("Illinit", "Ill Street", "Illmatic"),
    ("Sean2Slow", "Slow Jam", "Slow Jam"),
    ("JJK", "Go Back", "Go-Back"),
    ("Baechigi", "Shark's Tale", "Shark's Tale"),
    ("Dok2", "Dok2ocracy", "Dok2ocracy"),
    ("Blued", "Blue", "Blue"),
    ("NO:EL", "Rain Drop 2", "Rain Drop 2"),
    ("Kid Ash", "Orca", "Orca-Tape"),
    ("C Jamm", "Monster", ""),
    ("Olltii", "Creative Control", "Creative Control"),
    ("Flowsik", "We On", "Show Me the Money 777"),
    ("Reddy", "Think", "Show Me the Money 777"),
    ("KittiB", "Nobody Knows", "Show Me the Money 777"),
    ("Koonta", "Unbreakable", "Show Me the Money 8"),
    ("Koonta", "Grandma", "Show Me the Money 8"),
]:
    add(2024, a, t, al)

# ── 2025 must hits ──
add(2025, "G-Dragon", "Too Bad", "Übermensch", 0)
add(2025, "PH-1", "GOSHA", "WHAT HAVE WE DONE", 0)
add(2025, "Lil Moshpit", "K-FLIP", "K-FLIP+", 0)
add(2025, "TOIL", "염염상망", "", 0)
add(2025, "Loopy", "DOPE", "SEOUL pt.A", 0)
add(2025, "Beenzino", "Train", "", 0)
add(2025, "Changmo", "HOLDUP", "Op.1", 0)
add(2025, "Sokodomo", "SIGNATURE", "Show Me the Money 10", 0)

for a, t, al in [
    ("G-Dragon", "Drama", "Übermensch"),
    ("G-Dragon", "Ibelongiiu", "Übermensch"),
    ("G-Dragon", "Gyro-Drop", "Übermensch"),
    ("PH-1", "Show Must Go On", ""),
    ("PH-1", "WHAT HAVE WE DONE", "WHAT HAVE WE DONE"),
    ("Coogie", "Flame", "UPSET"),
    ("Coogie", "Shut Up", "UPSET"),
    ("Zico", "Shut Up", "UPSET"),
    ("Zico", "SPOT!", ""),
    ("Loco", "Matcha High", ""),
    ("Loco", "work++", "SCRAPS"),
    ("Loco", "Dam", "SCRAPS"),
    ("Loco", "OMG", "SCRAPS"),
    ("Jay Park", "Keep It Sexy", ""),
    ("Jay Park", "Remedy", ""),
    ("Crush", "UP ALL NITE", "FANG"),
    ("Crush", "2-5-1", "FANG"),
    ("Crush", "FREQUENCY", "FANG"),
    ("Crush", "MALIBU", "FANG"),
    ("Blase", "INDUSTRY", "SELF MADE"),
    ("Blase", "12345678", "SELF MADE"),
    ("Blase", "CANVAS", "SELF MADE"),
    ("Blase", "MANIFESTER", "SELF MADE"),
    ("Heize", "Love Virus", "LOVE VIRUS Pt.1"),
    ("Heize", "Last Taxi", "LOVE VIRUS Pt.1"),
    ("Heize", "All Because of You", "LOVE VIRUS Pt.1"),
    ("Heize", "Even if", ""),
    ("Gray", "SLIDIN'", ""),
    ("Gray", "Real Love", "Remedy"),
    ("Dean", "Nocturne 07 (for aerse)", ""),
    ("Dean", "Ctrl", "3:33"),
    ("Changmo", "ANTHEM", "Op.1"),
    ("Changmo", "Fadeout", "Op.2"),
    ("Changmo", "Intermezzo", "Op.2"),
    ("Zion.T", "LOVE ME", "POSER"),
    ("Zion.T", "Heroine", "POSER"),
    ("Zion.T", "Suspicious", "POSER"),
    ("Zion.T", "Fish", "POSER"),
    ("Lil Moshpit", "KC2", "K-FLIP+"),
    ("Lil Moshpit", "LALALA", "K-FLIP+"),
    ("Lil Moshpit", "SELF HATE", "K-FLIP+"),
    ("Tablo", "Stop the Rain", ""),
    ("Epik High", "Stop the Rain", ""),
    ("Colde", "Reno", ""),
    ("Punchnello", "F", ""),
    ("Punchnello", "Midnight Glow", ""),
    ("Loopy", "DEAD MAN WALKING", "SEOUL pt.A"),
    ("Loopy", "BAD KUROMI GAL", "SEOUL pt.A"),
    ("Loopy", "YOU'D BETTER", "SEOUL pt.A"),
    ("Beenzino", "Trippy", "NOWITZKI"),
    ("Kid Milli", "5AM", "RAD MILLI"),
    ("Kid Milli", "술", "RAD MILLI"),
    ("Leellamarz", "Let me go to heaven", ""),
    ("Leellamarz", "GONE", ""),
    ("Sokodomo", "Merry Go Round", "Merry Go Round"),
    ("Qwala", "If WONA becomes a gangster (Feat. Qwala, New Champ)", ""),
    ("Qwala", "ㅍㅍㅍㅍ (Feat. Kid Milli)", "ㅍㅍㅍㅍ"),
    ("The Quiett", "King Is Back", "Luxury Flow"),
    ("The Quiett", "Mercedes", "Luxury Flow"),
    ("Paloalto", "GONE", ""),
    ("Paloalto", "Valentina", ""),
    ("Giriboy", "Engineering", "Engineering"),
    ("Giriboy", "PlanetariuM", "Engineering"),
    ("Dynamic Duo", "AEAO", "A DynamicAffair"),
    ("Dynamic Duo", "Highfive", ""),
    ("Ash Island", "Malibu", "Ash Island"),
    ("Ash Island", "Howling", "Ash Island"),
    ("Mirani", "Villain", "Show Me the Money 10"),
    ("Mirani", "Baby Steps", "Show Me the Money 10"),
    ("Woodie Gochild", "Mud", "Show Me the Money 10"),
    ("Woodie Gochild", "WaRRior", "Show Me the Money 8"),
    ("Owen Ovadoz", "Diana", "Show Me the Money 10"),
    ("Owen Ovadoz", "119", "119"),
    ("BE'O", "Countdown", "Show Me the Money 10"),
    ("BE'O", "Luxury", "Show Me the Money 10"),
    ("Lee Young Ji", "WITCH", "Witch"),
    ("Lee Young Ji", "O.K?", "O.K?"),
    ("Jessi", "Cold Blooded", "Cold Blooded"),
    ("Jessi", "Gum", "Gum"),
    ("Sik-K", "Brought the Heat Back", "Brought the Heat Back"),
    ("Sik-K", "FL1X", "FL1X"),
    ("Primary", "BILLING", "BILLING"),
    ("Primary", "2", "2"),
    ("Nafla", "C.R.E.A.M", "C.R.E.A.M"),
    ("Nafla", "Swervin", "C.R.E.A.M"),
    ("YUMDDA", "Tic Toc", "I'm Good"),
    ("YUMDDA", "Shake", "I'm Good"),
    ("Hash Swan", "Hash Brand 2", "Hash Brand 2"),
    ("Hash Swan", "Retro Love", ""),
    ("Jvcki Wai", "Taxi Blurr", "Taxi Blurr"),
    ("Jvcki Wai", "Neo Eve", "Exposure"),
    ("Mudd the student", "Nectar", "Show Me the Money 10"),
    ("Mudd the student", "Sleepy Beauty", ""),
    ("BewhY", "Day Day", "The Movie Star"),
    ("BewhY", "Forever", "The Movie Star"),
    ("Penomeco", "Shy (수줍)", "Shy"),
    ("Penomeco", "Lovers", "Shy"),
    ("Simon Dominic", "Make Her Dance", "Simon Dominic Part 3"),
    ("Simon Dominic", "ART OF PARTYING", "NO OPEN FLAME"),
    ("Gaeko", "Gajah", "Gajah"),
    ("Gaeko", "Sturgis", "Sturgis"),
    ("Deepflow", "Come Back Home", "Flow the Life 3"),
    ("Deepflow", "Freestyle", ""),
    ("Huckleberry P", "Mantra 3", "Mantra 3"),
    ("Huckleberry P", "Woofer", "Mantra 3"),
    ("D.Ark", "Genius", "Genius"),
    ("D.Ark", "Undercover", "Genius"),
    ("Swings", "Growing Pains 2", "Growing Pains 2"),
    ("Swings", "Brand New Day", "Upgrade III"),
    ("Lil Boi", "Wave", "Show Me the Money 10"),
    ("Lil Boi", "Good Day", "Show Me the Money 10"),
    ("Don Malik", "THURSDAYCLUB MIXTAPE", "THURSDAYCLUB MIXTAPE"),
    ("Don Malik", "49", "49"),
    ("82MAJOR", "뭘 봐 (TAKEOVER)", "X-82"),
    ("82MAJOR", "FIRST CLASS", "ON"),
    ("PLT", "Summer", "Summer"),
    ("PLT", "Way Back Home", "Way Back Home"),
    ("Jay Park", "McNasty", ""),
    ("Jay Park", "Candy", ""),
    ("Epik High", "Strawberry", "Strawberry"),
    ("Epik High", "On My Way", "Strawberry"),
    ("Kid Milli", "Summer Time", "RAD MILLI"),
    ("Kid Milli", "Feel Good", "RAD MILLI"),
    ("Coogie", "BABYFACE", "UPSET"),
    ("Coogie", "Arikari", "UPSET"),
    ("Changmo", "If I Had Time", "Op.2"),
    ("Changmo", "Wonderful Days", ""),
    ("Zion.T", "CLOSER", "POSER"),
    ("Zion.T", "NOT FOR SALE", "Zip"),
    ("Dean", "NASA", "3:33"),
    ("Heize", "You made Me", "LOVE VIRUS Pt.1"),
    ("Heize", "The Last Hello", "LOVE VIRUS Pt.1"),
    ("Crush", "MAMMAMIA", "FANG"),
    ("Crush", "OVERLAP", "FANG"),
    ("Loco", "Papago", "SCRAPS"),
    ("Loco", "automatic", "SCRAPS"),
    ("Gray", "Summer Night", "Remedy"),
    ("Gray", "Remedy", ""),
    ("Giriboy", "heat", "heat"),
    ("Giriboy", "Vice Versa", "Vice Versa"),
    ("Dynamic Duo", "ECO", "ECO"),
    ("Dynamic Duo", "Smoke", "ECO"),
    ("Mino", "Smoke", "BODY"),
    ("Mino", "Aero", "BODY"),
    ("Bobby", "Drowning", "S.i.R"),
    ("Bobby", "Cherry Blossom", "S.i.R"),
    ("Tablo", "Champagne", "Epik High Is Here 下, Part 2"),
    ("Tablo", "Fantasy", "Drill Presents: Tablo x Fantasy"),
    ("Primary", "Morning Glory", ""),
    ("Nafla", "MVP", "[ Album ]"),
    ("Loopy", "CROWN", "SEOUL pt.A"),
    ("Loopy", "PINK SPILL", "SEOUL pt.A"),
    ("E-Sens", "이상형", "The Anecdote"),
    ("San E", "a SONG of ICE and FIRE", "a SONG of ICE and FIRE"),
    ("Vasco", "The Vasco", "The Vasco"),
    ("Outsider", "Vol.2-Maestro 3", "Vol.2-Maestro 3"),
    ("MC Meta", "On My Own", "The Blue Printz"),
    ("Rhymer", "Brand New Day", "Rhymer Trax Vol.1"),
    ("Double K", "Fly High", "Fly High"),
    ("Pe2ny", "Pe2ny Maker", "Pe2ny Maker"),
    ("TBNY", "Million", "Million"),
    ("Stuck B", "Stuck B", "Stuck B"),
    ("Crown J", "My Friend", "My Friend"),
    ("L.E.O.", "Show Must Go On", "Show Must Go On"),
    ("Mad Clown", "Loving U", "Heoteoge Sarang"),
    ("Tiger JK", "Payback", "Feel gHood Muzik : The 8th Wonderland"),
    ("Leessang", "The Rain", "Unplugged on the Sofa"),
    ("Phantom", "Bubble Love", "Phantom City"),
    ("MellowD", "On My Way", "On My Way"),
    ("Verbal Jint", "Mainstream", "Mainstream"),
    ("Geeks", "Officially Missing You", "Officially Missing You"),
    ("Bumkey", "Single Life", "Single Life"),
    ("Junggigo", "Rookie", "Rookie"),
    ("Don Mills", "Don Mills Is Angry 3", "Don Mills Is Angry 3"),
    ("Myun Do One", "Bulldozer", "Myun Do One Is Back"),
    ("J'Kyun", "Ready to Fly", "Ready to Fly"),
    ("Illinit", "Ill Street", "Illmatic"),
    ("Sean2Slow", "Slow Jam", "Slow Jam"),
    ("JJK", "Go Back", "Go-Back"),
    ("Baechigi", "Shark's Tale", "Shark's Tale"),
    ("Dok2", "Dok2ocracy", "Dok2ocracy"),
    ("Blued", "Blue", "Blue"),
    ("NO:EL", "Rain Drop 2", "Rain Drop 2"),
    ("Kid Ash", "Orca", "Orca-Tape"),
    ("C Jamm", "Monster", ""),
    ("Olltii", "Creative Control", "Creative Control"),
    ("Flowsik", "We On", "Show Me the Money 777"),
    ("Reddy", "Think", "Show Me the Money 777"),
    ("KittiB", "Nobody Knows", "Show Me the Money 777"),
    ("Koonta", "Unbreakable", "Show Me the Money 8"),
    ("Koonta", "Grandma", "Show Me the Money 8"),
    ("Mudd the student", "Open", "Show Me the Money 8"),
    ("Woodie Gochild", "GOchild", "#GOchild"),
    ("Woodie Gochild", "Dirtbag", "#GOchild"),
    ("Mirani", "Drama", "Drama"),
    ("Mirani", "Pepsi", ""),
    ("Owen Ovadoz", "Freeze", "119"),
    ("Owen Ovadoz", "Diamond", "119"),
    ("Blase", "Passionfruit", ""),
    ("Blase", "Love Me", "Passionfruit"),
    ("Sokodomo", "Winner", "Show Me the Money 10"),
    ("Sokodomo", "IF I", "Show Me the Money 8"),
    ("BE'O", "Momentum", "Show Me the Money 10"),
    ("BE'O", "Healing", "Show Me the Money 10"),
    ("Lee Young Ji", "Yumeyo", "16"),
    ("Lee Young Ji", "Not Sure", "16"),
    ("Jessi", "Who Dat B", "Who Dat B"),
    ("Jessi", "Zoom", ""),
    ("Sik-K", "MAKE OUT", "MAKE OUT"),
    ("Sik-K", "Wet", "MAKE OUT"),
    ("Swings", "Per se", "Per se"),
    ("Swings", "Remedy", "Remedy"),
    ("Lil Boi", "Empty Head", ""),
    ("Lil Boi", "ONFleek", "Show Me the Money 9"),
    ("Mino", "Trigger", "XX"),
    ("Mino", "Fiancé", "XX"),
    ("Zion.T", "Snooze", "Zion.T Special: OO"),
    ("Zion.T", "Yanghwa Bridge", "Zion.T Special: OO"),
    ("Dean", "D (Half Moon)", "130 Mood : TRBL"),
    ("Heize", "비도 오고 그래서", "///"),
    ("Heize", "Jenga", "Jenga"),
    ("Crush", "None", "From Midnight To Sunrise"),
    ("Loco", "Some", "Hero"),
    ("Loco", "Hero", "Hero"),
    ("Gray", "Tik Tak Tok", ""),
    ("Punchnello", "Cool", "Cool"),
    ("Colde", "In Your Eyes", "In Your Eyes"),
    ("Kid Milli", "Jab", "+"),
    ("Kid Milli", "Bet", "++"),
    ("Leellamarz", "Two Pills", "STILL YOUNG BOY L"),
    ("Leellamarz", "Japan", "STILL YOUNG BOY L"),
    ("The Quiett", "LF Intro", "Luxury Flow"),
    ("The Quiett", "Look Inside", "Luxury Flow"),
    ("Bobby", "Sae", "Sir.Robert"),
    ("Bobby", "Moon", "Sir.Robert"),
    ("Epik High", "Born Hater", "Shoebox"),
    ("Epik High", "헤픈 엔딩", "Shoebox"),
    ("Giriboy", "Mechanical Album", "Mechanical Album"),
    ("Giriboy", "Different", "Different"),
    ("Ash Island", "ISLAND", "ISLAND"),
    ("Ash Island", "Limousine Vision", "Ash Island"),
    ("Mirani", "Ticket", "Ticket"),
    ("Mirani", "Bayer Dynamic", "Ticket"),
    ("Woodie Gochild", "Mood Swings", "#GOchild"),
    ("Woodie Gochild", "Channel Surfing", "#GOchild"),
    ("Owen Ovadoz", "Drama", "Drama"),
    ("Blase", "ONOFF", "Show Me the Money 10"),
    ("Blase", "Blue", ""),
    ("PH-1", "PARTY PPL", "WHAT HAVE WE DONE"),
    ("PH-1", "FLAT COKE", ""),
    ("Coogie", "Spaceship", "UPSET"),
    ("Coogie", "Two Pills", "UPSET"),
    ("Lil Moshpit", "PUBLIC ENEMY", "K-FLIP+"),
    ("Lil Moshpit", "NEW ANTHEM", "K-FLIP+"),
    ("Don Malik", "MADE IN SEOUL", "MADE IN SEOUL"),
    ("82MAJOR", "Stuck", "Beat Road"),
    ("PLT", "Summer", "Summer"),
    ("Jay Park", "Stand Out", ""),
    ("Zico", "Earthquake", ""),
    ("Crush", "Yes or No", ""),
    ("Heize", "Love Virus", "LOVE VIRUS Pt.1"),
    ("Leellamarz", "Hell yea", "L&B"),
    ("The Quiett", "Crystal Crates", "Luxury Flow"),
    ("Paloalto", "Issues", "BUT FOR NOW LEAVE ME ALONE"),
    ("TOIL", "1989", "1989"),
    ("Swings", "Upgrade III", "Upgrade III"),
    ("Hash Swan", "Hash Brand", "Hash Brand"),
    ("Jvcki Wai", "Doughnet", "Exposure"),
    ("Penomeco", "COCO BOTTLE", ""),
    ("Simon Dominic", "Simon Dominic Part 3", "Simon Dominic Part 3"),
    ("Gaeko", "Geon Gangs", "Geon Gangs"),
    ("Deepflow", "Flow the Life 3", "Flow the Life 3"),
    ("BewhY", "Cult of Curiosity", "Cult of Curiosity"),
    ("Koonta", "KOONTA", "Show Me the Money 10"),
    ("NSW yoon", "Therapy + 으리으리 (Feat. 호미들)", "Show Me the Money 11"),
    ("노윤하", "Flick (Feat. BE'O, HAON)", "Show Me the Money 11"),
    ("잠bi노", "Bingo (Feat. 미노이, George)", "Show Me the Money 11"),
    ("QM", "Come To My Stu (Feat. 릴러말즈)", "Show Me the Money 11"),
    ("Don Malik", "눈 (EYE) (Feat. BIG Naughty, JUSTHIS)", "Show Me the Money 11"),
    ("허성현", "미운오리새끼 (Prod. R.Tee)", "Show Me the Money 11"),
    ("Kan", "나침반 (Feat. UNEDUCATED KID, Superbee)", "Show Me the Money 11"),
    ("이영지", "낫 쏘리 (Feat. pH-1)", "Show Me the Money 11"),
    ("Beenzino", "In Bed/막걸리", "NOWITZKI"),
    ("Don Malik", "MADE IN SEOUL", "MADE IN SEOUL"),
    ("Lil Moshpit", "TO GO", ""),
    ("82MAJOR", "Sure Thing", "ON"),
    ("Qwala", "델러가 (Feat. MELOH & Posadic)", "yorter"),
    ("Changmo", "ZOOM", ""),
    ("Sokodomo", "SIGNATURE", "Show Me the Money 10"),
]:
    add(2025, a, t, al)


def pick_year(year: int, used: set[str], exclude: set[str]) -> list[tuple[str, str, str]]:
    pool = [(a, t, al, pri) for y, a, t, al, pri in RAW if y == year]
    picked: list[tuple[str, str, str]] = []
    artist_count: dict[str, int] = {}
    keys: set[str] = set()

    def can(a: str, t: str) -> bool:
        k = norm_key(a, t)
        return (
            k not in used
            and k not in exclude
            and k not in keys
            and artist_count.get(a, 0) < MAX_PER_ARTIST
        )

    def do_add(a: str, t: str, al: str) -> None:
        k = norm_key(a, t)
        picked.append((a, t, al))
        keys.add(k)
        used.add(k)
        artist_count[a] = artist_count.get(a, 0) + 1

    for pri in (0, 1):
        for a, t, al, p in pool:
            if p != pri:
                continue
            if len(picked) >= TARGET:
                break
            if can(a, t):
                do_add(a, t, al)

    while len(picked) < TARGET:
        hangul_now = sum(1 for _, t, _ in picked if has_hangul(t))
        need_hangul = hangul_now < MIN_HANGUL
        progress = False
        for a, t, al, _ in pool:
            if len(picked) >= TARGET:
                break
            if need_hangul and not has_hangul(t):
                continue
            if can(a, t):
                do_add(a, t, al)
                progress = True
        if not progress:
            for a, t, al, _ in pool:
                if len(picked) >= TARGET:
                    break
                if can(a, t):
                    do_add(a, t, al)
                    progress = True
                    break
        if not progress:
            break
    return picked


def write_modules(catalog: dict[int, list[tuple[str, str, str]]]) -> None:
    for year, tracks in catalog.items():
        lines = ["TRACKS = ["]
        for a, t, al in tracks:
            lines.append(f"    ({a!r}, {t!r}, {al!r}),")
        lines.append("]")
        lines.append("")
        with open(os.path.join(HERE, f"y{year}.py"), "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines))


def validate(catalog: dict[int, list[tuple[str, str, str]]], exclude: set[str]) -> list[str]:
    used: set[str] = set()
    errors: list[str] = []
    for year in sorted(catalog):
        tracks = catalog[year]
        if len(tracks) != TARGET:
            errors.append(f"{year}: count {len(tracks)}")
        artist_count: dict[str, int] = {}
        hangul = 0
        year_keys: set[str] = set()
        for a, t, al in tracks:
            k = norm_key(a, t)
            if k in used:
                errors.append(f"{year}: cross dup {a} - {t}")
            if k in exclude:
                errors.append(f"{year}: global {a} - {t}")
            if k in year_keys:
                errors.append(f"{year}: in-year dup {a} - {t}")
            year_keys.add(k)
            used.add(k)
            artist_count[a] = artist_count.get(a, 0) + 1
            if has_hangul(t):
                hangul += 1
        for a, c in artist_count.items():
            if c > MAX_PER_ARTIST:
                errors.append(f"{year}: {a} has {c}")
        if len(artist_count) < MIN_ARTISTS:
            errors.append(f"{year}: {len(artist_count)} artists")
        if hangul < MIN_HANGUL:
            errors.append(f"{year}: hangul {hangul}/100")
        else:
            print(f"OK {year}: {len(artist_count)} artists, hangul {hangul}/100")
    return errors


def main() -> None:
    exclude = load_global_exclude()
    used: set[str] = set()
    catalog: dict[int, list[tuple[str, str, str]]] = {}
    for year in (2022, 2023, 2024, 2025):
        catalog[year] = pick_year(year, used, exclude)
    errors = validate(catalog, exclude)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    write_modules(catalog)
    print("Wrote y2022-y2025.py")


if __name__ == "__main__":
    main()
