#!/usr/bin/env python3
"""Remove 2020+ releases wrongly placed in 2019 pool; add true 2019 replacements."""
from __future__ import annotations

import importlib.util
from pathlib import Path

GEN = Path(__file__).resolve().parent

# 2019 풀에 잘못 들어간 2020+ 발매 트랙 (발매연도 규칙)
WRONG_YEAR_2019 = {
    ("TREASURE", "I Love You"),
    ("TREASURE", "MMM"),
    ("TREASURE", "My Treasure"),
    ("TREASURE", "Come Back Home"),
    ("OH MY GIRL", "Nonstop"),
    ("GFRIEND", "Apple"),
    ("Weki Meki", "Dazzle Dazzle"),
    ("Hyuna", "I'm Not Cool"),
    ("MONSTA X", "FANTASY"),
    ("Everglow", "LA DI DA"),
    ("Apink", "Dumhdurum"),
    ("SuperM", "Tiger Inside"),
    ("NCT 127", "Punch"),
    ("ATEEZ", "Inception"),
    ("TXT", "Blue Hour"),
    ("Dreamcatcher", "Scream"),
    ("LOONA", "Why Not?"),
    ("fromis_9", "Feel Good (SECRET CODE)"),
    ("WJSN", "Neverland"),
    ("PENTAGON", "Dr. Bebe"),
    ("Golden Child", "Dun Dun Dun"),
    ("ONEUS", "TO BE OR NOT TO BE"),
    ("EXO", "Let Me In"),
    ("IU", "eight (Prod.&feat. SUGA of BTS)"),
    ("BOL4", "Some"),
    ("CHUNG HA", "Stay Tonight"),
    ("CHUNG HA", "Bicycle"),
    ("Epik High", "Rosario"),
    ("Crush", "None"),
    ("Loco", "Weak"),
    ("Gray", "Real Love"),
    ("AKMU", "Nakka"),
    ("Heize", "HAPPEN"),
    ("Mamamoo", "Where Are We Now"),
    ("Sunmi", "Pporappippam"),
    ("Jessi", "NUNU NANA"),
    ("Kang Daniel", "Who U Are"),
    ("10CM", "Your Mountain"),
    ("Park Hyo Shin", "Good Goodbye"),
    ("Lee Hi", "Hola"),
    ("BTS", "ON"),
    ("BTS", "Black Swan"),
    ("ENHYPEN", "Given-Taken"),
    ("aespa", "Black Mamba"),
    ("DAY6", "Zombie"),
    ("DAY6", "Love me or Leave me"),
    ("BoA", "Better"),
    ("Mamamoo", "Dingga"),
    ("TXT", "Can't You See Me?"),
    ("TXT", "Run Away"),
    ("TREASURE", "Boy"),
    ("NCT U", "Make A Wish (Birthday Song)"),
    ("Rocket Punch", "Bouncy"),
    ("Cherry Bullet", "Hands Up"),
    ("AB6IX", "Blind For Love"),
    ("CIX", "My My"),
    ("EVERGLOW", "Adios"),
    ("ATEEZ", "Wonderland"),
    ("The Boyz", "D.D.D"),
    ("KARD", "Dumb Litty"),
    ("WayV", "Take Off"),
    ("SuperM", "Jopping"),
    ("SuperM", "100"),
    ("Taeyeon", "Four Seasons"),
    ("Paul Kim", "Me After You"),
    ("Sam Kim", "Make Up"),
    ("Younha", "Event Horizon"),
    ("Jannabi", "for lovers who hesitate"),
    ("DAY6", "Sweet Chaos"),
    ("N.Flying", "Oh really?"),
    ("ONEWE", "Tag Me (@Me)"),
    ("VERIVERY", "Thunder"),
    ("D1CE", "HATE YOU"),
    ("OnlyOneOf", "libidO"),
    ("Colde", "Your Dog Loves You"),
    ("Soran", "The Star"),
    ("George", "Where's Wool"),
    ("Epik High", "Born Hater"),
    ("Hyukoh", "Tomboy"),
    ("Block B", "Don't Leave"),
    ("Standing Egg", "Old Song"),
    ("Ben", "From Ben"),
    ("Zico", "Any Song"),
    ("Song Haye", "I Like You"),
    ("Punch", "Through the Night"),
    ("KNK", "Rain"),
    ("WayV", "Take Off"),
    ("NCT U", "Make A Wish (Birthday Song)"),
    ("SuperM", "Jopping"),
    ("Rocket Punch", "Bouncy"),
    ("Cherry Bullet", "Hands Up"),
    ("CIX", "My My"),
    ("Hwa Sa", "Twit"),
    ("fromis_9", "Love Bomb"),
    ("Soyou", "Gotta Go"),
}

