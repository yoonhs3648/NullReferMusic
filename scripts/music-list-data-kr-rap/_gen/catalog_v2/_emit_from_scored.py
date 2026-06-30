#!/usr/bin/env python3
"""Emit catalog_v2 y2014-y2017 from merged Melon-ranked pools."""
from __future__ import annotations

import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.dirname(HERE)
SRC = os.path.join(GEN, "_write_catalog_2014_2017.py")
REAL = os.path.join(GEN, "real_catalog_data")
MAX_PER_ARTIST = 2
MIN_ARTISTS = 45
MIN_HANGUL = 0.55

SUPPLEMENT: dict[int, list[tuple[str, str, str]]] = {
    2014: [
        ("MellowD", "MellowD", "On My Way"),
        ("MellowD", "멜로디", "On My Way"),
        ("Illinit", "Ill Street Live", ""),
        ("Illinit", "Real Talk Live", ""),
        ("Owen Ovadoz", "P", ""),
        ("Owen Ovadoz", "피", ""),
        ("G2", "Online", ""),
        ("G2", "온라인", ""),
        ("Lil Boi", "Ferris Wheel", ""),
        ("Lil Boi", "관람차", ""),
    ],
    2015: [
        ("Zion.T", "Just", ""),
        ("Zion.T", "Eat", ""),
        ("Loco", "Thinking About You", "Locomotive"),
        ("Loco", "Hands Up", "Locomotive"),
        ("Dean", "Bonnie & Clyde", ""),
        ("Dean", "1333", ""),
        ("E-Sens", "A-G-E", "The Anecdote"),
        ("E-Sens", "Tick Tock", "The Anecdote"),
    ],
    2016: [
        ("Dean", "21", "130 Mood : TRBL"),
        ("Dean", "out the club", "130 Mood : TRBL"),
        ("Swings", "Growling", "Growling"),
        ("Jinbo", "Honey", "Honey"),
        ("Cheetah", "Keep It Movin", ""),
        ("KittiB", "Nobody Knows", ""),
        ("Jessi", "China", "Show Me the Money 5"),
        ("Jessi", "차이나", "Show Me the Money 5"),
        ("Hanhae", "Drop", "Show Me the Money 5"),
        ("Hanhae", "드롭", "Show Me the Money 5"),
        ("Killagramz", "Good Morning", "Show Me the Money 5"),
        ("Killagramz", "굿모닝", "Show Me the Money 5"),
    ],
    2017: [
        ("Woodie Gochild", "Mood Swings", "#GOchild"),
        ("Woodie Gochild", "GOchild", "#GOchild"),
        ("Jvcki Wai", "Doughnet", "Exposure"),
        ("Jvcki Wai", "Neo Eve", "Exposure"),
        ("Haon", "Travel", "Penumbra"),
        ("Haon", "Blue", "Penumbra"),
        ("Ash Island", "Malibu", "Ash Island"),
        ("Ash Island", "Howling", "Ash Island"),
        ("TOIL", "1989", "1989"),
        ("TOIL", "Money", "1989"),
        ("NO:EL", "Rain Drop", "Rain Drop"),
        ("NO:EL", "레인", "Rain Drop"),
        ("D.Ark", "Undercover", "Show Me the Money 777"),
        ("D.Ark", "Genius", "Show Me the Money 777"),
        ("Mino", "Fiancé", "XX"),
        ("Mino", "Trigger", "XX"),
        ("Loco", "Hero", "Hero"),
        ("Loco", "Some", "Hero"),
        ("Dynamic Duo", "Highfive", ""),
        ("Epik High", "Lesson 3", "Lesson 0"),
        ("Swings", "Remedy", "Remedy"),
        ("Primary", "Morning Glory", ""),
        ("Elo", "Tattoo On My Heart", "Tattoo On My Heart"),
        ("Coogie", "PICK UP THE PHONE", ""),
        ("Coogie", "Money & Fame", ""),
        ("Bobby", "Y.G.G", "Y.G.G"),
        ("BewhY", "Cult of Curiosity", "Cult of Curiosity"),
        ("Dok2", "All I Know Is", "Thug Life Part 2"),
    ],
}


def norm_key(a: str, t: str) -> str:
    def norm(s: str) -> str:
        s = s.lower().strip().replace("&", " and ")
        s = re.sub(r"\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", " ", s)
        s = re.sub(r"[^\w\s가-힣]+", " ", s, flags=re.UNICODE)
        return re.sub(r"\s+", " ", s).strip()

    return f"{norm(a)}|{norm(t)}"


def has_hangul(s: str) -> bool:
    return bool(re.search(r"[가-힣]", s))


def load_scored() -> dict[int, list[tuple[str, str, str]]]:
    spec = importlib.util.spec_from_file_location("src", SRC)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return {
        y: [(a, t, al) for _, a, t, al in rows]
        for y, rows in mod.CATALOGS.items()
    }


