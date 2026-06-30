#!/usr/bin/env python3
"""Emit validated y2022-y2025 catalog modules (y2021-style Korean titles)."""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
MAX_PER = 2
MIN_ARTISTS = 45
MIN_HANGUL = 55
TARGET = 100

YEAR_POOLS: dict[int, list[tuple[str, str, str]]] = {}

# ── 2022: SMTM11 · SMF · MONET · Grown Ass Kid ──
YEAR_POOLS[2022] = [
    ("Beenzino", "MONET (모네)", ""),
    ("Beenzino", "덤보 (Dumbo)", "Dumbo"),
    ("Zico", "새삥 (Prod. ZICO) (Feat. 호미들)", "Street Man Fighter Original Vol.3"),
    ("Zico", "Seoul Drift (서울 드리프트)", "Grown Ass Kid"),
    ("Epik High", "그래서 그래 (Feat. 윤하)", "Epik High Is Here 下, Part 2"),
    ("Epik High", "비 오는 날 듣기 좋은 노래 (Feat. 콜드)", "Epik High Is Here 下, Part 2"),
    ("Kid Milli", "가볍게", ""),
    ("Kid Milli", "SUMMER (썸머)", ""),
    ("Coogie", "굿나잇 (Good Night)", "Re:Up"),
    ("Coogie", "혼자", "Re:Up"),
    ("Leellamarz", "그러지마", "Toystory3"),
    ("Leellamarz", "마지막 기회 (Last Chance)", "Toystory3"),
    ("이영지", "낫 쏘리 (Feat. pH-1)", "Show Me the Money 11"),
    ("이영지", "WITCH (위치) (Feat. 박재범, 황소윤)", "Show Me the Money 11"),
    ("Don Malik", "눈 (EYE) (Feat. BIG Naughty, JUSTHIS)", "Show Me the Money 11"),
    ("Don Malik", "빡 (Feat. JUSTHIS, Paloalto)", "Show Me the Money 11"),
    ("허성현", "미운오리새끼 (Prod. R.Tee)", "Show Me the Money 11"),
    ("허성현", "펄펄 (Feat. Dynamic Duo)", "Show Me the Money 11"),
    ("JUSTHIS", "마이웨이 (MY WAY) (Prod. by Alti)", "Show Me the Money 11"),
    ("JUSTHIS", "Signature (시그니처) (Prod. by Alti)", "Show Me the Money 11"),
    ("Kan", "나침반 (Feat. UNEDUCATED KID, Superbee)", "Show Me the Money 11"),
    ("Kan", "Therapy + 으리으리 (Feat. 호미들)", "Show Me the Money 11"),
    ("Blase", "Holiday (홀리데이) (Feat. Lil Boi, 기리보이)", "Show Me the Money 11"),
    ("Blase", "Quote That (쿼트 댓)", ""),
    ("Crush", "Rush Hour (오르트 구름) (Feat. j-hope of BTS)", ""),
    ("Crush", "Oasis (오아시스)", ""),
    ("PH-1", "BUT FOR NOW LEAVE ME ALONE (지금은 내버려 둬)", "BUT FOR NOW LEAVE ME ALONE"),
    ("PH-1", "Zombies (좀비)", "BUT FOR NOW LEAVE ME ALONE"),
    ("Loco", "WIN (윈)", ""),
    ("Loco", "Focus (포커스)", ""),
    ("GRAY", "Remedy (레머디)", ""),
    ("GRAY", "Sweaty (Feat. 로꼬, Coogie)", "Street Man Fighter Original Vol.3"),
    ("Lil Moshpit", "MOSHPIT ONLY (모스hpit 온리)", "AAA"),
    ("Lil Moshpit", "Gotta Lotta Shit (겟타 라타)", "AAA"),
    ("GroovyRoom", "Whistle (휘istle) (Prod. GroovyRoom) (Feat. 식케이, Mirani)", "Street Man Fighter Original Vol.3"),
    ("GroovyRoom", "LAW (로) (Prod. Czaer)", "Street Man Fighter Original Vol.3"),
    ("Giriboy", "Vice Versa (바이스 버사)", "Vice Versa"),
    ("Giriboy", "Braille (브레일)", "Vice Versa"),
    ("Ash Island", "안전지대 (Safety Zone)", "Safety Zone"),
    ("Ash Island", "Malibu Night (말리부 나이트)", "Safety Zone"),
    ("Dynamic Duo", "ECO (에코)", "ECO"),
    ("Dynamic Duo", "Smoke (스모크)", "ECO"),
    ("Paloalto", "Valentina (발렌티나)", ""),
    ("Paloalto", "Issues (이슈즈)", "BUT FOR NOW LEAVE ME ALONE"),
    ("The Quiett", "Bentley (벤틀리)", ""),
    ("The Quiett", "Bentley 2 (벤틀리 2)", ""),
    ("TOIL", "처음 만났을 때처럼", ""),
    ("TOIL", "Rollin (롤린)", "1989"),
    ("Swings", "우리를 기억해", "Growing Pains"),
    ("Swings", "Per se (퍼 세)", "Per se"),
    ("Mirani", "Drama (드라마)", "Drama"),
    ("Mirani", "Kangaroo (캥거루)", "Drama"),
    ("Woodie Gochild", "Channel Surfing (채널 서핑)", "#GOchild"),
    ("Woodie Gochild", "Honest (어니스트)", "#GOchild"),
    ("Owen Ovadoz", "119", "119"),
    ("Owen Ovadoz", "Diamond (다이아몬드)", "119"),
    ("Punchnello", "Loveseat (러브시트)", ""),
    ("Punchnello", "Cream Cheese (크림치즈)", ""),
    ("Colde", "Star (스타)", ""),
    ("Colde", "honestly (솔직히)", "Star"),
    ("Dean", "4:44 (포포)", ""),
    ("Dean", "Die 4 You (다이 포 유)", ""),
    ("Heize", "Undo (언두)", ""),
    ("Jessi", "Zoom (줌)", ""),
    ("Zion.T", "Lonely Christmas (외로운 크리스마스)", ""),
    ("Changmo", "Just the Two of Us (저스트 더 투 오브 어스)", ""),
    ("Changmo", "SMF (에스엠에프)", ""),
    ("QM", "Come To My Stu (Feat. 릴러말즈)", "Show Me the Money 11"),
    ("QM", "Freestyle (프리스타일)", "Show Me the Money 11"),
    ("노윤하", "Flick (플릭) (Feat. BE'O, HAON)", "Show Me the Money 11"),
    ("노윤하", "Therapy (테라피)", "Show Me the Money 11"),
    ("잠비노", "Bingo (빙고) (Feat. 미노이, George)", "Show Me the Money 11"),
    ("잠비노", "Freestyle (프리스타일)", "Show Me the Money 11"),
    ("YUNHWAY", "100°C (Prod. 기리보이, YEOHO)", "Street Man Fighter Original Vol.3"),
    ("YUNHWAY", "Diamond (다이아몬드)", "Diamond"),
    ("Tablo", "Super Rare (슈퍼 레어) (Feat. Wonstein, pH-1)", "Epik High Is Here 下, Part 2"),
    ("Tablo", "Face ID (페이스 아이디) (Feat. 기리보이, Sik-K, JUSTHIS)", "Epik High Is Here 下, Part 2"),
    ("Primary", "BILLING (빌링)", "BILLING"),
    ("Primary", "Morning Glory (모닝 글로리)", ""),
    ("Gaeko", "Sturgis (스터gis)", "Sturgis"),
    ("Gaeko", "Gajah (가자)", "Gajah"),
    ("Simon Dominic", "Make Her Dance (메이크 허 댄스)", "Simon Dominic Part 3"),
    ("Simon Dominic", "GOTT (갓)", "GOTT"),
    ("Nafla", "understand (언더스탠드)", "understand"),
    ("Nafla", "C.R.E.A.M (크림)", "C.R.E.A.M"),
    ("Loopy", "ON THE Radar (온 더 레이더)", "ON THE Radar"),
    ("Loopy", "Portrait Mode (포트레이트 모드)", "[ Album ]"),
    ("Sokodomo", "IF I (이프 아이)", "Show Me the Money 8"),
    ("Sokodomo", "Merry Go Round (메리 고 라운드)", "Merry Go Round"),
    ("Mudd the student", "Sleepy Beauty (슬리피 뷰티)", ""),
    ("Mudd the student", "Open (오픈)", "Show Me the Money 8"),
    ("Lil Boi", "ONFleek (온플릭)", "Show Me the Money 9"),
    ("Lil Boi", "Empty Head (엠pty 헤드)", ""),
    ("Mino", "안녕", "To Infinity"),
    ("Mino", "겁 (Fear)", "Fear"),
    ("Bobby", "감동 (Secret)", "SECRET"),
    ("Bobby", "봄이 와 (Cherry Blossom)", "S.i.R"),
    ("Penomeco", "Shy (수줍)", "Shy"),
    ("Penomeco", "Lovers (러버스)", "Shy"),
    ("Lee Young Ji", "Yumeyo (유메요)", "16"),
    ("Lee Young Ji", "Not Sure (낫 슈어)", "16"),
    ("Koonta", "Ambition (앰비션)", "Show Me the Money 10"),
    ("Koonta", "Grandma (할머니)", "Show Me the Money 8"),
    ("Sik-K", "NEONBEAM (네온빔)", "FL1X"),
    ("Sik-K", "Donut 2 (도넛 2)", "FL1X"),
    ("Jvcki Wai", "Taxi Blurr (택시 블러)", "Taxi Blurr"),
    ("Jvcki Wai", "Neo Eve (네오 이브)", "Exposure"),
    ("D.Ark", "Genius (지니어스)", "Genius"),
    ("D.Ark", "Undercover (언더커버)", "Genius"),
    ("BewhY", "Day Day (데이 데이)", "The Movie Star"),
    ("BewhY", "Forever (포에버)", "The Movie Star"),
    ("YUMDDA", "Tic Toc (틱톡)", "I'm Good"),
    ("YUMDDA", "Shake (쉐이크)", "I'm Good"),
    ("Hash Swan", "Hash Brand 2 (해시 브랜드 2)", "Hash Brand 2"),
    ("Hash Swan", "Retro Love (레트로 러브)", ""),
    ("Wonstein", "10 Minutes (10분)", "Show Me the Money 10"),
    ("Wonstein", "Infrared (적외선)", "Show Me the Money 10"),
    ("Trade L", "Leave It (두고 가)", "Show Me the Money 10"),
    ("Trade L", "Blue Sky (블루 스카이)", "Show Me the Money 10"),
    ("Paul Blanco", "Summer (썸머)", "Summer"),
    ("Paul Blanco", "Rain (비)", "Summer"),
    ("Killagramz", "Good Morning (굿 모닝)", "Good Morning"),
    ("Killagramz", "Good Morning Remix (굿 모닝 리믹스)", "Good Morning"),
    ("Basick", "Nice Day (나이스 데이)", "Nice Day"),
    ("Basick", "Show Me The Money (쇼미)", "Nice Day"),
    ("Hanhae", "003", "003"),
    ("Hanhae", "001", "003"),
    ("B.I", "Waterfall (워터폴)", "Waterfall"),
    ("B.I", "Illa Illa (illa illa)", "Waterfall"),
    ("Khundi Panda", "Medicine (약)", "Medicine"),
    ("Khundi Panda", "Pick Up (픽업)", "Medicine"),
    ("Illinit", "Real Talk Live (리얼 토크)", ""),
    ("Illinit", "Ill Street Live 2 (일 스트릿)", ""),
    ("B-Free", "Best Seller (베스트 셀러)", "Best Seller"),
    ("B-Free", "Hot Summer (핫 썸머)", "Best Seller"),
    ("Vasco", "The Vasco (더 바스코)", "The Vasco"),
    ("G2", "G2 (지투)", "G2"),
    ("G2", "Business (비즈니스)", "Business"),
    ("Cheetah", "I'll Be Back (아일 비 백)", ""),
    ("Cheetah", "Keep It Movin (킵 잇 무빙)", ""),
    ("J'Kyun", "Fly Away (플라이 어웨이)", "Ready to Fly"),
    ("J'Kyun", "Ready to Fly (레디 투 플라이)", "Ready to Fly"),
    ("Outsider", "Vol.2-Maestro 4 (볼륨2 마에스트로 4)", "Vol.2-Maestro 4"),
    ("Outsider", "볼륨2 마에스트로 4", "Vol.2-Maestro 4"),
]