# 실제 2019 발매·차트 후보 (2015–2018 global_seen 제외 후 append)
REPLACEMENT_2019 = [
    ("Zico", "Any Song", ""),
    ("Paul Kim", "Me After You", ""),
    ("Younha", "Event Horizon", "UNSTABLE MINDSET"),
    ("Jannabi", "for lovers who hesitate", "LEGEND"),
    ("Song Haye", "I Like You", ""),
    ("Taeyeon", "Spark", "Purpose - The 2nd Studio Album"),
    ("Red Velvet", "Zimzalabim", "The ReVe Festival Day 1"),
    ("Red Velvet", "Umpah Umpah", "The ReVe Festival Day 2"),
    ("CLC", "ME", "No.1"),
    ("MOMOLAND", "I'm So Hot", "Show Me"),
    ("VIXX", "Parallel", "Conception Ker"),
    ("INFINITE", "Why Why", "Why Why"),
    ("BTOB", "Blue Moon", "Feel'eM"),
    ("ASTRO", "All Night", "All Light"),
    ("SF9", "RPM", "RPM"),
    ("Block B", "Don't Leave", "RECONSTRUCTION"),
    ("iKON", "Dive", "NEW KIDS : THE FINAL"),
    ("WINNER", "Ah Yeah", "WE"),
    ("GOT7", "Eclipse", "Spinning Top : Between Security & Insecurity"),
    ("Stray Kids", "MIROH", "Clé 1 : MIROH"),
    ("SEVENTEEN", "Home", "An Ode"),
    ("NCT 127", "Kick It", "NCT #127 Neo Zone - The 2nd Album"),
    ("NCT DREAM", "BOOM", "We Boom - The 3rd Mini Album"),
    ("EXO", "Obsession", "OBSESSION - The 6th Album"),
    ("BLACKPINK", "Kill This Love", ""),
    ("TWICE", "Fancy", "Fancy You"),
    ("ITZY", "WANNABE", ""),
    ("(G)-IDLE", "Senorita", "I made"),
    ("IU", "Blueming", "Love poem"),
    ("BTS", "Boy With Luv", "MAP OF THE SOUL : PERSONA"),
    ("Mamamoo", "HIP", ""),
    ("Heize", "We don't talk together", "We don't talk together"),
    ("AKMU", "Happening", "HAPPENING"),
    ("Zion.T", "No Love", ""),
    ("Kim Feel", "All I Do", ""),
    ("Vibe", "Vibe", ""),
    ("Davichi", "Changmin's Not Here", ""),
    ("Standing Egg", "Old Song", "Lip"),
    ("Im Chang-jung", "Nothing Like You", ""),
    ("Ben", "From Ben", "Reality"),
    ("The Boyz", "D.D.D", "Dreamlike"),
    ("ATEEZ", "Wonderland", "TREASURE EP.Fin : All To Action"),
    ("WayV", "Take Off", "Take Off"),
    ("NCT U", "Make A Wish (Birthday Song)", "Resonance Pt. 1"),
    ("SuperM", "Jopping", "Super One"),
    ("Colde", "Your Dog Loves You", ""),
    ("Soran", "The Star", ""),
    ("George", "Where's Wool", ""),
    ("Epik High", "Born Hater", "Shoebox"),
    ("Hyukoh", "Tomboy", "24 : How to find true love and happiness"),
    ("Sunmi", "Gotta Go", "WARNING"),
    ("AB6IX", "Blind For Love", "6IX SENSE"),
    ("CIX", "My My", ""),
    ("Rocket Punch", "Bouncy", "Blue Punch"),
    ("Cherry Bullet", "Hands Up", ""),
    ("DAY6", "Sweet Chaos", "The Book of Us : Entropy"),
    ("N.Flying", "Oh really?", "So, 通"),
    ("ONEWE", "Tag Me (@Me)", "ONE"),
    ("VERIVERY", "Thunder", "Truth or Dare"),
    ("D1CE", "HATE YOU", "Wake Up"),
    ("OnlyOneOf", "libidO", "Instinct, Part. 1"),
    ("BoA", "Woman", "ONE SHOT, TWO SHOT"),
    ("Taeyeon", "Wine", "Something New - The 3rd Mini Album"),
    ("Sunny Hill", "Monday to Sunday", "The Beginning of New Endings"),
    ("Brown Eyed Girls", "Wonder Woman", "RE_vive"),
    ("2NE1", "Goodbye", ""),
    ("Everglow", "Adios", "HUSH"),
    ("Taemin", "Want", "WANT"),
    ("Hyolyn", "Say My Name", "Xperience"),
    ("Hwa Sa", "Twit", "Guilty Pleasure"),
    ("Soyou", "Gotta Go", "The Night"),
    ("Ailee", "If You", "If You"),
    ("Son Seung Yeon", "A Person Like You", ""),
    ("Jung Seung Hwan", "The Fan", ""),
    ("Roy Kim", "Only Then", ""),
    ("Teen Top", "Missing", "Missing"),
    ("B.A.P", "Honeymoon", "Honeymoon"),
    ("CNBLUE", "Between Us", "Between Us"),
    ("FTISLAND", "Wind", "Wind"),
    ("N.Flying", "Real Love", "Real Love"),
    ("Primary", "When I Was Young", ""),
    ("Rain", "GANG", ""),
    ("PSY", "New Face", ""),
    ("Gary", "Sunrise", ""),
    ("BewhY", "Day Day", ""),
    ("Mad Clown", "Fire", ""),
    ("Huh Gak", "Spring Rain", ""),
    ("Urban Zakapa", "When We Were Two", ""),
    ("Melomance", "Gift", ""),
    ("DEAN", "instagram", ""),
    ("Standing Egg", "Confession", ""),
    ("Highlight", "Plz Don't Be Sad", "Plz Don't Be Sad"),
    ("Sunmi", "Siren", "WARNING"),
    ("Heize", "We don't talk together (Feat. Giriboy)", "We don't talk together"),
    ("Taemin", "Want", "WANT"),
    ("Dreamcatcher", "Piri", "The End of Nightmare"),
    ("ATEEZ", "Answer", "TREASURE EP.Fin : All To Action"),
    ("Hyolyn", "Say My Name", "Xperience"),
    ("Loona", "Butterfly", "[#]"),
    ("fromis_9", "Love Bomb", "Love Bomb"),
    ("Golden Child", "Lady", "Re-boot"),
    ("Lovelyz", "That Day", "Once Upon a Time"),
    ("WJSN", "La La Love", "WJ PLEASE?"),
    ("IZ*ONE", "Violeta", "Violeta"),
    ("PENTAGON", "Shower of Stars", "Sum(me:r)"),
    ("MOMOLAND", "I'm So Hot", "Show Me"),
    ("OH MY GIRL", "The Fifth Season (SSoL)", "The Fifth Season"),
    ("Apink", "%%", "Percent"),
    ("CHUNG HA", "Snapping", "Flourishing"),
    ("Kang Daniel", "2U", ""),
    ("Baekhyun", "Candy", "Delight - The 4th Mini Album"),
    ("Super Junior", "SUPER Clap", "Timeless"),
    ("SHINee", "I Want You", "The Story of Light 'Epilogue'"),
    ("EXO", "Obsession", "OBSESSION - The 6th Album"),
    ("NCT 127", "Superhuman", "NCT #127 Neo Zone - The 2nd Album"),
    ("Stray Kids", "Double Knot", "Clé : LEVANTER"),
    ("Stray Kids", "Astronaut", "Clé : LEVANTER"),
    ("GFRIEND", "Crossroads", "回:Song of the Sirens"),
    ("GFRIEND", "Tonight", "回:Song of the Sirens"),
    ("Lovelyz", "Once Upon a Time", "Once Upon a Time"),
    ("MOMOLAND", "Thumbs Up", "Show Me"),
    ("(G)-IDLE", "LION", "I made"),
    ("OH MY GIRL", "Bungee (Fall in Love)", "The Fifth Season"),
]


