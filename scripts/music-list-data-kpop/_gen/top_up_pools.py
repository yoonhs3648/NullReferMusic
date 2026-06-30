#!/usr/bin/env python3
"""Top up 2020/2024/2025 pools using global-seen filter."""
from __future__ import annotations

import importlib.util
import re
import unicodedata
from collections import Counter
from pathlib import Path

GEN = Path(__file__).parent
MAX_PER = 2
TARGET = 100


def track_key(artist: str, title: str) -> str:
    def norm(s: str) -> str:
        s = unicodedata.normalize("NFKC", s or "").lower().replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()

    return f"{norm(artist)}|{norm(title)}"


def load(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def get_raw():
    c1519 = load(GEN / "catalog_2015_2019.py")
    c1729 = load(GEN / "catalog_2017_2019.py")
    c2025 = load(GEN / "catalog_2020_2025.py")
    raw: dict[int, list] = {}
    raw.update(c1519.CATALOG_2015_2019)
    raw.update(c1729.CATALOG_2017_2019)
    raw.update(c2025.CATALOG_2020_2025)
    return raw


def global_seen_through(raw: dict, upto: int) -> set[str]:
    seen: set[str] = set()
    for year in range(2015, upto + 1):
        ac: Counter[str] = Counter()
        for artist, title, album in raw.get(year, []):
            if ac[artist] >= MAX_PER:
                continue
            k = track_key(artist, title)
            if k in seen:
                continue
            if len([t for t in raw.get(year, []) if track_key(t[0], t[1]) == k]) == 0:
                continue
            # simulate selection count
            sel = 0
            ac2: Counter[str] = Counter()
            for a2, t2, _ in raw.get(year, []):
                if sel >= TARGET:
                    break
                if ac2[a2] >= MAX_PER:
                    continue
                k2 = track_key(a2, t2)
                if k2 in seen:
                    continue
                if k2 == k:
                    sel += 1
                    break
                ac2[a2] += 1
                seen.add(k2)
                sel += 1
            else:
                if k not in seen and ac.get(artist, 0) < MAX_PER:
                    pass
    # simpler re-run finalize
    seen = set()
    for year in range(2015, upto + 1):
        ac = Counter()
        for artist, title, album in raw.get(year, []):
            if len([x for x in range(TARGET)]) and len([t for t in raw.get(year, [])]) > 0:
                pass
            if sum(1 for _ in []) == -1:
                pass
        result = []
        ac = Counter()
        for artist, title, album in raw.get(year, []):
            if len(result) >= TARGET:
                break
            if ac[artist] >= MAX_PER:
                continue
            k = track_key(artist, title)
            if k in seen:
                continue
            result.append((artist, title, album))
            ac[artist] += 1
            seen.add(k)
    return seen


def dedupe(pool: list) -> list:
    out, have = [], set()
    for t in pool:
        k = (t[0], t[1])
        if k in have:
            continue
        have.add(k)
        out.append(t)
    return out


def filter_new(candidates: list, seen: set[str]) -> list:
    out = []
    have: set[tuple[str, str]] = set()
    for artist, title, album in candidates:
        if (artist, title) in have:
            continue
        if track_key(artist, title) in seen:
            continue
        out.append((artist, title, album))
        have.add((artist, title))
    return out


EXTRA_2020 = [
    ("TWICE", "I Can't Stop Me", "Eyes wide open"),
    ("aespa", "Black Mamba", ""),
    ("DAY6", "Zombie", "The Book of Us : The Demon"),
    ("ENHYPEN", "Given-Taken", "BORDER : DAY ONE"),
    ("MONSTA X", "FANTASY", "FANTASIA X"),
    ("Weki Meki", "Dazzle Dazzle", ""),
    ("OH MY GIRL", "Nonstop", "NONSTOP"),
    ("fromis_9", "Feel Good (SECRET CODE)", "My Little Society"),
    ("WJSN", "Neverland", "Neverland"),
    ("Dreamcatcher", "Scream", "Dystopia: The Tree of Language"),
    ("LOONA", "Why Not?", "[12:00]"),
    ("Apink", "Dumhdurum", "Look"),
    ("CIX", "My My", ""),
    ("SuperM", "Tiger Inside", "Super One"),
    ("PENTAGON", "Dr. Bebe", "UNIVERSE : THE PROLOGUE"),
    ("Golden Child", "Dun Dun Dun", "Golden Age"),
    ("ONEUS", "TO BE OR NOT TO BE", "LIVED"),
    ("EXO", "Let Me In", ""),
    ("Rocket Punch", "Bouncy", "Blue Punch"),
    ("Cherry Bullet", "Hands Up", ""),
    ("Hyuna", "I'm Not Cool", "I'm Not Cool"),
    ("GFRIEND", "Apple", "回:Song of the Sirens"),
    ("Everglow", "LA DI DA", ""),
    ("ATEEZ", "Inception", "ZERO : FEVER Part.1"),
    ("TXT", "Can't You See Me?", "The Dream Chapter: ETERNITY"),
    ("NCT 127", "Punch", "NCT #Resonance Pt. 2"),
    ("Mamamoo", "Dingga", ""),
    ("TREASURE", "Boy", "THE FIRST STEP : CHAPTER ONE"),
    ("TREASURE", "I Love You", "THE FIRST STEP : CHAPTER TWO"),
    ("TREASURE", "Going Crazy", "THE FIRST STEP : CHAPTER ONE"),
    ("SuperM", "Jopping", "Super One"),
    ("NCT U", "Make A Wish (Birthday Song)", "Resonance Pt. 1"),
    ("WayV", "Take Off", "Take Off"),
    ("The Boyz", "The Stealer", "THE STEALER"),
    ("KARD", "Dumb Litty", "KARD 4th Mini Album"),
    ("IU", "eight (Prod.&feat. SUGA of BTS)", "eight"),
    ("BOL4", "Some", ""),
    ("AKMU", "Nakka", "NEXT EPISODE"),
    ("Heize", "HAPPEN", "HAPPEN"),
    ("Mamamoo", "Where Are We Now", "WAW"),
    ("Sunmi", "Gotta Go", "WARNING"),
    ("Taeyeon", "Four Seasons", "Purpose - The 2nd Studio Album"),
    ("Red Velvet", "Zimzalabim", "The ReVe Festival Day 1"),
    ("Red Velvet", "Umpah Umpah", "The ReVe Festival Day 2"),
    ("Paul Kim", "Me After You", ""),
    ("Sam Kim", "Make Up", ""),
    ("Younha", "Event Horizon", "UNSTABLE MINDSET"),
    ("Jannabi", "for lovers who hesitate", "LEGEND"),
    ("N.Flying", "Oh really?", "So, 通"),
    ("ONEWE", "Tag Me (@Me)", "ONE"),
    ("VERIVERY", "Thunder", "Truth or Dare"),
    ("D1CE", "HATE YOU", "Wake Up"),
    ("OnlyOneOf", "libidO", "Instinct, Part. 1"),
    ("Colde", "Your Dog Loves You", ""),
    ("Soran", "The Star", ""),
    ("George", "Where's Wool", ""),
    ("Hwa Sa", "Maria", "Maria"),
    ("Standing Egg", "Old Song", "Lip"),
    ("Ben", "From Ben", "Reality"),
    ("Im Chang-jung", "Nothing Like You", ""),
    ("Kim Feel", "All I Do", ""),
    ("Vibe", "Vibe", ""),
    ("Davichi", "Changmin's Not Here", ""),
    ("Zion.T", "No Love", ""),
    ("AKMU", "Happening", "HAPPENING"),
    ("Baekhyun", "Candy", "Delight - The 4th Mini Album"),
    ("Zico", "Any Song", ""),
    ("IU", "Blueming", "Love poem"),
    ("Mamamoo", "HIP", ""),
    ("ITZY", "WANNABE", ""),
    ("Kang Daniel", "2U", ""),
    ("Heize", "We don't talk together", "We don't talk together"),
    ("STAYC", "ASAP", ""),
    ("Brave Girls", "Rollin'", ""),
    ("ENHYPEN", "Drunk-Dazed", "BORDER : CARNIVAL"),
    ("P1Harmony", "Siren", "DISHARMONY : Stand Out"),
    ("CRAVITY", "Break all the Rules", "HIDEOUT: REMEMBER WHO WE ARE - PT.1"),
    ("DRIPPIN", "Young Blood", "Boyhood"),
    ("WEi", "Dondododo (Don't Hold Back)", ""),
    ("MCND", "nanana", "EARTH AGE"),
    ("A.C.E", "Favorite Boys", "HIGHER"),
    ("woo!ah!", "Purple", ""),
    ("TRI.BE", "RUB-A-DUM", ""),
    ("PURPLE KISS", "Zombie", ""),
    ("Billlie", "GingaMingaYo (the strange world)", "the Billage of perception: chapter two"),
    ("CLASS:y", "SHUT DOWN", "Day&Night"),
    ("YENA", "SMARTPHONE", "SMARTPHONE"),
    ("TEMPEST", "Bad News", "ON and ON"),
    ("Xdinary Heroes", "Happy Death Day", "Overload"),
    ("LIGHTSUM", "Vivace", "Into The Light AD MOMENTUM"),
    ("ONF", "Summer Poem", "ONF:MY NAME"),
    ("ONEUS", "LIT", "LIVED"),
    ("BVNDIT", "Jungle", "Carnival"),
    ("Victon", "Nostalgia", "Nostalgia"),
    ("SECRET NUMBER", "Who Dis?", ""),
    ("Weeekly", "Tag Me (@Me)", "We are"),
    ("GFRIEND", "MAGO", "回:Walpurgis Night"),
    ("GFRIEND", "Crossroads", "回:Song of the Sirens"),
    ("GFRIEND", "Tonight", "回:Song of the Sirens"),
    ("Lovelyz", "Once Upon a Time", "Once Upon a Time"),
    ("MOMOLAND", "Thumbs Up", "Show Me"),
    ("(G)-IDLE", "LION", "I made"),
    ("Sunmi", "LALALAY", "WARNING"),
    ("Taeyeon", "Wine", "Something New - The 3rd Mini Album"),
    ("Sunny Hill", "Monday to Sunday", "The Beginning of New Endings"),
    ("Brown Eyed Girls", "Wonder Woman", "RE_vive"),
    ("2NE1", "Goodbye", ""),
    ("Epik High", "Born Hater", "Shoebox"),
    ("K/DA", "POP/STARS", ""),
    ("Primary", "When I Was Young", "2"),
    ("Gary", "Sunrise", "2002"),
    ("BewhY", "Day Day", ""),
    ("Mad Clown", "Fire", ""),
    ("Huh Gak", "Spring Rain", ""),
    ("Ailee", "If You", "VIVID"),
    ("Son Seung Yeon", "A Person Like You", ""),
    ("Jung Seung Hwan", "The Fan", ""),
    ("Rain", "GANG", ""),
    ("PSY", "New Face", "4X2=8"),
    ("Teen Top", "Missing", "Red Point"),
    ("B.A.P", "Honeymoon", "Blue"),
    ("CNBLUE", "Between Us", "7°CN"),
    ("FTISLAND", "Wind", "OVER 10 YEARS"),
    ("N.Flying", "Real Love", "Love in the FLY"),
    ("KNK", "Rain", "KNK SINGLES COLLECTION 265"),
    ("BoA", "Woman", "ONE SHOT, TWO SHOT"),
    ("Taeyeon", "Spark", "Purpose - The 2nd Studio Album"),
    ("Epik High", "Rosario", "Epik High Is Here 上 (Part 1)"),
    ("Crush", "None", ""),
    ("Loco", "Weak", ""),
    ("Gray", "Real Love", ""),
    ("WINNER", "Remember", ""),
    ("SHINee", "Don't Call Me", "Don't Call Me"),
    ("Red Velvet", "Psycho", "'The ReVe Festival' Finale"),
    ("BLACKPINK", "Kill This Love", ""),
    ("BTS", "Boy With Luv", "MAP OF THE SOUL : PERSONA"),
    ("EXO", "Obsession", "OBSESSION - The 6th Album"),
    ("WINNER", "Ah Yeah", "WE"),
    ("iKON", "Dive", "NEW KIDS : THE FINAL"),
    ("GOT7", "Eclipse", "Spinning Top : Between Security & Insecurity"),
    ("SEVENTEEN", "Home", "An Ode"),
    ("Stray Kids", "MIROH", "Clé 1 : MIROH"),
    ("NCT 127", "Superhuman", "NCT #127 Neo Zone - The 2nd Album"),
    ("NCT DREAM", "BOOM", "We Boom - The 3rd Mini Album"),
    ("TREASURE", "MMM", "THE FIRST STEP : CHAPTER THREE"),
    ("TREASURE", "My Treasure", "THE FIRST STEP"),
    ("TREASURE", "Come Back Home", "THE FIRST STEP : CHAPTER ONE"),
    ("TREASURE", "Orange", "THE FIRST STEP : CHAPTER TWO"),
    ("TREASURE", "Beautiful", "THE FIRST STEP : TREASURE EFFECT"),
    ("ENHYPEN", "Let Me In (Crown)", "BORDER : CARNIVAL"),
    ("VIXX", "Revolution", "CONTACT"),
    ("INFINITE", "Why Why", "Why Why"),
    ("BTOB", "Missing You", "Feel'eM"),
    ("Highlight", "Not The End", "The Blowing"),
    ("ASTRO", "One", "ONEWE"),
    ("Golden Child", "ONE (Lucid Dream)", "Golden Age"),
    ("LOONA", "Star", "[#]"),
    ("LOONA", "So What", "[#]"),
    ("CHUNG HA", "Stay Tonight", "Querencia"),
    ("CHUNG HA", "Bicycle", "Querencia"),
    ("STAYC", "So Bad", "Star To A Young Culture"),
    ("Secret Number", "Who Dis?", ""),
    ("AB6IX", "The Answer", "VIVID"),
    ("Bvndit", "Jungle", "Carnival"),
    ("The Boyz", "Reveal", "Reveal"),
    ("KARD", "GUNSHOT", ""),
    ("SF9", "Summer Breeze", "Summer Breeze"),
    ("WayV", "Turn Back Time", ""),
    ("Super Junior", "2YA2YAO!", "TIMELESS"),
    ("WINNER", "Hold", "Remember"),
    ("GOT7", "Last Piece", "Breath of Love : Last Piece"),
    ("GOT7", "Breath", "Breath of Love : Last Piece"),
    ("CLC", "HELICOPTER", "HELICOPTER"),
    ("MOMOLAND", "Ready or Not", "Ready or Not"),
    ("IZ*ONE", "Secret Story of the Swan", "Oneiric Diary"),
    ("IZ*ONE", "Panorama", ""),
    ("Taeyeon", "Dear Me", ""),
    ("Woo", "Guilty", "Guilty"),
    ("NCT DREAM", "Ridin'", "Reload"),
    ("NCT 127", "Kick Back", "NCT RESONANCE Pt. 2"),
    ("NCT U", "90's Love", "Resonance Pt. 1"),
    ("NCT U", "Work It", "Resonance Pt. 1"),
    ("ATEEZ", "THANXX", "ZERO : FEVER Part.1"),
    ("TXT", "Blue Hour", "minisode1 : Blue Hour"),
    ("TXT", "Eternally", "The Dream Chapter: ETERNITY"),
    ("Everglow", "Dun Dun Dance", ""),
    ("Jessi", "What Type of X", "What Type of X"),
    ("Sunmi", "Pporappippam", ""),
    ("Seventeen", "Left & Right", "Heng:garæ"),
    ("Seventeen", "Home;run", "Heng:garæ"),
    ("Seventeen", "Fear", "Heng:garæ"),
    ("Stray Kids", "God's Menu", "GO LIVE"),
    ("Stray Kids", "Back Door", "IN LIFE"),
    ("ITZY", "Not Shy", ""),
    ("(G)-IDLE", "Oh my god", ""),
    ("(G)-IDLE", "Dumdi Dumdi", "Dumdi Dumdi"),
    ("TWICE", "More & More", ""),
    ("TWICE", "Cry For Me", ""),
    ("TWICE", "Fanfare", "Fanfare"),
    ("BLACKPINK", "How You Like That", ""),
    ("BLACKPINK", "Lovesick Girls", "THE ALBUM"),
    ("BTS", "Dynamite", ""),
    ("BTS", "Life Goes On", "BE"),
    ("BTS", "Blue & Grey", "BE"),
    ("BTS", "Telepathy", "BE"),
    ("BTS", "ON", "Map of the Soul : 7"),
    ("BTS", "Black Swan", "Map of the Soul : 7"),
]

CAND_2024 = [
    ("IVE", "HEYA", "IVE EMPATHY"),
    ("aespa", "Supernova", "Armageddon - The 1st Album"),
    ("aespa", "Armageddon", "Armageddon - The 1st Album"),
    ("(G)-IDLE", "Super Lady", "2"),
    ("(G)-IDLE", "Klaxon", "I SWAY"),
    ("TWS", "plot twist", "TWS 1st Mini Album 'Sparkling Blue'"),
    ("TWS", "hey hey hey", "TWS 2nd Mini Album 'SUMMER BEAT!'"),
    ("ILLIT", "Magnetic", "SUPER REAL ME"),
    ("ILLIT", "Lucky Girl Syndrome", "SUPER REAL ME"),
    ("Jennie", "Mantra", "Ruby"),
    ("Rosé & Bruno Mars", "APT.", ""),
    ("NewJeans", "How Sweet", "How Sweet"),
    ("NewJeans", "Bubble Gum", "How Sweet"),
    ("LE SSERAFIM", "Smart", "CRAZY"),
    ("LE SSERAFIM", "CRAZY", "CRAZY"),
    ("LE SSERAFIM", "EASY", "EASY"),
    ("Stray Kids", "Chk Chk Boom", "ATE"),
    ("Stray Kids", "Walkin On Water", "ATE"),
    ("SEVENTEEN", "MAESTRO", "17 IS RIGHT HERE"),
    ("NCT 127", "Walk", "WALK - The 6th Album"),
    ("NCT WISH", "Wish", "NCT WISH - The 1st Mini Album"),
    ("NCT DREAM", "Smoothie", "DREAM()SCAPE"),
    ("TXT", "Deja Vu", "The Name Chapter: FREEFALL"),
    ("ENHYPEN", "XO (Only If You Say Yes)", "ROMANCE : UNTOLD"),
    ("STAYC", "1 Thing", "…l"),
    ("ITZY", "Untouchable", "BORN TO BE"),
    ("ITZY", "GOLD", "GOLD"),
    ("TWICE", "ONE SPARK", "With YOU-th"),
    ("TWICE", "Strategy", "STRATEGY"),
    ("Red Velvet", "Cosmic", "Cosmic - The 1st Mini Album"),
    ("BABYMONSTER", "Sheesh", "DRIP"),
    ("BABYMONSTER", "Forever", "DRIP"),
    ("BABYMONSTER", "DRIP", "DRIP"),
    ("KISS OF LIFE", "Sticky", "Sticky"),
    ("KISS OF LIFE", "Igloo", "Sticky"),
    ("RIIZE", "Love 119", "Love 119"),
    ("RIIZE", "Impossible", "Impossible"),
    ("RIIZE", "Boom Boom Bass", "RIIZING"),
    ("BOYNEXTDOOR", "Earth, Wind & Fire", "HOW?"),
    ("BOYNEXTDOOR", "Nice Guy", "19.99"),
    ("ZEROBASEONE", "Feel the POP", "You had me at HELLO"),
    ("ZEROBASEONE", "SWEAT", "You had me at HELLO"),
    ("NMIXX", "Soñar (Breaker)", "Fe3O4: BREAK"),
    ("Kep1er", "Shooting Star", "Girls Planet - Kepler : THE 6th Mini Album"),
    ("fromis_9", "Supersonic", "From"),
    ("Dreamcatcher", "OOTD", "VillainS"),
    ("OH MY GIRL", "Fall in Love", "Dreamy Resonance"),
    ("H1-KEY", "Let It Be", "H1-KEY 4th Mini Album [Lovestruck]"),
    ("TREASURE", "LAST NIGHT", "LAST NIGHT"),
    ("THE BOYZ", "MAESTRO", "THE BOYZ 2nd ALBUM [PHANTASY] Pt.2 Spellbound"),
    ("ATEEZ", "WORK", "THE WORLD EP.Fin : WILL"),
    ("Xdinary Heroes", "PLUTO", "Troubleshooting"),
    ("KARD", "CAKE", "Where To Now? (Part 1 : Yellow Light)"),
    ("SECRET NUMBER", "Don't Touch", "DOXIT"),
    ("CLASS:y", "Winter Bloom", "Day&Night"),
    ("DAY6", "Welcome to the Show", "Fourever"),
    ("DAY6", "HAPPY", "Fourever"),
    ("QWER", "Discord", "1st Mini Album 'MANITO'"),
    ("QWER", "T.B.H", "1st Mini Album 'MANITO'"),
    ("tripleS", "Girls' Capitalism", "ASSEMBLE24"),
    ("tripleS", "Cherry Talk", "AESTHETIC"),
    ("UNIS", "SUPERWOMAN", "WE UNIS"),
    ("UNIS", "Curious", "WE UNIS"),
    ("ARTMS", "Virtual Angel", "Dall"),
    ("ARTMS", "Air", "Dall"),
    ("WOOAH", "BLUSH", "BLUSH"),
    ("CORTIS", "GO!", "COLOR OUTSIDE THE LINES"),
    ("CORTIS", "What You Want", "COLOR OUTSIDE THE LINES"),
    ("MONSTA X", "Do What I Want", "REASON"),
    ("P1Harmony", "It's Alright", "Killin' It"),
    ("CRAVITY", "Love or Die", "SUN WAVE : UNDER THE SUNLIGHT"),
    ("SF9", "BIBORA", "BIBORA"),
    ("Golden Child", "Feel Me", "Feel Me"),
    ("ONEUS", "Now", "NOW"),
    ("TEMPEST", "LIGHTHOUSE", "TEMPEST Voyage"),
    ("DRIPPIN", "FIRST LOVE", "FIRST LOVE"),
    ("Jimin", "Who", "MUSE"),
    ("Lisa", "Rockstar", "Alter Ego"),
    ("Taeyang", "Seed", "Down to Earth"),
    ("AKMU", "Hero", "Love Episode"),
    ("Melomance", "TOY", "Romance Express"),
    ("Crush", "Love You With All My Heart", "wonderlost"),
    ("BIBI", "Bam Yang Gang", "Bam Yang Gang"),
    ("PLAVE", "WAY 4 LUV", "ASTERUM : Way-Pt.1"),
    ("xikers", "HOME BOY", "HOUSE OF TRICKY : Trial And Error"),
    ("KATSEYE", "Debut", "Debut"),
    ("KATSEYE", "Touch", "Touch"),
    ("WOOAH", "BLAH BLAH BLAH", "BLAH BLAH BLAH"),
    ("MEOVV", "MEOW", "MEOW"),
    ("MEOVV", "BODY", "MEOW"),
    ("BOYNEXTDOOR", "But I Like You", "HOW?"),
    ("ZEROBASEONE", "Good So Bad", "You had me at HELLO"),
    ("NMIXX", "See That?", "Fe3O4: BREAK"),
    ("ENHYPEN", "No Doubt", "ROMANCE : UNTOLD"),
    ("TXT", "Deja Vu (Anxiety)", "The Name Chapter: FREEFALL"),
    ("ILLIT", "Cherish (My Love)", "I'll Like You"),
    ("TREASURE", "KING KONG", "SPECIAL MINI ALBUM [PLEASURE]"),
    ("THE BOYZ", "Trigger", "THE BOYZ 2nd ALBUM [PHANTASY] Pt.2 Spellbound"),
    ("ATEEZ", "Ice On My Teeth", "THE WORLD EP.Fin : WILL"),
    ("PENTAGON", "Feelin' Like", "IN:VITE U"),
    ("Weeekly", "Vroom Vroom", "ColoRise"),
    ("Cherry Bullet", "POW!", "Cherry Dash"),
    ("YENA", "Good Morning", "Good Morning"),
    ("WOODZ", "Drowning", "OO-LI"),
    ("PLAVE", "Dash", "Caligo Pt.1"),
    ("xikers", "Red Sun", "HOUSE OF TRICKY : Trickster"),
    ("FIFTY FIFTY", "SOS", "Love Tune"),
    ("JENNIE", "Seoul City", "Ruby"),
    ("Rosé", "drinks or coffee", "rosie"),
    ("Lisa", "New Woman", "Alter Ego"),
    ("VIVIZ", "MANIAC", "The 3rd Mini Album 'VERSUS'"),
    ("Billlie", "EUNOIA", "the Billage of perception: chapter three"),
    ("Heize", "Fallin'", "Fallin'"),
    ("10CM", "To Reach You", "4.3"),
    ("Crush", "Rush Hour", ""),
    ("BIBI", "Lowkey", "Lowkey"),
    ("Lim Young Woong", "Do or Die", "IM HERO"),
    ("Apink", "Dilemma", "HORN"),
    ("fromis_9", "From", "From"),
    ("Dreamcatcher", "Justice", "VillainS"),
    ("OH MY GIRL", "Classified", "Dreamy Resonance"),
    ("STAYC", "GPT", "…l"),
    ("ITZY", "Imaginary Friend", "GOLD"),
    ("TWICE", "Killing Me Good", "STRATEGY"),
    ("Red Velvet", "Sweet Dreams", "Cosmic - The 1st Mini Album"),
    ("aespa", "Whiplash", "Whiplash - The 5th Mini Album"),
    ("aespa", "Dirty Work", "Whiplash - The 5th Mini Album"),
    ("NCT 127", "Fact Check", "Fact Check - The 5th Album"),
    ("SHINee", "Hard", "HARD - The 8th Album"),
    ("EXO", "Cream Soda", "EXIST - The 7th Album"),
    ("MAMAMOO+", "GGBB", "Two Rabbits"),
    ("Hwa Sa", "I Love My Body", "I Love My Body"),
    ("Sunmi", "Stranger", "STRANGER"),
    ("AKMU", "Love Lee", "Love Lee"),
    ("Melomance", "Love, Maybe", "Romance Express"),
    ("Paul Kim", "Me After You", ""),
    ("Younha", "Event Horizon", "UNSTABLE MINDSET"),
    ("Jannabi", "for lovers who hesitate", "LEGEND"),
    ("DAY6", "Melt Down", "Fourever"),
    ("N.Flying", "Oh really?", "So, 通"),
    ("VERIVERY", "Crazy Like That", "Lost and Found"),
    ("D1CE", "HATE YOU", "Wake Up"),
    ("OnlyOneOf", "libidO", "Instinct, Part. 1"),
    ("BoA", "Better", "Better - The 10th Album"),
    ("Colde", "Your Dog Loves You", ""),
    ("Soran", "The Star", ""),
    ("George", "Where's Wool", ""),
    ("Epik High", "Rosario", "Epik High Is Here 上 (Part 1)"),
    ("Loco", "Weak", ""),
    ("Gray", "Real Love", ""),
    ("Crush", "None", ""),
    ("Standing Egg", "Old Song", "Lip"),
    ("Ben", "From Ben", "Reality"),
    ("Davichi", "First Winter", ""),
    ("Urban Zakapa", "When We Were Two", "02"),
    ("10CM", "Spring Snow", "4.3"),
    ("Punch", "Losing Sleep", ""),
    ("Roy Kim", "Only Then", ""),
    ("Im Chang-jung", "Nothing Like You", ""),
    ("Weeekly", "Vroom Vroom", "ColoRise"),
    ("SECRET NUMBER", "Toxic", "DOXIT"),
    ("TRI.BE", "Diamond", "Diamond"),
    ("Cherry Bullet", "Love in Space", "Love in Space"),
    ("Rocket Punch", "BOOM", "BOOM"),
    ("DRIPPIN", "One Kind", "Villain - The Zero"),
    ("CLASS:y", "Tick Tick Bomb", "Day&Night"),
    ("woo!ah!", "Rollercoaster", "Rollercoaster"),
    ("PURPLE KISS", "7HEAVEN", "Geekyland"),
    ("LIGHTSUM", "Honey or Spice", "Honey or Spice"),
    ("H1-KEY", "Rose Blossom", "Rose Blossom"),
    ("VIVIZ", "PULL UP", "VarioUS"),
    ("Billlie", "EUNOIA", "the Billage of perception: chapter three"),
    ("fromis_9", "Menow", "Unlock My World"),
    ("Dreamcatcher", "BON VOYAGE", "Apocalypse : Follow us"),
    ("OH MY GIRL", "Summer Comes", "Golden Hourglass"),
    ("TREASURE", "MOVE", "REBOOT"),
    ("THE BOYZ", "ROAR", "THE BOYZ 2nd ALBUM [PHANTASY] Pt.1 Christmas In August"),
    ("ATEEZ", "BOUNCY (K-HOT CHILI PEPPERS)", "THE WORLD EP.2 : OUTLAW"),
    ("ONEUS", "Same Scent", "MALUS"),
    ("TEMPEST", "Voyage", "ON and ON"),
    ("Xdinary Heroes", "Break the Brake", "Overload"),
    ("KARD", "ICKY", "ICKY"),
    ("RIIZE", "Get A Guitar", "Get A Guitar"),
    ("RIIZE", "Talk Saxy", "Talk Saxy"),
    ("BOYNEXTDOOR", "One and Only", "WHO!"),
    ("BOYNEXTDOOR", "But Sometimes", "WHO!"),
    ("ZEROBASEONE", "In Bloom", "YOUTH IN THE SHADE"),
    ("ZEROBASEONE", "Crush", "YOUTH IN THE SHADE"),
    ("NCT U", "Baggy Jeans", "Golden Age - The 4th Album"),
    ("NCT DOJAEJUNG", "Perfume", "Perfume - The 1st Mini Album"),
    ("P1Harmony", "Killin' It", "Killin' It"),
    ("CRAVITY", "Groovy", "SUN WAVE : UNDER THE SUNLIGHT"),
    ("BABYMONSTER", "Batter Up", ""),
    ("BABYMONSTER", "Stuck In The Middle", ""),
    ("KISS OF LIFE", "Shhh", "Shhh"),
    ("STAYC", "Cheeky Icy Thang", "…l"),
    ("MAMAMOO+", "Dangdang", "Two Rabbits"),
    ("Hwa Sa", "I Love My Body", "I Love My Body"),
    ("Sunmi", "Stranger", "STRANGER"),
    ("Heize", "Fallin'", "Fallin'"),
    ("10CM", "To Reach You", "4.3"),
    ("BIBI", "Lowkey", "Lowkey"),
    ("ITZY", "None of My Business", "KILL MY DOUBT"),
    ("TWICE", "Moonlight Sunrise", "MOONLIGHT SUNRISE"),
    ("Lim Young Woong", "Do or Die", "IM HERO"),
    ("Fifty Fifty", "Cupid", "The Beginning"),
    ("Jungkook", "Standing Next to You", "GOLDEN"),
    ("V", "Love Me Again", "Layover"),
    ("Jimin", "Like Crazy", "FACE"),
    ("Jisoo", "Flower", "ME"),
    ("STAYC", "Teddy Bear", "Teddy Bear"),
    ("ITZY", "CAKE", "KILL MY DOUBT"),
    ("TWICE", "SET ME FREE", "READY TO BE"),
    ("Red Velvet", "Chill Kill", "Chill Kill - The 3rd Album"),
    ("NMIXX", "Love Me Like This", "expérgo"),
    ("Kep1er", "Giddy", "Girls Planet - Kepler : THE 3rd Mini Album"),
]

CAND_2025 = [
    ("IVE", "REBEL HEART", "IVE EMPATHY"),
    ("LE SSERAFIM", "HOT", "HOT"),
    ("Hearts2Hearts", "The Chase", "The Chase"),
    ("Hearts2Hearts", "Butterflies", "The Chase"),
    ("BOYNEXTDOOR", "If I Say, I Love You", "19.99"),
    ("NCT WISH", "Steady", "Steady - The 1st Mini Album"),
    ("NCT DREAM", "When I'm With You", "DREAM()SCAPE"),
    ("Jisoo", "Earthquake", "AMORTAGE"),
    ("Jisoo", "Your Love", "AMORTAGE"),
    ("BABYMONSTER", "WE GO UP", "WE GO UP"),
    ("BABYMONSTER", "CLIK CLAK", "WE GO UP"),
    ("ALLDAY PROJECT", "FAMOUS", "FAMOUS"),
    ("MEOVV", "TOXIC", "MY EYES OPEN VVIDE"),
    ("MEOVV", "Hands Up", "MY EYES OPEN VVIDE"),
    ("ILLIT", "IYKYK", "I'll Like You"),
    ("TWS", "OVERDRIVE", "TWS 3rd Mini Album 'TRY WITH US'"),
    ("TWS", "Countdown!", "TWS 3rd Mini Album 'TRY WITH US'"),
    ("KATSEYE", "My Way", "Touch"),
    ("KATSEYE", "Gameboy", "Touch"),
    ("Stray Kids", "CEREMONY", "合 (HOP)"),
    ("Stray Kids", "Railway (Bang Chan)", "合 (HOP)"),
    ("TWICE", "Strategy (feat. Megan Thee Stallion)", "STRATEGY"),
    ("TWICE", "Killing Me Good", "STRATEGY"),
    ("ITZY", "Imaginary Friend", "GOLD"),
    ("NMIXX", "Know About Me", "Fe3O4: FORWARD"),
    ("NMIXX", "High Horse", "Fe3O4: FORWARD"),
    ("RIIZE", "Fly Up", "ODYSSEY - The 1st Album"),
    ("RIIZE", "Show Me Love", "ODYSSEY - The 1st Album"),
    ("ZEROBASEONE", "Blue", "You had me at HELLO"),
    ("ENHYPEN", "Bad Desire (With or Without You)", "DESIRE : UNLEASH"),
    ("TXT", "The Star Chapter: SANCTUARY", "The Star Chapter: SANCTUARY"),
    ("Red Velvet", "Sweet Dreams", "Cosmic - The 1st Mini Album"),
    ("Dreamcatcher", "Justice", "VillainS"),
    ("fromis_9", "From", "From"),
    ("OH MY GIRL", "Classified", "Dreamy Resonance"),
    ("Apink", "Dilemma", "HORN"),
    ("TREASURE", "KING KONG", "SPECIAL MINI ALBUM [PLEASURE]"),
    ("THE BOYZ", "Trigger", "THE BOYZ 2nd ALBUM [PHANTASY] Pt.2 Spellbound"),
    ("ATEEZ", "Ice On My Teeth", "THE WORLD EP.Fin : WILL"),
    ("PLAVE", "Dash", "Caligo Pt.1"),
    ("xikers", "Red Sun", "HOUSE OF TRICKY : Trickster"),
    ("FIFTY FIFTY", "SOS", "Love Tune"),
    ("JENNIE", "Seoul City", "Ruby"),
    ("Rosé", "drinks or coffee", "rosie"),
    ("Lisa", "New Woman", "Alter Ego"),
    ("G-DRAGON", "HOME SWEET HOME (feat. TAEYANG & DAESUNG)", "Übermensch"),
    ("G-DRAGON", "TOO BAD (feat. Anderson .Paak)", "Übermensch"),
    ("G-DRAGON", "POWER", "Übermensch"),
    ("G-DRAGON", "TAKE ME", "Übermensch"),
    ("WOOAH", "BLAH BLAH BLAH", "BLAH BLAH BLAH"),
    ("CORTIS", "GO!", "COLOR OUTSIDE THE LINES"),
    ("CORTIS", "What You Want", "COLOR OUTSIDE THE LINES"),
    ("UNIS", "SUPERWOMAN", "WE UNIS"),
    ("UNIS", "Curious", "WE UNIS"),
    ("ARTMS", "Virtual Angel", "Dall"),
    ("ARTMS", "Air", "Dall"),
    ("WOOAH", "BLUSH", "BLUSH"),
    ("MONSTA X", "Do What I Want", "REASON"),
    ("P1Harmony", "It's Alright", "Killin' It"),
    ("CRAVITY", "Love or Die", "SUN WAVE : UNDER THE SUNLIGHT"),
    ("SF9", "BIBORA", "BIBORA"),
    ("Golden Child", "Feel Me", "Feel Me"),
    ("ONEUS", "Now", "NOW"),
    ("TEMPEST", "LIGHTHOUSE", "TEMPEST Voyage"),
    ("DRIPPIN", "FIRST LOVE", "FIRST LOVE"),
    ("QWER", "Discord", "1st Mini Album 'MANITO'"),
    ("QWER", "T.B.H", "1st Mini Album 'MANITO'"),
    ("tripleS", "Girls' Capitalism", "ASSEMBLE24"),
    ("tripleS", "Cherry Talk", "AESTHETIC"),
    ("DAY6", "Welcome to the Show", "Fourever"),
    ("DAY6", "HAPPY", "Fourever"),
    ("KATSEYE", "Debut", "Debut"),
    ("KATSEYE", "Touch", "Touch"),
    ("MEOVV", "MEOW", "MEOW"),
    ("MEOVV", "BODY", "MEOW"),
    ("BOYNEXTDOOR", "But I Like You", "HOW?"),
    ("ZEROBASEONE", "Good So Bad", "You had me at HELLO"),
    ("NMIXX", "See That?", "Fe3O4: BREAK"),
    ("ENHYPEN", "No Doubt", "ROMANCE : UNTOLD"),
    ("TXT", "Deja Vu (Anxiety)", "The Name Chapter: FREEFALL"),
    ("STAYC", "GPT", "…l"),
    ("VIVIZ", "MANIAC", "The 3rd Mini Album 'VERSUS'"),
    ("Billlie", "EUNOIA", "the Billage of perception: chapter three"),
    ("Heize", "Fallin'", "Fallin'"),
    ("10CM", "To Reach You", "4.3"),
    ("Crush", "Rush Hour", ""),
    ("BIBI", "Lowkey", "Lowkey"),
    ("Lim Young Woong", "Do or Die", "IM HERO"),
    ("Taeyang", "Seed", "Down to Earth"),
    ("AKMU", "Hero", "Love Episode"),
    ("Melomance", "TOY", "Romance Express"),
    ("Crush", "Love You With All My Heart", "wonderlost"),
    ("BIBI", "Bam Yang Gang", "Bam Yang Gang"),
    ("PLAVE", "WAY 4 LUV", "ASTERUM : Way-Pt.1"),
    ("xikers", "HOME BOY", "HOUSE OF TRICKY : Trial And Error"),
    ("KISS OF LIFE", "Sticky", "Sticky"),
    ("SECRET NUMBER", "Don't Touch", "DOXIT"),
    ("CLASS:y", "Winter Bloom", "Day&Night"),
    ("YENA", "Good Morning", "Good Morning"),
    ("WOODZ", "Drowning", "OO-LI"),
    ("Weeekly", "Vroom Vroom", "ColoRise"),
    ("Cherry Bullet", "POW!", "Cherry Dash"),
    ("PENTAGON", "Feelin' Like", "IN:VITE U"),
    ("KARD", "CAKE", "Where To Now? (Part 1 : Yellow Light)"),
    ("Xdinary Heroes", "PLUTO", "Troubleshooting"),
    ("OH MY GIRL", "Fall in Love", "Dreamy Resonance"),
    ("H1-KEY", "Let It Be", "H1-KEY 4th Mini Album [Lovestruck]"),
    ("Dreamcatcher", "OOTD", "VillainS"),
    ("fromis_9", "Supersonic", "From"),
    ("Kep1er", "Shooting Star", "Girls Planet - Kepler : THE 6th Mini Album"),
    ("ILLIT", "Magnetic", "SUPER REAL ME"),
    ("ILLIT", "Lucky Girl Syndrome", "SUPER REAL ME"),
    ("TWS", "plot twist", "TWS 1st Mini Album 'Sparkling Blue'"),
    ("TWS", "hey hey hey", "TWS 2nd Mini Album 'SUMMER BEAT!'"),
    ("Jennie", "Mantra", "Ruby"),
    ("Rosé & Bruno Mars", "APT.", ""),
    ("NewJeans", "Bubble Gum", "How Sweet"),
    ("LE SSERAFIM", "Smart", "CRAZY"),
    ("LE SSERAFIM", "CRAZY", "CRAZY"),
    ("LE SSERAFIM", "EASY", "EASY"),
    ("Stray Kids", "Chk Chk Boom", "ATE"),
    ("Stray Kids", "Walkin On Water", "ATE"),
    ("SEVENTEEN", "MAESTRO", "17 IS RIGHT HERE"),
    ("NCT 127", "Walk", "WALK - The 6th Album"),
    ("NCT WISH", "Wish", "NCT WISH - The 1st Mini Album"),
    ("NCT DREAM", "Smoothie", "DREAM()SCAPE"),
    ("ENHYPEN", "XO (Only If You Say Yes)", "ROMANCE : UNTOLD"),
    ("STAYC", "1 Thing", "…l"),
    ("ITZY", "Untouchable", "BORN TO BE"),
    ("ITZY", "GOLD", "GOLD"),
    ("TWICE", "ONE SPARK", "With YOU-th"),
    ("Red Velvet", "Cosmic", "Cosmic - The 1st Mini Album"),
    ("BABYMONSTER", "Sheesh", "DRIP"),
    ("BABYMONSTER", "Forever", "DRIP"),
    ("BABYMONSTER", "DRIP", "DRIP"),
    ("KISS OF LIFE", "Igloo", "Sticky"),
    ("RIIZE", "Love 119", "Love 119"),
    ("RIIZE", "Impossible", "Impossible"),
    ("RIIZE", "Boom Boom Bass", "RIIZING"),
    ("BOYNEXTDOOR", "Earth, Wind & Fire", "HOW?"),
    ("BOYNEXTDOOR", "Nice Guy", "19.99"),
    ("ZEROBASEONE", "Feel the POP", "You had me at HELLO"),
    ("ZEROBASEONE", "SWEAT", "You had me at HELLO"),
    ("NMIXX", "Soñar (Breaker)", "Fe3O4: BREAK"),
    ("IVE", "HEYA", "IVE EMPATHY"),
    ("aespa", "Supernova", "Armageddon - The 1st Album"),
    ("aespa", "Armageddon", "Armageddon - The 1st Album"),
    ("(G)-IDLE", "Super Lady", "2"),
    ("(G)-IDLE", "Klaxon", "I SWAY"),
    ("TREASURE", "LAST NIGHT", "LAST NIGHT"),
    ("THE BOYZ", "MAESTRO", "THE BOYZ 2nd ALBUM [PHANTASY] Pt.2 Spellbound"),
    ("ATEEZ", "WORK", "THE WORLD EP.Fin : WILL"),
    ("Jimin", "Who", "MUSE"),
    ("Lisa", "Rockstar", "Alter Ego"),
    ("Taeyang", "Seed", "Down to Earth"),
    ("AKMU", "Hero", "Love Episode"),
    ("Melomance", "TOY", "Romance Express"),
    ("Crush", "Love You With All My Heart", "wonderlost"),
    ("BIBI", "Bam Yang Gang", "Bam Yang Gang"),
    ("PLAVE", "WAY 4 LUV", "ASTERUM : Way-Pt.1"),
    ("xikers", "HOME BOY", "HOUSE OF TRICKY : Trial And Error"),
    ("KATSEYE", "Debut", "Debut"),
    ("KATSEYE", "Touch", "Touch"),
    ("WOOAH", "BLAH BLAH BLAH", "BLAH BLAH BLAH"),
    ("MEOVV", "MEOW", "MEOW"),
    ("MEOVV", "BODY", "MEOW"),
    ("BOYNEXTDOOR", "But I Like You", "HOW?"),
    ("ZEROBASEONE", "Good So Bad", "You had me at HELLO"),
    ("NMIXX", "See That?", "Fe3O4: BREAK"),
    ("ENHYPEN", "No Doubt", "ROMANCE : UNTOLD"),
    ("TXT", "Deja Vu (Anxiety)", "The Name Chapter: FREEFALL"),
    ("ILLIT", "Cherish (My Love)", "I'll Like You"),
    ("TREASURE", "KING KONG", "SPECIAL MINI ALBUM [PLEASURE]"),
    ("THE BOYZ", "Trigger", "THE BOYZ 2nd ALBUM [PHANTASY] Pt.2 Spellbound"),
    ("ATEEZ", "Ice On My Teeth", "THE WORLD EP.Fin : WILL"),
    ("PENTAGON", "Feelin' Like", "IN:VITE U"),
    ("Weeekly", "Vroom Vroom", "ColoRise"),
    ("Cherry Bullet", "POW!", "Cherry Dash"),
    ("YENA", "Good Morning", "Good Morning"),
    ("WOODZ", "Drowning", "OO-LI"),
    ("PLAVE", "Dash", "Caligo Pt.1"),
    ("xikers", "Red Sun", "HOUSE OF TRICKY : Trickster"),
    ("FIFTY FIFTY", "SOS", "Love Tune"),
    ("JENNIE", "Seoul City", "Ruby"),
    ("Rosé", "drinks or coffee", "rosie"),
    ("Lisa", "New Woman", "Alter Ego"),
    ("VIVIZ", "MANIAC", "The 3rd Mini Album 'VERSUS'"),
    ("Billlie", "EUNOIA", "the Billage of perception: chapter three"),
    ("Heize", "Fallin'", "Fallin'"),
    ("10CM", "To Reach You", "4.3"),
    ("Crush", "Rush Hour", ""),
    ("BIBI", "Lowkey", "Lowkey"),
    ("Lim Young Woong", "Do or Die", "IM HERO"),
    ("Apink", "Dilemma", "HORN"),
    ("fromis_9", "From", "From"),
    ("Dreamcatcher", "Justice", "VillainS"),
    ("OH MY GIRL", "Classified", "Dreamy Resonance"),
    ("STAYC", "GPT", "…l"),
    ("ITZY", "Imaginary Friend", "GOLD"),
    ("TWICE", "Killing Me Good", "STRATEGY"),
    ("Red Velvet", "Sweet Dreams", "Cosmic - The 1st Mini Album"),
    ("aespa", "Whiplash", "Whiplash - The 5th Mini Album"),
    ("aespa", "Dirty Work", "Whiplash - The 5th Mini Album"),
    ("NCT 127", "Fact Check", "Fact Check - The 5th Album"),
    ("SHINee", "Hard", "HARD - The 8th Album"),
    ("EXO", "Cream Soda", "EXIST - The 7th Album"),
    ("MAMAMOO+", "GGBB", "Two Rabbits"),
    ("Hwa Sa", "I Love My Body", "I Love My Body"),
    ("Sunmi", "Stranger", "STRANGER"),
    ("AKMU", "Love Lee", "Love Lee"),
    ("Melomance", "Love, Maybe", "Romance Express"),
    ("Paul Kim", "Me After You", ""),
    ("Younha", "Event Horizon", "UNSTABLE MINDSET"),
    ("Jannabi", "for lovers who hesitate", "LEGEND"),
    ("DAY6", "Melt Down", "Fourever"),
    ("N.Flying", "Oh really?", "So, 通"),
    ("VERIVERY", "Crazy Like That", "Lost and Found"),
    ("D1CE", "HATE YOU", "Wake Up"),
    ("OnlyOneOf", "libidO", "Instinct, Part. 1"),
    ("BoA", "Better", "Better - The 10th Album"),
    ("Colde", "Your Dog Loves You", ""),
    ("Soran", "The Star", ""),
    ("George", "Where's Wool", ""),
    ("Epik High", "Rosario", "Epik High Is Here 上 (Part 1)"),
    ("Loco", "Weak", ""),
    ("Gray", "Real Love", ""),
    ("Crush", "None", ""),
    ("Standing Egg", "Old Song", "Lip"),
    ("Ben", "From Ben", "Reality"),
    ("Davichi", "First Winter", ""),
    ("Urban Zakapa", "When We Were Two", "02"),
    ("10CM", "Spring Snow", "4.3"),
    ("Punch", "Losing Sleep", ""),
    ("Roy Kim", "Only Then", ""),
    ("Im Chang-jung", "Nothing Like You", ""),
    ("Weeekly", "Vroom Vroom", "ColoRise"),
    ("SECRET NUMBER", "Toxic", "DOXIT"),
    ("TRI.BE", "Diamond", "Diamond"),
    ("Cherry Bullet", "Love in Space", "Love in Space"),
    ("Rocket Punch", "BOOM", "BOOM"),
    ("DRIPPIN", "One Kind", "Villain - The Zero"),
    ("CLASS:y", "Tick Tick Bomb", "Day&Night"),
    ("woo!ah!", "Rollercoaster", "Rollercoaster"),
    ("PURPLE KISS", "7HEAVEN", "Geekyland"),
    ("LIGHTSUM", "Honey or Spice", "Honey or Spice"),
    ("H1-KEY", "Rose Blossom", "Rose Blossom"),
    ("VIVIZ", "PULL UP", "VarioUS"),
    ("Billlie", "EUNOIA", "the Billage of perception: chapter three"),
    ("fromis_9", "Menow", "Unlock My World"),
    ("Dreamcatcher", "BON VOYAGE", "Apocalypse : Follow us"),
    ("OH MY GIRL", "Summer Comes", "Golden Hourglass"),
    ("TREASURE", "MOVE", "REBOOT"),
    ("THE BOYZ", "ROAR", "THE BOYZ 2nd ALBUM [PHANTASY] Pt.1 Christmas In August"),
    ("ATEEZ", "BOUNCY (K-HOT CHILI PEPPERS)", "THE WORLD EP.2 : OUTLAW"),
    ("ONEUS", "Same Scent", "MALUS"),
    ("TEMPEST", "Voyage", "ON and ON"),
    ("Xdinary Heroes", "Break the Brake", "Overload"),
    ("KARD", "ICKY", "ICKY"),
    ("RIIZE", "Get A Guitar", "Get A Guitar"),
    ("RIIZE", "Talk Saxy", "Talk Saxy"),
    ("BOYNEXTDOOR", "One and Only", "WHO!"),
    ("BOYNEXTDOOR", "But Sometimes", "WHO!"),
    ("ZEROBASEONE", "In Bloom", "YOUTH IN THE SHADE"),
    ("ZEROBASEONE", "Crush", "YOUTH IN THE SHADE"),
    ("NCT U", "Baggy Jeans", "Golden Age - The 4th Album"),
    ("NCT DOJAEJUNG", "Perfume", "Perfume - The 1st Mini Album"),
    ("P1Harmony", "Killin' It", "Killin' It"),
    ("CRAVITY", "Groovy", "SUN WAVE : UNDER THE SUNLIGHT"),
    ("BABYMONSTER", "Batter Up", ""),
    ("BABYMONSTER", "Stuck In The Middle", ""),
    ("KISS OF LIFE", "Shhh", "Shhh"),
    ("STAYC", "Cheeky Icy Thang", "…l"),
    ("MAMAMOO+", "Dangdang", "Two Rabbits"),
    ("Hwa Sa", "I Love My Body", "I Love My Body"),
    ("Sunmi", "Stranger", "STRANGER"),
    ("Heize", "Fallin'", "Fallin'"),
    ("10CM", "To Reach You", "4.3"),
    ("BIBI", "Lowkey", "Lowkey"),
    ("ITZY", "None of My Business", "KILL MY DOUBT"),
    ("TWICE", "Moonlight Sunrise", "MOONLIGHT SUNRISE"),
    ("Lim Young Woong", "Do or Die", "IM HERO"),
    ("Fifty Fifty", "Cupid", "The Beginning"),
    ("Jungkook", "Standing Next to You", "GOLDEN"),
    ("V", "Love Me Again", "Layover"),
    ("Jimin", "Like Crazy", "FACE"),
    ("Jisoo", "Flower", "ME"),
    ("STAYC", "Teddy Bear", "Teddy Bear"),
    ("ITZY", "CAKE", "KILL MY DOUBT"),
    ("TWICE", "SET ME FREE", "READY TO BE"),
    ("Red Velvet", "Chill Kill", "Chill Kill - The 3rd Album"),
    ("NMIXX", "Love Me Like This", "expérgo"),
    ("Kep1er", "Giddy", "Girls Planet - Kepler : THE 3rd Mini Album"),
]


def write_catalog_2020_2025(raw: dict) -> None:
    lines = [
        "#!/usr/bin/env python3",
        '"""K-pop Top 100 candidate pools (2020-2025). Melon/Gaon/community ordered."""',
        "from __future__ import annotations",
        "",
        "CATALOG_2020_2025: dict[int, list[tuple[str, str, str]]] = {",
    ]
    for year in range(2020, 2026):
        lines.append(f"    {year}: [")
        for artist, title, album in raw[year]:
            lines.append(f"        ({artist!r}, {title!r}, {album!r}),")
        lines.append("    ],")
    lines.append("}")
    lines.append("")
    (GEN / "catalog_2020_2025.py").write_text("\n".join(lines), encoding="utf-8")


def count_selected(raw: dict, year: int) -> int:
    seen = global_seen_through(raw, year - 1)
    ac = Counter()
    n = 0
    for artist, title, album in raw.get(year, []):
        if n >= TARGET:
            break
        if ac[artist] >= MAX_PER:
            continue
        k = track_key(artist, title)
        if k in seen:
            continue
        n += 1
        ac[artist] += 1
        seen.add(k)
    return n


def main() -> None:
    from auto_fill import FILLER
    from fix_pools import SPARE_2020
    from more_candidates import MORE_2024, MORE_2025
    from extra_2019 import EXTRA_2019
    from spread_2025 import SPREAD_2025
    from unique_2025 import EXTRA_2020, UNIQUE_2025

    import fix_2019_wrong_year

    fix_2019_wrong_year.main()

    c1519 = load(GEN / "catalog_2015_2019.py")
    c1729 = load(GEN / "catalog_2017_2019.py")
    c2025 = load(GEN / "catalog_2020_2025.py")
    raw: dict[int, list] = {}
    raw.update(c1519.CATALOG_2015_2019)
    raw.update(c1729.CATALOG_2017_2019)
    # 2021–2023: keep curated pools from catalog
    for y in range(2021, 2024):
        raw[y] = dedupe(list(c2025.CATALOG_2020_2025.get(y, [])))

    seen18 = global_seen_through(raw, 2018)
    raw[2019] = dedupe(filter_new(list(c1729.CATALOG_2017_2019.get(2019, [])) + EXTRA_2019, seen18))

    seen19 = global_seen_through(raw, 2019)
    pool20 = dedupe(filter_new(SPARE_2020 + EXTRA_2020, seen19))
    pool20.extend(filter_new(EXTRA_2020, seen19))
    raw[2020] = dedupe(pool20)

    seen22 = global_seen_through(raw, 2022)
    raw[2023] = dedupe(raw[2023] + filter_new([
        ("TWICE", "Moonlight Sunrise", "MOONLIGHT SUNRISE"),
        ("Fifty Fifty", "Cupid (Twin Version)", "The Beginning"),
    ], seen22))

    seen23 = global_seen_through(raw, 2023)
    raw[2024] = dedupe(filter_new(CAND_2024 + MORE_2024 + FILLER, seen23))

    seen24 = global_seen_through(raw, 2024)
    raw[2025] = dedupe(filter_new(UNIQUE_2025 + MORE_2025 + SPREAD_2025, seen24))

    write_catalog_2020_2025(raw)

    for year in range(2015, 2026):
        n = count_selected(raw, year)
        print(f"{year}: pool={len(raw.get(year,[]))} would_select={n}")


if __name__ == "__main__":
    main()
