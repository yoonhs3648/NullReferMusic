#!/usr/bin/env python3
"""Build y2018.py with 100 dedupe-safe tracks."""
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from fix_and_emit import load_mjs_tracks, load_global_exclude, norm_key, has_bad_suffix, DATA
from real_catalog_data import REAL_CATALOG

CANDIDATES = [
    ("Zico", "What's Wrong?", "What's Wrong?"),
    ("Crush", "WooAh", "From Midnight to Sunrise"),
    ("Crush", "Fallin'", "From Midnight to Sunrise"),
    ("Crush", "From Midnight to Sunrise", "From Midnight to Sunrise"),
    ("Crush", "Mayday", "From Midnight to Sunrise"),
    ("Crush", "Wake Up", "From Midnight to Sunrise"),
    ("Heize", "HAPPEN", "HAPPEN"),
    ("Heize", "Undo", "HAPPEN"),
    ("Heize", "Can You See My Heart", "HAPPEN"),
    ("Heize", "Run to You", "HAPPEN"),
    ("Dean", "Pompeii", ""),
    ("Dean", "DMT", ""),
    ("Sik-K", "FL1X", "FL1X"),
    ("Sik-K", "NEONBEAM", "FL1X"),
    ("Sik-K", "WATER", "FL1X"),
    ("Sik-K", "LOVEADICT", "FL1X"),
    ("Sik-K", "Donut 2", "FL1X"),
    ("Giriboy", "Engineering", "Engineering"),
    ("Giriboy", "PlanetariuM", "Engineering"),
    ("Giriboy", "Used to Love You", "Engineering"),
    ("Giriboy", "Infrared Radiation", "Engineering"),
    ("Swings", "Upgrade III", "Upgrade III"),
    ("Swings", "V", "Upgrade III"),
    ("Swings", "Brand New Day", "Upgrade III"),
    ("Mino", "Trigger", "XX"),
    ("Mino", "Fiancé", "XX"),
    ("Mino", "XX", "XX"),
    ("Mino", "Uh Ahchoo", "XX"),
    ("Mino", "Body", "XX"),
    ("Loco", "Hero", "Hero"),
    ("Loco", "Some", "Hero"),
    ("Loco", "Oceans", "Hero"),
    ("Loco", "Waiting For Love", "Hero"),
    ("Gray", "Tik Tak Tok", ""),
    ("Gray", "Late Night", "Gray Season 2.5"),
    ("Coogie", "Coogie", "Coogie"),
    ("Coogie", "Bouncin'", "Coogie"),
    ("Coogie", "Wifey", "Emo #1"),
    ("Coogie", "GPS", "Emo #1"),
    ("Coogie", "Glow", ""),
    ("Coogie", "I'mma Do", ""),
    ("HAON", "Travel", "Penumbra"),
    ("HAON", "Blue", "Penumbra"),
    ("HAON", "Blossom", "Penumbra"),
    ("Ash Island", "Malibu", "Ash Island"),
    ("Ash Island", "Limousine Vision", "Ash Island"),
    ("Ash Island", "Howling", "Ash Island"),
    ("Leellamarz", "Don`t Call Me", "To Be Continued"),
    ("Leellamarz", "Profile", "To Be Continued"),
    ("TOIL", "1989", "1989"),
    ("TOIL", "Money", "1989"),
    ("TOIL", "Rollin", "1989"),
    ("Woodie Gochild", "Mood Swings", "#GOchild"),
    ("Woodie Gochild", "Dirtbag", "#GOchild"),
    ("Woodie Gochild", "GOchild", "#GOchild"),
    ("Jvcki Wai", "Doughnet", "Exposure"),
    ("Jvcki Wai", "Neo Eve", "Exposure"),
    ("Punchnello", "Cool", "Cool"),
    ("Tablo", "Fantasy", "Drill Presents: Tablo x Fantasy"),
    ("Tablo", "Drill Presents", "Drill Presents: Tablo x Fantasy"),
    ("Paloalto", "Shangri-La", "Shangri-La"),
    ("Simon Dominic", "NO OPEN FLAME", "NO OPEN FLAME"),
    ("Simon Dominic", "ART OF PARTYING", "NO OPEN FLAME"),
    ("Jay Park", "Likes", ""),
    ("Jay Park", "Can't Be Saved", ""),
    ("Nafla", "Natural Born Killers", "Natural Born Killers"),
    ("Loopy", "King Loopy", "King Loopy"),
    ("Kid Milli", "Yellow", "Maiden Voyage"),
    ("PH-1", "Homebody", "YIN YANG"),
    ("Blase", "Blue", ""),
    ("Mirani", "Ticket", "Ticket"),
    ("YUMDDA", "Tic Toc", "I'm Good"),
    ("BewhY", "Cult of Curiosity", "Cult of Curiosity"),
    ("Hash Swan", "Hash Brand", "Hash Brand"),
    ("NO:EL", "Rain Drop", "Rain Drop"),
    ("Kid Ash", "Orca", "Orca-Tape"),
    ("C Jamm", "Monster", ""),
    ("Olltii", "Creative Control", "Creative Control"),
    ("Flowsik", "We On", "Show Me the Money 777"),
    ("Reddy", "Think", "Show Me the Money 777"),
    ("KittiB", "Nobody Knows", "Show Me the Money 777"),
    ("Jessi", "Gucci", "Show Me the Money 777"),
    ("Punchnello", "If You", "Show Me the Money 777"),
    ("Loopy", "No Loopy", "Show Me the Money 777"),
    ("Nafla", "What", "Show Me the Money 777"),
    ("Mino", "Fear", "Show Me the Money 777"),
    ("D.Ark", "Undercover", "Show Me the Money 777"),
    ("D.Ark", "Genius", "Show Me the Money 777"),
    ("Deepflow", "Flow the Life 4", "Flow the Life 4"),
    ("Don Mills", "Don Mills Is Angry 4", "Don Mills Is Angry 4"),
    ("Huckleberry P", "Mantra 4", "Mantra 4"),
    ("Verbal Jint", "Rap Genius No. 9", "Rap Genius No. 9"),
    ("Primary", "Planetarium", ""),
    ("Elo", "Tattoo On My Heart", "Tattoo On My Heart"),
    ("Swings", "Remedy", "Remedy"),
    ("Changmo", "Boyhood", "Boyhood"),
    ("Changmo", "Meteor", "Boyhood"),
    ("Changmo", "Sufferer", "Boyhood"),
    ("Giriboy", "914", "914"),
    ("Giriboy", "Invasion", "914"),
    ("Leellamarz", "To Be Continued", "To Be Continued"),
    ("Nafla", "Jazz Freestyle", "[ Album ]"),
    ("Loopy", "Portrait Mode", "[ Album ]"),
    ("Kid Milli", "Cappuccino", ""),
    ("Kid Milli", "Maiden Voyage", "Maiden Voyage"),
    ("PH-1", "YIN YANG", "YIN YANG"),
    ("PH-1", "Platonic", "YIN YANG"),
    ("Zico", "Any Song", ""),
    ("Zico", "SoulMate", ""),
    ("Beenzino", "Damnato", "Damnato"),
    ("Beenzino", "Holiday", "Damnato"),
    ("Dean", "instagram", ""),
    ("Loco", "It Takes Time", ""),
    ("Gray", "Real Love", ""),
    ("Dynamic Duo", "AEAO", "A DynamicAffair"),
    ("Epik High", "Rosario", "Sleepless in __________"),
    ("Penomeco", "COCO BOTTLE", ""),
    ("Penomeco", "OFM", ""),
    ("Colde", "Your Dog Loves You", "Your Dog Loves You"),
    ("Punchnello", "Loving You Girl", "Loving You Girl"),
    ("Swings", "Growing Pains 2", "Growing Pains 2"),
    ("Sokodomo", "Merry Go Round", "Merry Go Round"),
    ("Owen Ovadoz", "Drama", "Drama"),
    ("Lil Moshpit", "MOSHPIT", "MOSHPIT"),
    ("Gaeko", "Gajah", "Gajah"),
    ("San E", "a SONG of ICE and FIRE", "a SONG of ICE and FIRE"),
    ("E-Sens", "Gold", "The Anecdote"),
    ("Primary", "Morning Glory", ""),
    ("Dok2", "All I Know Is", "Thug Life Part 2"),
    ("Bobby", "Y.G.G", "Y.G.G"),
    ("Coogie", "PICK UP THE PHONE", ""),
    ("Coogie", "Money & Fame", ""),
    ("Leellamarz", "Wavy", ""),
    ("Mirani", "Bayer Dynamic", "Ticket"),
    ("Blase", "Love Me", "Passionfruit"),
    ("Blase", "Ride", "Passionfruit"),
    ("TOIL", "ON FIRE", "1989"),
    ("TOIL", "Switch", "1989"),
    ("HAON", "Swervin", "ISLAND"),
    ("Ash Island", "ISLAND", "ISLAND"),
    ("Giriboy", "heat", "heat"),
    ("Changmo", "Ghetto Kids", "Ghetto Kids"),
    ("Nafla", "C.R.E.A.M", "C.R.E.A.M"),
    ("Kid Milli", "BEANie", "BEANie"),
    ("Woodie Gochild", "Channel", "#GOchild"),
    ("Mudd the student", "Sleepy Beauty", ""),
    ("Lil Boi", "Empty Head", ""),
    ("Jvcki Wai", "Taxi Blurr", "Taxi Blurr"),
    ("Swings", "Hongkiyoung", ""),
    ("Swings", "A Real Lady", "Growing Pains"),
    ("Illinit", "Real Talk Live", ""),
    ("B-Free", "Best Seller", "Best Seller"),
    ("Okasian", "Airplane Mode", ""),
    ("Junggigo", "Want U", ""),
    ("Basick", "Hold You", "Show Me the Money 4"),
    ("Iron", "Rain Shower", "Show Me the Money 4"),
    ("Louie", "GO", "Show Me the Money 4"),
    ("Truedy", "My Light", "Show Me the Money 4"),
    ("Black Nut", "100", "Show Me the Money 4"),
    ("Killagramz", "Good Morning", "Show Me the Money 5"),
    ("Hanhae", "Drop", "Show Me the Money 5"),
    ("C Jamm", "The Last", "Show Me the Money 5"),
    ("BewhY", "The Fiery", "The Fiery"),
    ("Giriboy", "Mechanical Album", "Mechanical Album"),
    ("Crush", "Your Dress", ""),
    ("Heize", "Round and Round", ""),
    ("Zion.T", "Knock", "Show Me the Money 5"),
    ("Simon Dominic", "DAx4", "DAx4"),
    ("Punchnello", "Everyday", "Everyday"),
    ("Colde", "In Your Eyes", "In Your Eyes"),
    ("BewhY", "Day Day", "The Movie Star"),
    ("BewhY", "Forever", "The Movie Star"),
    ("Sik-K", "MAKE OUT", "MAKE OUT"),
    ("Kid Milli", "SIT", "BEANie"),
    ("Leellamarz", "3AM in Seoul", "To Be Continued"),
    ("Dynamic Duo", "BAAAM", "A DynamicAffair"),
    ("Primary", "2 Weeks", "2"),
    ("Simon Dominic", "Simon Dominic Part 3", "Simon Dominic Part 3"),
    ("Swings", "Upgrade III", "Upgrade III"),
    ("Flowsik", "We On", "Show Me the Money 777"),
]