def load(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def write_catalog(catalog: dict[int, list[tuple[str, str, str]]]) -> None:
    lines = [
        '#!/usr/bin/env python3',
        '"""K-pop Top 100 candidate pools (2017-2019). Melon/Gaon/community ordered."""',
        "from __future__ import annotations",
        "",
        "CATALOG_2017_2019: dict[int, list[tuple[str, str, str]]] = {",
    ]
    for year in sorted(catalog):
        lines.append(f"    {year}: [")
        for artist, title, album in catalog[year]:
            lines.append(f"        ({artist!r}, {title!r}, {album!r}),")
        lines.append("    ],")
    lines.append("}")
    lines.append("")
    (GEN / "catalog_2017_2019.py").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    from build_all import track_key
    from top_up_pools import global_seen_through, load as load_catalog

    c1519 = load_catalog(GEN / "catalog_2015_2019.py")
    mod = load(GEN / "catalog_2017_2019.py")
    catalog = {y: list(tracks) for y, tracks in mod.CATALOG_2017_2019.items()}

    raw = {}
    raw.update(c1519.CATALOG_2015_2019)
    raw.update(catalog)
    seen18 = global_seen_through(raw, 2018)

    pool = catalog[2019]
    cleaned = [t for t in pool if (t[0], t[1]) not in WRONG_YEAR_2019]
    cleaned = [t for t in cleaned if track_key(t[0], t[1]) not in seen18]
    have = {(a, b) for a, b, _ in cleaned}
    for item in REPLACEMENT_2019:
        if (item[0], item[1]) in have:
            continue
        if track_key(item[0], item[1]) in seen18:
            continue
        cleaned.append(item)
        have.add((item[0], item[1]))

    seen: set[tuple[str, str]] = set()
    deduped: list[tuple[str, str, str]] = []
    for t in cleaned:
        k = (t[0], t[1])
        if k in seen:
            continue
        seen.add(k)
        deduped.append(t)
    catalog[2019] = deduped

    write_catalog(catalog)
    removed = len(pool) - len([t for t in pool if (t[0], t[1]) not in WRONG_YEAR_2019])
    print(f"2019: removed {removed} wrong-year, pool now {len(deduped)}")


if __name__ == "__main__":
    main()
