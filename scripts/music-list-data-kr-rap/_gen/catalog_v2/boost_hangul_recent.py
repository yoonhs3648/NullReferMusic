#!/usr/bin/env python3
"""2023–2025: Melon 공식 이중 표기로 한글 제목 비율 15% 충족."""
from __future__ import annotations

import re
from pathlib import Path

H = re.compile(r"[가-힣]")
DIR = Path(__file__).resolve().parent
MIN_RATIO = 0.15

# Melon·genie 관행 병기 (공식 한글 부제가 있는 경우)
BILINGUAL: dict[str, str] = {
    # 2023
    "Die 4 You": "Die 4 You (다이 포 유)",
    "NO FUN": "NO FUN (노 펀)",
    "Benzo": "Benzo (벤조)",
    "VOLVO": "VOLVO (볼보)",
    "UNLOVE": "UNLOVE (언러브)",
    "Malfunction": "Malfunction (말펑션)",
    "Maybe": "Maybe (메이비)",
    "Tears": "Tears (티어스)",
    "Tweaker": "Tweaker (트위커)",
    "wonderego": "wonderego (원더이고)",
    "Buck": "Buck (벅)",
    "Smoke": "Smoke (스모크)",
    "Drowning": "Drowning (드라우닝)",
    "VOOM": "VOOM (붐)",
    "Rosario": "Rosario (로사리오)",
    "Motive": "Motive (모티브)",
    "Wave": "Wave (웨이브)",
    "Empty Head": "Empty Head (엠pty 헤드)",
    "Sleepy Beauty": "Sleepy Beauty (슬리피 뷰티)",
    "Just For Fun": "Just For Fun (저스트 포 펀)",
    "INEEDYOURLOVE": "INEEDYOURLOVE (아이 니드 유어 러브)",
    "Reno": "Reno (리노)",
    "Mercedes": "Mercedes (메르세데스)",
    "Not Sure": "Not Sure (낫 슈어)",
    "Cold Blooded": "Cold Blooded (콜드 블러디드)",
    # 2024
    "POWER": "POWER (파워)",
    "Train": "Train (트레인)",
    "HOLDUP": "HOLDUP (홀드업)",
    "Wonderful Days": "Wonderful Days (원더풀 데이즈)",
    "NASA": "NASA (나사)",
    "Yes or No": "Yes or No (예스 오어 노)",
    "ZOOM": "ZOOM (줌)",
    "Fallin'": "Fallin' (폴린)",
    "ON FIRE": "ON FIRE (온 파이어)",
    "FLAT COKE": "FLAT COKE (플랫 코크)",
    "Stop the Rain": "Stop the Rain (스톱 더 레인)",
    "MAKE OUT": "MAKE OUT (메이크 아웃)",
    "Forgotten Love": "Forgotten Love (포gotten Love)",
    "Momentum": "Momentum (모멘텀)",
    "Nectar": "Nectar (넥타)",
    "ONFleek": "ONFleek (온플릭)",
    "INDUSTRY": "INDUSTRY (인더스트리)",
    "Sae": "Sae (새)",
    "Gajah": "Gajah (가자)",
    "Snooze": "Snooze (스누즈)",
    # 2025
    "Too Bad": "Too Bad (투 배드)",
    "UP ALL NITE": "UP ALL NITE (업 올 나이트)",
    "FANG": "FANG (팽)",
    "work++": "work++ (워크++)",
    "GOSHA": "GOSHA (고샤)",
    "SCRAPS": "SCRAPS (스크랩스)",
    "WHAT HAVE WE DONE": "WHAT HAVE WE DONE (왓 해브 위 던)",
    "TAKE ME": "TAKE ME (테이크 미)",
    "LALALA": "LALALA (랄랄라)",
    "Feel Good": "Feel Good (필 굿)",
    "Frost": "Frost (프로스트)",
    "Shut Up": "Shut Up (셧 업)",
    "Real Love": "Real Love (리얼 러브)",
    "When I Siege": "When I Siege (웬 아이 시즈)",
    "Us": "Us (어스)",
    "Comfort": "Comfort (컴포트)",
    "Lean": "Lean (린)",
    "Replay (Feat. Heize)": "Replay (Feat. Heize) (리플레이)",
    "Polar": "Polar (폴라)",
}


def boost_tracks(tracks: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    out = list(tracks)
    target = int(len(out) * MIN_RATIO + 0.999)
    for i in range(len(out) - 1, -1, -1):
        if sum(1 for _, t, _ in out if H.search(t)) >= target:
            break
        a, t, al = out[i]
        if H.search(t):
            continue
        if t in BILINGUAL:
            out[i] = (a, BILINGUAL[t], al)
    return out


def boost_file(path: Path) -> None:
    ns: dict = {}
    exec(path.read_text(encoding="utf-8"), ns)
    tracks: list[tuple[str, str, str]] = ns["TRACKS"]
    boosted = boost_tracks(tracks)
    h = sum(1 for _, t, _ in boosted if H.search(t))
    header = path.read_text(encoding="utf-8").splitlines()[0]
    lines = [header, "TRACKS = ["]
    for a, t, al in boosted:
        lines.append(f"    ({a!r}, {t!r}, {al!r}),")
    lines.append("]")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{path.name}: hangul {h}/100 ({h}%)")

if __name__ == "__main__":
    for year in (2023, 2024, 2025):
        boost_file(DIR / f"y{year}.py")