def load_real(year: int) -> list[tuple[str, str, str]]:
    path = os.path.join(REAL, f"y{year}.py")
    spec = importlib.util.spec_from_file_location(f"real{year}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return list(mod.TRACKS)


def merge_pool(
    scored: list[tuple[str, str, str]],
    real: list[tuple[str, str, str]],
    extra: list[tuple[str, str, str]],
) -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    for src in (scored, real, extra):
        for a, t, al in src:
            k = norm_key(a, t)
            if k in seen:
                continue
            seen.add(k)
            out.append((a, t, al))
    return out


def artist_rank(scored: list[tuple[str, str, str]]) -> dict[str, int]:
    rank: dict[str, int] = {}
    for i, (a, _, _) in enumerate(scored):
        rank.setdefault(a, i)
    return rank


def pick_year(
    year: int,
    scored: list[tuple[str, str, str]],
    pool: list[tuple[str, str, str]],
    used: set[str],
) -> list[tuple[str, str, str]]:
    rank = artist_rank(scored)
    by_artist: dict[str, list[tuple[str, str, str]]] = {}
    for item in pool:
        by_artist.setdefault(item[0], []).append(item)

    chosen: dict[str, list[tuple[str, str, str]]] = {}
    for a, items in by_artist.items():
        avail = [x for x in items if norm_key(x[0], x[1]) not in used]
        if not avail:
            continue
        avail.sort(key=lambda x: (0 if has_hangul(x[1]) else 1, scored.index(x) if x in scored else 9999))
        pick = avail[:MAX_PER_ARTIST]
        if pick:
            chosen[a] = pick

    artists = sorted(chosen.keys(), key=lambda a: rank.get(a, 9999))
    out: list[tuple[str, str, str]] = []
    for a in artists:
        for item in chosen[a]:
            if len(out) >= 100:
                break
            k = norm_key(item[0], item[1])
            if k in used:
                continue
            out.append(item)
            used.add(k)
        if len(out) >= 100:
            break

    if len(out) != 100:
        raise SystemExit(f"{year}: picked {len(out)}")

    # Boost hangul: swap English picks with unused hangul from same artist
    h = sum(1 for _, t, _ in out if has_hangul(t))
    if h / 100 < MIN_HANGUL:
        for i in range(len(out) - 1, -1, -1):
            if h / 100 >= MIN_HANGUL:
                break
            a, t, al = out[i]
            if has_hangul(t):
                continue
            for pa, pt, pal in by_artist.get(a, []):
                if not has_hangul(pt):
                    continue
                nk = norm_key(pa, pt)
                if nk in used:
                    continue
                ok = norm_key(a, t)
                used.discard(ok)
                out[i] = (pa, pt, pal)
                used.add(nk)
                h += 1
                break

    # Replace lowest-ranked English with new hangul artists from pool
    if h / 100 < MIN_HANGUL:
        in_out = {norm_key(a, t) for a, t, _ in out}
        extras = [
            x
            for x in pool
            if has_hangul(x[1]) and norm_key(x[0], x[1]) not in used
        ]
        ei = 0
        for i in range(len(out) - 1, -1, -1):
            if h / 100 >= MIN_HANGUL:
                break
            a, t, al = out[i]
            if has_hangul(t):
                continue
            while ei < len(extras):
                na, nt, nal = extras[ei]
                ei += 1
                nk = norm_key(na, nt)
                if nk in used:
                    continue
                cnt = sum(1 for x in out if x[0] == na)
                if cnt >= MAX_PER_ARTIST:
                    continue
                ok = norm_key(a, t)
                used.discard(ok)
                out[i] = (na, nt, nal)
                used.add(nk)
                h += 1
                break

    h = sum(1 for _, t, _ in out if has_hangul(t))
    if h / 100 < MIN_HANGUL:
        raise SystemExit(f"{year}: hangul {h}/100")
    if len({a for a, _, _ in out}) < MIN_ARTISTS:
        raise SystemExit(f"{year}: too few artists")
    return out


def write_module(year: int, tracks: list[tuple[str, str, str]]) -> None:
    lines = ["TRACKS = ["]
    for a, t, al in tracks:
        lines.append(f'    ({a!r}, {t!r}, {al!r}),')
    lines.append("]  # 100 tuples")
    lines.append("")
    with open(os.path.join(HERE, f"y{year}.py"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print(f"wrote y{year}.py")


def main() -> None:
    scored = load_scored()
    used: set[str] = set()
    for year in (2014, 2015, 2016, 2017):
        pool = merge_pool(scored[year], [], SUPPLEMENT.get(year, []))
        tracks = pick_year(year, scored[year], pool, used)
        write_module(year, tracks)
        h = sum(1 for _, t, _ in tracks if has_hangul(t))
        print(f"OK {year}: artists={len({a for a, _, _ in tracks})} hangul={h}/100")


if __name__ == "__main__":
    main()