def build_used_through(year_end: int) -> set[str]:
    exclude = load_global_exclude()
    used: set[str] = set()
    for y in (2010, 2011):
        for a, t, _ in load_mjs_tracks(os.path.join(DATA, f"{y}.mjs")):
            used.add(norm_key(a, t))
    for year in range(2012, year_end):
        for a, t, al in REAL_CATALOG[year]:
            if has_bad_suffix(t):
                continue
            k = norm_key(a, t)
            if k in used or k in exclude:
                continue
            used.add(k)
    return used, exclude


def main() -> None:
    used, exclude = build_used_through(2018)
    picked: list[tuple[str, str, str]] = []
    skipped = []
    for item in CANDIDATES:
        a, t, al = item
        k = norm_key(a, t)
        if k in used or k in exclude:
            skipped.append((a, t))
            continue
        used.add(k)
        picked.append(item)
        if len(picked) == 100:
            break
    print(f"picked {len(picked)}, skipped {len(skipped)}")
    if len(picked) < 100:
        print("NOT ENOUGH")
        return
    lines = ["TRACKS = ["]
    for a, t, al in picked:
        lines.append(f'    ({a!r}, {t!r}, {al!r}),')
    lines.append("]")
    lines.append("")
    out = os.path.join(os.path.dirname(__file__), "real_catalog_data", "y2018.py")
    open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