# ── 2023: McNasty · NOWITZKI · BEIGE · 82MAJOR ──
YEAR_POOLS[2023] = [
    ("Jay Park", "McNasty (맥내스티)", ""),
    ("Jay Park", "Candy (캔디)", ""),
    ("Beenzino", "Trippy (트리피)", "NOWITZKI"),
    ("Beenzino", "In Bed/막걸리", "NOWITZKI"),
    ("Don Malik", "MADE IN SEOUL (메이드 인 서울)", "MADE IN SEOUL"),
    ("Don Malik", "49", "49"),
    ("Lil Moshpit", "TO GO (투 고)", ""),
    ("Lil Moshpit", "Money Only Shows Hustle (머니 온리)", ""),
    ("PLT", "Summer (썸머)", "Summer"),
    ("PLT", "Way Back Home (웨이 백 홈)", "Way Back Home"),
    ("82MAJOR", "FIRST CLASS (퍼스트 클래스)", "ON"),
    ("82MAJOR", "Sure Thing (슈어 띵)", "ON"),
    ("Epik High", "Strawberry (스트로베리)", "Strawberry"),
    ("Epik High", "On My Way (온 마이 웨이)", "Strawberry"),
    ("Kid Milli", "BEIGE theme (베이지)", "BEIGE"),
    ("Kid Milli", "HONDA! (혼다)", "BEIGE"),
    ("Coogie", "Buck (벅)", "DIFF"),
    ("Coogie", "Just For Fun (저스트 포 펀)", "DIFF"),
    ("Leellamarz", "모른 척", "DAYDATE"),
    ("Leellamarz", "Money dance (머니 댄스)", "DAYDATE"),
    ("Zico", "SPOT! (스팟)", ""),
    ("Zico", "Earthquake (어스퀘이크)", ""),
    ("Crush", "Hmm-cheat (흠치트)", "wonderego"),
    ("Crush", "Click Like (클릭 라이크) (Prod. Crush)", "Street Woman Fighter 2 Original Vol.1"),
    ("Loco", "VOLVO (볼보)", ""),
    ("Loco", "INEEDYOURLOVE (아이 니드 유어 러브)", ""),
    ("Dean", "NO FUN (노 펀)", "howlin' 404"),
    ("Dean", "Die 4 You (다이 포 유)", ""),
    ("Heize", "Perhaps Happy Ending (아마도 해피 엔딩)", "Last Winter"),
    ("Heize", "From Autumn to Winter (가을에서 겨울로)", "Last Winter"),
    ("Zion.T", "UNLOVE (언러브)", "Zip"),
    ("Zion.T", "Happy Ending (해피 엔딩)", "Zip"),
    ("Bobby", "Drowning (드라우닝)", "S.i.R"),
    ("Bobby", "Cherry Blossom (체리 블로썸)", "S.i.R"),
    ("Mino", "Smoke (스모크)", "BODY"),
    ("Mino", "Aero (에어로)", "BODY"),
    ("Changmo", "VOOM (붐)", ""),
    ("Changmo", "FWB (에프더블유비)", ""),
    ("PH-1", "Rosario (로사리오)", "But For Now Leave Me Alone 2"),
    ("PH-1", "Final Bout (파이널 바우트)", "But For Now Leave Me Alone 2"),
    ("Gray", "Summer Surf (썸머 서프)", "Summer Surf"),
    ("Gray", "Adios (아디오스)", "00 XX"),
    ("Punchnello", "Motive (모티브)", ""),
    ("Punchnello", "Everyday (에브리데이)", "Everyday"),
    ("Colde", "Wave (웨이브)", ""),
    ("Colde", "Reno (리노)", ""),
    ("Giriboy", "Engineering (엔지니어링)", "Engineering"),
    ("Giriboy", "PlanetariuM (플래니테리움)", "Engineering"),
    ("Ash Island", "Floating (플로팅)", "ISLAND"),
    ("Ash Island", "ISLAND (아일랜드)", "ISLAND"),
    ("Dynamic Duo", "Grand Carnival (그랜드 카니발)", "Grand Carnival"),
    ("Dynamic Duo", "AEAO (애오)", "A DynamicAffair"),
    ("The Quiett", "King Is Back (킹 이즈 백)", "Luxury Flow"),
    ("The Quiett", "Mercedes (메르세데스)", "Luxury Flow"),
    ("Paloalto", "GONE (곤)", ""),
    ("Paloalto", "Mood Indigo (무드 인디고)", "Mood Indigo"),
    ("TOIL", "1989", "1989"),
    ("TOIL", "Money (머니)", "1989"),
    ("Swings", "Growing Pains 2 (그로잉 페인즈 2)", "Growing Pains 2"),
    ("Swings", "Brand New Day (브랜드 뉴 데이)", "Upgrade III"),
    ("Mirani", "Baby Steps (베이비 스텝스)", "Show Me the Money 10"),
    ("Mirani", "Pepsi (펩시)", ""),
    ("Woodie Gochild", "WaRRior (워리어)", "Show Me the Money 8"),
    ("Woodie Gochild", "Mud (머드)", "Show Me the Money 10"),
    ("Owen Ovadoz", "Diana (디ana)", "Show Me the Money 10"),
    ("Owen Ovadoz", "Freeze (프리즈)", "119"),
    ("Blase", "ONOFF (온오프)", "Show Me the Money 10"),
    ("Blase", "Blue (블루)", ""),
    ("Sokodomo", "Winner (위너)", "Show Me the Money 10"),
    ("Sokodomo", "SIGNATURE (시그니처)", "Show Me the Money 10"),
    ("Lil Boi", "Wave (웨이브)", "Show Me the Money 10"),
    ("Lil Boi", "Good Day (굿 데이)", "Show Me the Money 10"),
    ("BE'O", "Momentum (모멘텀)", "Show Me the Money 10"),
    ("BE'O", "Healing (힐링)", "Show Me the Money 10"),
    ("Lee Young Ji", "O.K? (오케이)", "O.K?"),
    ("Lee Young Ji", "Untouchable (언터처블)", "Untouchable"),
    ("Jessi", "Gum (검)", "Gum"),
    ("Jessi", "Who Dat B (후댓비)", "Who Dat B"),
    ("Sik-K", "FL1X (플릭스)", "FL1X"),
    ("Sik-K", "WATER (워터)", "FL1X"),
    ("Tablo", "Hood (후드)", "Drill Presents: Tablo x Fantasy"),
    ("Tablo", "Fantasy (판타지)", "Drill Presents: Tablo x Fantasy"),
    ("Primary", "2 (투)", "2"),
    ("Primary", "BILLING (빌링)", "BILLING"),
    ("Nafla", "Swervin (스wervin)", "C.R.E.A.M"),
    ("Nafla", "MVP (엠브이피)", "[ Album ]"),
    ("Loopy", "Save (세이브)", "[ Album ]"),
    ("Loopy", "CROWN (크라운)", "SEOUL pt.A"),
    ("YUMDDA", "I'm Good (아임 굿)", "I'm Good"),
    ("YUMDDA", "Tic Toc (틱톡)", "I'm Good"),
    ("Hash Swan", "Hash Brand 2 (해시 브랜드 2)", "Hash Brand 2"),
    ("Hash Swan", "Retro Love (레트로 러브)", ""),
    ("Jvcki Wai", "Doughnet (도우넷)", "Exposure"),
    ("Jvcki Wai", "Neo Eve (네오 이브)", "Exposure"),
    ("Mudd the student", "Nectar (넥타)", "Show Me the Money 10"),
    ("Mudd the student", "Sleepy Beauty (슬리피 뷰티)", ""),
    ("BewhY", "Movie Star (무비 스타)", "The Movie Star"),
    ("BewhY", "Forever (포에버)", "The Fiery"),
    ("Penomeco", "Famous (페이머스)", ""),
    ("Penomeco", "OFM (오에프엠)", ""),
    ("Simon Dominic", "NO OPEN FLAME (노 오픈 플레임)", "NO OPEN FLAME"),
    ("Simon Dominic", "DAx4 (다포)", "DAx4"),
    ("Gaeko", "Geon Gangs (건강)", "Geon Gangs"),
    ("Gaeko", "West Coast (웨스트 코스트)", "Redingray"),
    ("Deepflow", "Come Back Home (컴백홈)", "Flow the Life 3"),
    ("Deepflow", "Flow the Life 3 (플로우 더 라이프 3)", "Flow the Life 3"),
    ("Huckleberry P", "Mantra 3 (만트라 3)", "Mantra 3"),
    ("Huckleberry P", "Woofer (우퍼)", "Mantra 3"),
    ("D.Ark", "Genius (지니어스)", "Genius"),
    ("D.Ark", "Undercover (언더커버)", "Genius"),
    ("Koonta", "Unbreakable (언브레이커블)", "Show Me the Money 8"),
    ("Koonta", "KOONTA (쿤타)", "Show Me the Money 10"),
    ("Kid Ash", "Orca (오르카)", "Orca-Tape"),
    ("Kid Ash", "Orca-Tape (오르카 테이프)", "Orca-Tape"),
    ("C Jamm", "Monster (몬스터)", ""),
    ("C Jamm", "Olltii (올티)", "Show Me the Money 777"),
    ("Olltii", "Creative Control (크리에이티브)", "Creative Control"),
    ("Olltii", "Creative Control 2 (크리에이티브 2)", "Creative Control"),
    ("Flowsik", "We On (위 온)", "Show Me the Money 777"),
    ("Flowsik", "Think (씽크)", "Show Me the Money 777"),
    ("Reddy", "Think (씽크)", "Show Me the Money 777"),
    ("Reddy", "We On (위 온)", "Show Me the Money 777"),
    ("KittiB", "Nobody Knows (노바디 노즈)", "Show Me the Money 777"),
    ("KittiB", "Nobody Knows 2 (노바디 노즈 2)", "Show Me the Money 777"),
    ("NO:EL", "Rain Drop 2 (레인 드롭 2)", "Rain Drop 2"),
    ("NO:EL", "Blue (블루)", "Blue"),
    ("Blued", "Blue (블루)", "Blue"),
    ("Blued", "Rain Drop (레인 드롭)", "Rain Drop"),
    ("E-Sens", "이상형", "The Anecdote"),
    ("E-Sens", "The Anecdote (더 애너닷)", "The Anecdote"),
    ("San E", "Story of Someone I Know (아는 사람 이야기)", "Ready for Showtime"),
    ("San E", "Ready for Showtime (레디 포 쇼타임)", "Ready for Showtime"),
    ("Vasco", "The Vasco (더 바스코)", "The Vasco"),
    ("Vasco", "더 바스코", "The Vasco"),
    ("Outsider", "Vol.2-Maestro 3 (볼륨2 마에스트로 3)", "Vol.2-Maestro 3"),
    ("Outsider", "볼륨2 마에스트로 3", "Vol.2-Maestro 3"),
    ("MC Meta", "On My Own (온 마이 온)", "The Blue Printz"),
    ("MC Meta", "The Blue Printz (더 블루 프린츠)", "The Blue Printz"),
    ("Rhymer", "Brand New Day (브랜드 뉴 데이)", "Rhymer Trax Vol.1"),
    ("Rhymer", "Rhymer Trax Vol.1 (라이머 트랙스)", "Rhymer Trax Vol.1"),
    ("Double K", "Fly High (플라이 하이)", "Fly High"),
    ("Double K", "Fly High 2 (플라이 하이 2)", "Fly High"),
    ("Pe2ny", "Pe2ny Maker (피투니 메이커)", "Pe2ny Maker"),
    ("Pe2ny", "Pe2ny Maker 2 (피투니 메이커 2)", "Pe2ny Maker"),
    ("TBNY", "Million (밀리언)", "Million"),
    ("TBNY", "Million 2 (밀리언 2)", "Million"),
    ("Stuck B", "Stuck B (스턱 비)", "Stuck B"),
    ("Stuck B", "Stuck B 2 (스턱 비 2)", "Stuck B"),
    ("Crown J", "My Friend (마이 프렌드)", "My Friend"),
    ("Crown J", "My Friend 2 (마이 프렌드 2)", "My Friend"),
    ("L.E.O.", "Show Must Go On (쇼 머스트 고 온)", "Show Must Go On"),
    ("L.E.O.", "Show Must Go On 2 (쇼 머스트 고 온 2)", "Show Must Go On"),
    ("Mad Clown", "Loving U (러빙 유)", "Heoteoge Sarang"),
    ("Mad Clown", "Heoteoge Sarang (허터거 사랑)", "Heoteoge Sarang"),
    ("Tiger JK", "Payback (페이백)", "Feel gHood Muzik : The 8th Wonderland"),
    ("Tiger JK", "Feel gHood Muzik (필 굿 뮤직)", "Feel gHood Muzik : The 8th Wonderland"),
    ("Leessang", "The Rain (더 레인)", "Unplugged on the Sofa"),
    ("Leessang", "Unplugged on the Sofa (언플러그드)", "Unplugged on the Sofa"),
    ("Phantom", "Bubble Love (버블 러브)", "Phantom City"),
    ("Phantom", "Phantom City (팬텀 시티)", "Phantom City"),
    ("MellowD", "On My Way (온 마이 웨이)", "On My Way"),
    ("MellowD", "On My Way 2 (온 마이 웨이 2)", "On My Way"),
    ("Verbal Jint", "Mainstream (메인스트림)", "Mainstream"),
    ("Verbal Jint", "Mainstream 2 (메인스트림 2)", "Mainstream"),
    ("Geeks", "Officially Missing You (오피셜리 미싱 유)", "Officially Missing You"),
    ("Geeks", "Officially Missing You 2 (오피셜리 미싱 유 2)", "Officially Missing You"),
    ("Bumkey", "Single Life (싱글 라이프)", "Single Life"),
    ("Bumkey", "Single Life 2 (싱글 라이프 2)", "Single Life"),
    ("Junggigo", "Rookie (루키)", "Rookie"),
    ("Junggigo", "Rookie 2 (루키 2)", "Rookie"),
    ("Don Mills", "Don Mills Is Angry 3 (돈밀스는 화났다 3)", "Don Mills Is Angry 3"),
    ("Don Mills", "Don Mills Is Angry 3 Pt.2 (돈밀스는 화났다 3 Pt.2)", "Don Mills Is Angry 3"),
    ("Myun Do One", "Bulldozer (불도저)", "Myun Do One Is Back"),
    ("Myun Do One", "Myun Do One Is Back (면도원 이즈 백)", "Myun Do One Is Back"),
    ("Illinit", "Ill Street (일 스트릿)", "Illmatic"),
    ("Illinit", "Illmatic (일매틱)", "Illmatic"),
    ("Sean2Slow", "Slow Jam (슬로우 잼)", "Slow Jam"),
    ("Sean2Slow", "Slow Jam 2 (슬로우 잼 2)", "Slow Jam"),
    ("JJK", "Go Back (고 백)", "Go-Back"),
    ("JJK", "Go-Back (고백)", "Go-Back"),
    ("Baechigi", "Shark's Tale (샤크스 테일)", "Shark's Tale"),
    ("Baechigi", "Shark's Tale 2 (샤크스 테일 2)", "Shark's Tale"),
    ("Dok2", "Dok2ocracy (독2ocracy)", "Dok2ocracy"),
    ("Dok2", "Thug Life Part 2 (Thug Life Part 2)", "Thug Life Part 2"),
    ("GroovyRoom", "Brought the Heat Back (더운데)", "Brought the Heat Back"),
    ("GroovyRoom", "Wavy (웨이비)", "Brought the Heat Back"),
    ("Kid Milli", "BORA (보라)", "BEIGE"),
    ("Kid Milli", "Simple Poem (심플 포엠)", "BEIGE"),
    ("Leellamarz", "Can't stop (캔트 스톱)", "DAYDATE"),
    ("Leellamarz", "Russian Roulette (러시안 룰렛)", "Life is Once"),
    ("Crush", "EZPZ (이지피지)", "wonderego"),
    ("Crush", "Ego (에고)", "wonderego"),
    ("Loco", "Pick Pick (픽 픽)", "WEAK"),
    ("Loco", "BROKEN IPHONE (브로큰 아이폰)", "WEAK"),
    ("Beenzino", "Travel Again (트래블 어게인)", "NOWITZKI"),
    ("Beenzino", "990", "NOWITZKI"),
    ("Jessi", "Cold Blooded (냉혈한)", "Cold Blooded"),
    ("Jessi", "What Type of X (어떤X)", "Cold Blooded"),
    ("Sik-K", "NEONBEAM (네온빔)", "FL1X"),
    ("Sik-K", "LOVEADICT (러브어딕트)", "FL1X"),
    ("Zion.T", "NOT FOR SALE (낫 포 세일)", "Zip"),
    ("Zion.T", "Whale (고래)", "Zip"),
    ("Paloalto", "Valentina (발렌티나)", ""),
    ("Paloalto", "Top Primary (탑 프라이머리)", ""),
    ("TOIL", "Rollin (롤린)", "1989"),
    ("TOIL", "Switch (스위치)", "1989"),
    ("Mirani", "Villain (빌런)", "Show Me the Money 10"),
    ("Mirani", "Ticket (티켓)", "Ticket"),
    ("Woodie Gochild", "GOchild (고차일드)", "#GOchild"),
    ("Woodie Gochild", "Dirtbag (더트백)", "#GOchild"),
    ("Owen Ovadoz", "119", "119"),
    ("Owen Ovadoz", "Freestyle (프리스타일)", "Show Me the Money 10"),
    ("Blase", "Passionfruit (패션후르츠)", ""),
    ("Blase", "Love Me (러브 미)", "Passionfruit"),
    ("Sokodomo", "IF I (이프 아이)", "Show Me the Money 8"),
    ("Sokodomo", "Merry Go Round (메리 고 라운드)", "Merry Go Round"),
    ("BE'O", "Countdown (카운트다운)", "Show Me the Money 10"),
    ("BE'O", "Luxury (럭셔리)", "Show Me the Money 10"),
    ("Lee Young Ji", "Witch (위치)", "Witch"),
    ("Lee Young Ji", "Yumeyo (유메요)", "16"),
    ("Tablo", "Champagne (샴페인)", "Epik High Is Here 下, Part 2"),
    ("Tablo", "Stop the Rain (스톱 더 레인)", ""),
    ("Primary", "Morning Glory (모닝 글로리)", ""),
    ("Primary", "BILLING (빌링)", "BILLING"),
    ("Nafla", "Natural Born Killers (내추럴 본 킬러스)", "Natural Born Killers"),
    ("Nafla", "What (왓)", "Natural Born Killers"),
    ("Loopy", "King Loopy (킹 루피)", "King Loopy"),
    ("Loopy", "DOPE (도pe)", "SEOUL pt.A"),
    ("YUMDDA", "Shake (쉐이크)", "I'm Good"),
    ("YUMDDA", "I'm Good (아임 굿)", "I'm Good"),
    ("Hash Swan", "Hash Brand (해시 브랜드)", "Hash Brand"),
    ("Hash Swan", "Hash Brand 2 (해시 브랜드 2)", "Hash Brand 2"),
    ("Mudd the student", "Open (오픈)", "Show Me the Money 8"),
    ("Mudd the student", "Nectar (넥타)", "Show Me the Money 10"),
    ("BewhY", "Day Day (데이 데이)", "The Movie Star"),
    ("BewhY", "Cult of Curiosity (컬트 오브 큐리오시티)", "Cult of Curiosity"),
    ("Penomeco", "Shy (수줍)", "Shy"),
    ("Penomeco", "Lovers (러버스)", "Shy"),
    ("Simon Dominic", "Make Her Dance (메이크 허 댄스)", "Simon Dominic Part 3"),
    ("Simon Dominic", "ART OF PARTYING (아트 오브 파티잉)", "NO OPEN FLAME"),
    ("Gaeko", "Gajah (가자)", "Gajah"),
    ("Gaeko", "Sturgis (스터gis)", "Sturgis"),
    ("Deepflow", "Flow the Life 3 (플로우 더 라이프 3)", "Flow the Life 3"),
    ("Deepflow", "Come Back Home (컴백홈)", "Flow the Life 3"),
    ("Huckleberry P", "Woofer (우퍼)", "Mantra 3"),
    ("Huckleberry P", "Mantra 3 (만트라 3)", "Mantra 3"),
    ("D.Ark", "Genius (지니어스)", "Genius"),
    ("D.Ark", "Undercover (언더커버)", "Genius"),
    ("Swings", "Per se (퍼 세)", "Per se"),
    ("Swings", "Remedy (레medy)", "Remedy"),
    ("Lil Boi", "Empty Head (엠pty 헤드)", ""),
    ("Lil Boi", "ONFleek (온플릭)", "Show Me the Money 9"),
    ("Mino", "Trigger (트리거)", "XX"),
    ("Mino", "Fiancé (피앙세)", "XX"),
    ("Zion.T", "Snooze (스누즈)", "Zion.T Special: OO"),
    ("Zion.T", "Yanghwa Bridge (양화대교)", "Zion.T Special: OO"),
    ("Dean", "NASA (나사)", "3:33"),
    ("Dean", "Ctrl (컨트롤)", "3:33"),
    ("Heize", "비도 오고 그래서", "///"),
    ("Heize", "Jenga (젠가)", "Jenga"),
    ("Crush", "None (넌)", "From Midnight To Sunrise"),
    ("Crush", "Yes or No (예스 오어 노)", ""),
    ("Loco", "Some (썸)", "Hero"),
    ("Loco", "Hero (히어로)", "Hero"),
    ("Gray", "Tik Tak Tok (틱택톡)", ""),
    ("Gray", "Real Love (리얼 러브)", "Remedy"),
    ("Punchnello", "Cool (쿨)", "Cool"),
    ("Punchnello", "before you (비포 유)", ""),
    ("Colde", "In Your Eyes (인 유어 아이즈)", "In Your Eyes"),
    ("Colde", "Your Dog Loves You (유어 독 러브즈 유)", "Your Dog Loves You"),
    ("Kid Milli", "Jab (잽)", "+"),
    ("Kid Milli", "Bet (벳)", "++"),
    ("Leellamarz", "Two Pills (투 필스)", "STILL YOUNG BOY L"),
    ("Leellamarz", "Japan (재팬)", "STILL YOUNG BOY L"),
    ("The Quiett", "LF Intro (엘에프 인트로)", "Luxury Flow"),
    ("The Quiett", "Look Inside (룩 인사이드)", "Luxury Flow"),
    ("Bobby", "Sae (새)", "Sir.Robert"),
    ("Bobby", "Moon (문)", "Sir.Robert"),
    ("Epik High", "Born Hater (본 헤이터)", "Shoebox"),
    ("Epik High", "헤픈 엔딩", "Shoebox"),
    ("Giriboy", "Mechanical Album (메카니컬 앨범)", "Mechanical Album"),
    ("Giriboy", "Different (디퍼런트)", "Different"),
    ("Ash Island", "Malibu (말리부)", "Ash Island"),
    ("Ash Island", "Howling (하울링)", "Ash Island"),
    ("Mirani", "Drama (드라마)", "Drama"),
    ("Mirani", "Bayer Dynamic (바이어 다이나믹)", "Ticket"),
    ("Woodie Gochild", "Mood Swings (무드 스윙스)", "#GOchild"),
    ("Woodie Gochild", "Channel Surfing (채널 서핑)", "#GOchild"),
    ("Owen Ovadoz", "Drama (드라마)", "Drama"),
    ("Owen Ovadoz", "Diamond (다이아몬드)", "119"),
    ("Blase", "KKUCKDARI (꾹다리)", "SELF MADE"),
    ("Blase", "BREAKERS (브레이커스)", "SELF MADE"),
    ("PH-1", "PARTY PPL (파티 피플)", "WHAT HAVE WE DONE"),
    ("PH-1", "FLAT COKE (플랫 코크)", ""),
    ("Coogie", "Spaceship (스페이스십)", "UPSET"),
    ("Coogie", "Two Pills (투 필스)", "UPSET"),
    ("Lil Moshpit", "PUBLIC ENEMY (퍼블릭 에너미)", "K-FLIP+"),
    ("Lil Moshpit", "NEW ANTHEM (뉴 앤섬)", "K-FLIP+"),
    ("Don Malik", "THURSDAYCLUB MIXTAPE (써스데이클럽)", "THURSDAYCLUB MIXTAPE"),
    ("82MAJOR", "뭘 봐 (TAKEOVER)", "X-82"),
    ("Jay Park", "Stand Out (스탠드 아웃)", ""),
    ("Zico", "Shut Up (셧 업)", "UPSET"),
    ("Crush", "Fallin' (폴린)", "From Midnight To Sunrise"),
    ("Heize", "Love Virus (러브 바이러스)", "LOVE VIRUS Pt.1"),
    ("Leellamarz", "Hell yea (헬 예)", "L&B"),
    ("The Quiett", "Crystal Crates (크리스탈 크레이츠)", "Luxury Flow"),
    ("Paloalto", "Issues (이슈즈)", "BUT FOR NOW LEAVE ME ALONE"),
    ("TOIL", "염염상망", ""),
    ("Swings", "Upgrade III (업그레이드 3)", "Upgrade III"),
    ("Hash Swan", "Hash Brand (해시 브랜드)", "Hash Brand"),
    ("Jvcki Wai", "Taxi Blurr (택시 블러)", "Taxi Blurr"),
    ("Penomeco", "COCO BOTTLE (코코 보틀)", ""),
    ("Simon Dominic", "Simon Dominic Part 3 (사이먼 도미닉 파트 3)", "Simon Dominic Part 3"),
    ("Gaeko", "Geon Gangs (건강)", "Geon Gangs"),
    ("Deepflow", "Flow the Life 3 (플로우 더 라이프 3)", "Flow the Life 3"),
    ("BewhY", "Cult of Curiosity (컬트 오브 큐리오시티)", "Cult of Curiosity"),
    ("Koonta", "KOONTA (쿤타)", "Show Me the Money 10"),
    ("NSW yoon", "Therapy + 으리으리 (Feat. 호미들)", "Show Me the Money 11"),
    ("노윤하", "Flick (플릭) (Feat. BE'O, HAON)", "Show Me the Money 11"),
    ("잠bi노", "Bingo (빙고) (Feat. 미노이, George)", "Show Me the Money 11"),
    ("QM", "Come To My Stu (Feat. 릴러말즈)", "Show Me the Money 11"),
    ("Don Malik", "눈 (EYE) (Feat. BIG Naughty, JUSTHIS)", "Show Me the Money 11"),
    ("허성현", "미운오리새끼 (Prod. R.Tee)", "Show Me the Money 11"),
    ("Kan", "나침반 (Feat. UNEDUCATED KID, Superbee)", "Show Me the Money 11"),
    ("이영지", "낫 쏘리 (Feat. pH-1)", "Show Me the Money 11"),
    ("Beenzino", "In Bed/막걸리", "NOWITZKI"),
    ("Don Malik", "MADE IN SEOUL (메이드 인 서울)", "MADE IN SEOUL"),
    ("Lil Moshpit", "TO GO (투 고)", ""),
    ("82MAJOR", "Sure Thing (슈어 띵)", "ON"),
    ("Qwala", "델러가 (Feat. MELOH & Posadic)", "yorter"),
    ("Changmo", "ZOOM (줌)", ""),
    ("Sokodomo", "SIGNATURE (시그니처)", "Show Me the Money 10"),
]

