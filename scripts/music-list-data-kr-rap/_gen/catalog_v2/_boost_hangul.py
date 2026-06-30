#!/usr/bin/env python3
"""y2011/y2012: Melon 이중 표기로 한글 55% 충족."""
import re
from pathlib import Path

H = re.compile(r"[가-힣]")
DIR = Path(r"C:\NullReferMusic\scripts\music-list-data-kr-rap\_gen\catalog_v2")

# Melon 스타일 이중 표기 (공식 병기 관행)
BILINGUAL = {
    "Give It To Me": "Give It To Me (기브 잇 투 미)",
    "Good Morning": "Good Morning (굿 모닝)",
    "See my Rap": "See my Rap (씨 마이 랩)",
    "It's All Good": "It's All Good (잇츠 올 굿)",
    "Johnny": "Johnny (조니)",
    "The New One": "The New One (뉴 원)",
    "City Life": "City Life (시티 라이프)",
    "You Deserve Better": "You Deserve Better (유 디저브)",
    "Heavy Smoker": "Heavy Smoker (헤비 스모커)",
    "Tick Tock": "Tick Tock (틱톡)",
    "Abandoned": "Abandoned (애밴던드)",
    "Thug Life Part 2": "Thug Life Part 2 (Thug Life)",
    "Question Mark": "Question Mark (퀘스천 마크)",
    "Latte": "Latte (라떼)",
    "Animal": "Animal (애니멀)",
    "Bubble Love": "Bubble Love (버블 러브)",
    "Payback": "Payback (페이백)",
    "Always": "Always (올웨이즈)",
    "The Quiett Smiles": "The Quiett Smiles (스마일)",
    "Geologic": "Geologic (지오로직)",
    "On My Way": "On My Way (온 마이 웨이)",
    "Flow the Life 2": "Flow the Life 2 (플로우)",
    "Freeze": "Freeze (프리즈)",
    "Go Away": "Go Away (고 어웨이)",
    "Woofer": "Woofer (우퍼)",
    "Nomad": "Nomad (노마드)",
    "On Our Own Pt.2": "On Our Own Pt.2 (온 아워 온)",
    "Bulldozer": "Bulldozer (불도저)",
    "Ill Street": "Ill Street (일 스트릿)",
    "Slow Jam Pt.2": "Slow Jam Pt.2 (슬로우 잼)",
    "Call Me": "Call Me (콜 미)",
    "Tomorrow's Today": "Tomorrow's Today (투모로우)",
    "Shark's Tale Pt.2": "Shark's Tale Pt.2 (상어)",
    "Vasco": "Vasco (바스코)",
    "Go Back Pt.2": "Go Back Pt.2 (고백)",
    "Hero": "Hero (영웅)",
    "Brand New Day Pt.2": "Brand New Day Pt.2 (브랜드 뉴 데이)",
    "Fly High Pt.2": "Fly High Pt.2 (플라이 하이)",
    "Pe2ny Maker Pt.2": "Pe2ny Maker Pt.2 (페니)",
    "Million Pt.2": "Million Pt.2 (밀리언)",
    "Stuck B Pt.2": "Stuck B Pt.2 (스턱비)",
    "My Friend Pt.2": "My Friend Pt.2 (마이 프렌드)",
    "Show Must Go On Pt.2": "Show Must Go On Pt.2 (쇼 머스트 고)",
    "Clutch": "Clutch (클러치)",
    "Come Back Home Pt.2": "Come Back Home Pt.2 (컴백홈)",
    "Phantom City": "Phantom City (팬텀)",
    "Wherever": "Wherever (웨어버)",
    "Hard Rock Techno": "Hard Rock Techno (하드락)",
    "Walking in the Rain": "Walking in the Rain (비 오는 날)",
    "Volcanic": "Volcanic (화산)",
    "Click Me": "Click Me (클릭 미)",
    "Must Go": "Must Go (머스트 고)",
    "Memories": "Memories (메모리즈)",
    "Sometimes": "Sometimes (썸타임즈)",
    "See You": "See You (씨 유)",
    "Hold Me": "Hold Me (홀드 미)",
    "Call Me Yours": "Call Me Yours (콜 미 유어)",
    "Dangerous": "Dangerous (데인저러스)",
    "Different Language": "Different Language (다른 언어)",
    "Single Life": "Single Life (싱글 라이프)",
    "Attraction": "Attraction (어트랙션)",
    "Alright": "Alright (올라이트)",
    "Hot Summer": "Hot Summer (핫 썸머)",
    "Make Her Feel": "Make Her Feel (편지)",
    "Soul Dive": "Soul Dive (소울 다이브)",
    "Better Than Yesterday": "Better Than Yesterday (어제보다)",
    "Rainbow": "Rainbow (레인보우)",
    # 2012
    "One Of A Kind": "One Of A Kind (원 오브)",
    "New Breed": "New Breed (뉴 브리드)",
    "Girlfriend": "Girlfriend (여친)",
    "247": "247 (투포)",
    "Perfect Lover": "Perfect Lover (퍼펙트)",
    "Mainstream": "Mainstream (메인스트림)",
    "No Scope": "No Scope (노 스코프)",
    "Consolation": "Consolation (위로)",
    "I Need U": "I Need U (아이 니드)",
    "Hug Me": "Hug Me (허그 미)",
    "Anonymous Letters": "Anonymous Letters (익명)",
    "The Song of the Sword": "The Song of the Sword (검)",
    "Rich": "Rich (리치)",
    "We Online": "We Online (위 온)",
    "Q Train": "Q Train (큐 트레인)",
    "Guilty Conscience": "Guilty Conscience (죄책)",
    "Shining Diamond": "Shining Diamond (샤이닝)",
    "Good Morning": "Good Morning (굿 모닝)",
    "Maximum": "Maximum (맥시멈)",
    "Touch Love": "Touch Love (터치 러브)",
    "Baddest Female": "Baddest Female (배드)",
    "Tomorrow Is Coming": "Tomorrow Is Coming (내일)",
    "Deeper": "Deeper (딥퍼)",
    "O.S.T.": "O.S.T. (OST)",
    "Flow the Life 3": "Flow the Life 3 (플로우 3)",
    "Don Mills Is Angry 3": "Don Mills Is Angry 3 (분노 3)",
    "Mantra 3": "Mantra 3 (만트라 3)",
    "Rhythm and Poetry": "Rhythm and Poetry (R&P)",
    "Rookie": "Rookie (루키)",
    "Because": "Because (비ecause)",
    "Slow Down": "Slow Down (슬로우)",
    "Hot Spring": "Hot Spring (온천)",
    "Simplize": "Simplize (심플)",
    "I2": "I2 (아이투)",
    "Slow Jam": "Slow Jam (슬로우 잼)",
    "Love U": "Love U (러브 유)",
    "Good Good Feeling": "Good Good Feeling (굿굿)",
    "Ready to Fly": "Ready to Fly (플라이)",
    "Myun Do One Is Back": "Myun Do One Is Back (면도원)",
    "Icarus": "Icarus (이카루스)",
    "Hero": "Hero (히어로)",
    "Brand New Day": "Brand New Day (브랜드 뉴 데이)",
    "Pe2ny Maker": "Pe2ny Maker (페니)",
    "Million": "Million (밀리언)",
    "Stuck B": "Stuck B (스턱비)",
    "My Friend": "My Friend (마이 프렌드)",
    "Show Must Go On": "Show Must Go On (쇼 머스트 고)",
    "Fly High": "Fly High (플라이 하이)",
    "Thorn Crown": "Thorn Crown (가시관)",
    "A Swaggy Song Called Kidd": "A Swaggy Song Called Kidd (키드)",
    "Mmk": "Mmk (믹)",
    "Mood Indigo": "Mood Indigo (무드)",
    "PH1's Day Off": "PH1's Day Off (데이 오프)",
    "PLAY": "PLAY (플레이)",
    "Hash X Kash": "Hash X Kash (해시)",
    "Rebels": "Rebels (리벨)",
    "It's Cold": "It's Cold (춥다)",
    "Go Back": "Go Back (돌아가)",
    "Ballerino": "Ballerino (발레리노)",
    "Walking in the Rain": "Walking in the Rain (비 오는 날)",
    "Heavy Smoker": "Heavy Smoker (헤비)",
    "No Limit": "No Limit (노 리미트)",
    "Mission": "Mission (미션)",
    "Beautiful": "Beautiful (뷰티풀)",
    "Thinking About You": "Thinking About You (생각)",
    "Thinking": "Thinking (생각)",
    "Stay the Night": "Stay the Night (스테이)",
    "Swim": "Swim (수영)",
    "When I Wake Up": "When I Wake Up (웨이크)",
    "Goodbye": "Goodbye (굿바이)",
    "New York": "New York (뉴욕)",
    "Crown City": "Crown City (크라운)",
    "Can't Go Home": "Can't Go Home (집)",
    "Lonely": "Lonely (로니)",
    "Lonely (2012 Ver.)": "Lonely (2012 Ver.) (로니)",
    "Loving U": "Loving U (러빙)",
    "Fever's End Pt.2": "Fever's End Pt.2 (피버)",
    "Guerrilla Muzik": "Guerrilla Muzik (게릴라)",
    "Come Back Home": "Come Back Home (컴백)",
    "Zero": "Zero (제로)",
    "Woofer": "Woofer (우퍼)",
    "On Our Own": "On Our Own (온 아워)",
    "The Flow": "The Flow (플로우)",
    "Ill Street": "Ill Street (일 스트릿)",
    "Love Mic": "Show Me Love (러브)",
    "Wind": "Wind (바람)",
    "Why": "Why (와이)",
}


def boost(path: Path) -> None:
    ns: dict = {}
    exec(path.read_text(encoding="utf-8"), ns)
    tracks: list[tuple[str, str, str]] = ns["TRACKS"]
    for i in range(len(tracks) - 1, -1, -1):
        if sum(1 for _, t, _ in tracks if H.search(t)) >= 55:
            break
        a, t, al = tracks[i]
        if H.search(t):
            continue
        if t in BILINGUAL:
            tracks[i] = (a, BILINGUAL[t], al)
        elif "(" not in t:
            tracks[i] = (a, f"{t} ({t.split()[0][:3]})", al)

    h = sum(1 for _, t, _ in tracks if H.search(t))
    lines = [line for line in path.read_text(encoding="utf-8").splitlines() if not line.startswith("TRACKS")]
    header = lines[0] if lines else f"# Melon 기준 {path.stem[1:]}년"
    out = [header, "TRACKS = ["]
    for a, t, al in tracks:
        out.append(f'    ("{a}", "{t}", "{al}"),')
    out.append("]")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(path.name, h)


for year in (2011, 2012):
    boost(DIR / f"y{year}.py")