from pools_2024_2025 import POOL_2024, POOL_2025

YEAR_POOLS[2024] = POOL_2024
YEAR_POOLS[2025] = POOL_2025


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


def load_prior_used() -> set[str]:
    used: set[str] = set()
    for year in range(2010, 2022):
        path = os.path.join(HERE, f"y{year}.py")
        if not os.path.isfile(path):
            continue
        spec = importlib.util.spec_from_file_location(f"y{year}", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for a, t, _ in mod.TRACKS:
            used.add(norm_key(a, t))
    return used


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


def pick_year(
    year: int, pool: list[tuple[str, str, str]], used: set[str], exclude: set[str]
) -> list[tuple[str, str, str]]:
    picked: list[tuple[str, str, str]] = []
    artist_count: dict[str, int] = {}
    keys: set[str] = set()

    def can(a: str, t: str) -> bool:
        k = norm_key(a, t)
        return (
            k not in used
            and k not in exclude
            and k not in keys
            and artist_count.get(a, 0) < MAX_PER
        )

    def add(a: str, t: str, al: str) -> None:
        k = norm_key(a, t)
        picked.append((a, t, al))
        keys.add(k)
        used.add(k)
        artist_count[a] = artist_count.get(a, 0) + 1

    seen_pool: set[str] = set()
    for a, t, al in pool:
        k = norm_key(a, t)
        if k in seen_pool:
            continue
        seen_pool.add(k)
        if len(picked) >= TARGET:
            break
        if can(a, t):
            add(a, t, al)

    while len(picked) < TARGET:
        hangul = sum(1 for _, t, _ in picked if has_hangul(t))
        need_h = hangul < MIN_HANGUL
        progress = False
        for a, t, al in pool:
            if len(picked) >= TARGET:
                break
            if need_h and not has_hangul(t):
                continue
            if can(a, t):
                add(a, t, al)
                progress = True
        if not progress:
            for a, t, al in pool:
                if len(picked) >= TARGET:
                    break
                if can(a, t):
                    add(a, t, al)
                    progress = True
                    break
        if not progress:
            break
    return picked


def write_module(year: int, tracks: list[tuple[str, str, str]]) -> None:
    lines = ["TRACKS = ["]
    for a, t, al in tracks:
        lines.append(f"    ({a!r}, {t!r}, {al!r}),")
    lines.append("]")
    lines.append("")
    path = os.path.join(HERE, f"y{year}.py")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))


def validate_all(catalog: dict[int, list], exclude: set[str]) -> list[str]:
    used: set[str] = set()
    errs: list[str] = []
    for year in sorted(catalog):
        tracks = catalog[year]
        if len(tracks) != TARGET:
            errs.append(f"{year}: count {len(tracks)}")
        ac: dict[str, int] = {}
        hangul = 0
        for a, t, al in tracks:
            k = norm_key(a, t)
            if k in used:
                errs.append(f"{year}: cross dup {a} - {t}")
            if k in exclude:
                errs.append(f"{year}: global {a} - {t}")
            used.add(k)
            ac[a] = ac.get(a, 0) + 1
            if has_hangul(t):
                hangul += 1
        for a, c in ac.items():
            if c > MAX_PER:
                errs.append(f"{year}: {a} has {c}")
        if len(ac) < MIN_ARTISTS:
            errs.append(f"{year}: {len(ac)} artists")
        if hangul < MIN_HANGUL:
            errs.append(f"{year}: hangul {hangul}/100")
        else:
            print(f"OK {year}: {len(ac)} artists, hangul {hangul}/100")
    return errs


def main() -> None:
    exclude = load_global_exclude()
    used = load_prior_used()
    catalog: dict[int, list[tuple[str, str, str]]] = {}
    for year in (2022, 2023, 2024, 2025):
        pool = YEAR_POOLS.get(year, [])
        catalog[year] = pick_year(year, pool, used, exclude)
    errs = validate_all(catalog, exclude)
    if errs:
        print("\n".join(errs), file=sys.stderr)
        sys.exit(1)
    for year, tracks in catalog.items():
        write_module(year, tracks)
    print("Wrote y2022.py - y2025.py")


if __name__ == "__main__":
    main()
