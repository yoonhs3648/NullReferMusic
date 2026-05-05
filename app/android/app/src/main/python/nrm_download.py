"""Chaquopy에서 실행: yt-dlp + 4-profile 순차 retry로 403 우회.

403 회피 핵심 원칙
──────────────────
YouTube는 아래 4가지를 동시에 검증한다.
  1) User-Agent
  2) X-YouTube-Client-Name / Version  (UA와 반드시 일치)
  3) context.client.clientName        (body 내부도 동일해야 함)
  4) 쿠키 (VISITOR_INFO1_LIVE, YSC, SAPISID 등)

⇒ 한 profile 내에서 UA / client 헤더 / extractor_args 가 모두 일치해야 한다.
⇒ profile별로 완전한 세트를 구성하고 순서대로 시도한다.

유지보수 안내
─────────────
yt-dlp 버전은 android/app/build.gradle 의
  chaquopy { pip { install "yt-dlp==X.Y.Z" } }
에서만 변경한다. YouTube 패치가 나오면 그 한 줄만 최신으로 올린다.
"""
from __future__ import annotations

import os

# ── User-Agent 상수 ───────────────────────────────────────────────────────────
_UA_ANDROID_YT = (
    "com.google.android.youtube/19.29.37 "
    "(Linux; U; Android 14; SM-S908E Build/UP1A.231005.007) gzip"
)
_UA_IOS_YT = (
    "com.google.ios.youtube/19.29.1 "
    "(iPhone16,2; U; CPU iOS 17_5 like Mac OS X)"
)
_UA_TV_EMBEDDED = (
    "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) "
    "AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1"
)
_UA_CHROME_DESKTOP = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# ── Retry profile 목록 ────────────────────────────────────────────────────────
# UA / client 헤더 / extractor_args 를 반드시 같은 profile 내에서 일치시킨다.
# YouTube는 이들이 섞이면(일명 "위장 실패") 403 또는 재생불가를 반환한다.
_RETRY_PROFILES: list[dict] = [
    # ─ Profile 1: Android client (성공률 가장 높음) ────────────────────────────
    {
        "name": "android_primary",
        "http_headers": {
            "User-Agent": _UA_ANDROID_YT,
            "Referer": "https://www.youtube.com/",
            "Origin": "https://www.youtube.com",
            "X-YouTube-Client-Name": "3",
            "X-YouTube-Client-Version": "19.29.37",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
        },
        "extractor_args": {
            "youtube": {
                "player_client": ["android"],
                "player_skip": ["configs"],
            }
        },
    },
    # ─ Profile 2: Android (configs 포함, skip 없음) ────────────────────────────
    {
        "name": "android_no_skip",
        "http_headers": {
            "User-Agent": _UA_ANDROID_YT,
            "Referer": "https://www.youtube.com/",
            "Origin": "https://www.youtube.com",
            "X-YouTube-Client-Name": "3",
            "X-YouTube-Client-Version": "19.29.37",
        },
        "extractor_args": {
            "youtube": {
                "player_client": ["android"],
            }
        },
    },
    # ─ Profile 3: iOS client ──────────────────────────────────────────────────
    {
        "name": "ios_primary",
        "http_headers": {
            "User-Agent": _UA_IOS_YT,
            "Referer": "https://www.youtube.com/",
            "Origin": "https://www.youtube.com",
            "X-YouTube-Client-Name": "5",
            "X-YouTube-Client-Version": "19.29.1",
        },
        "extractor_args": {
            "youtube": {
                "player_client": ["ios"],
                "player_skip": ["configs"],
            }
        },
    },
    # ─ Profile 4: TV Embedded (우회 가능성 높음, 인증 덜 엄격) ────────────────
    {
        "name": "tv_embedded",
        "http_headers": {
            "User-Agent": _UA_TV_EMBEDDED,
            "Referer": "https://www.youtube.com/",
            "Origin": "https://www.youtube.com",
        },
        "extractor_args": {
            "youtube": {
                "player_client": ["tv_embedded"],
                "player_skip": ["configs"],
            }
        },
    },
]


def _is_retryable(error_msg: str) -> bool:
    """재시도 가능한 오류인지 판별합니다."""
    msg = error_msg.lower()
    return any(
        kw in msg
        for kw in (
            "403",
            "http error 403",
            "sign in",
            "bot",
            "rate",
            "unavailable",
            "private",
            "video unavailable",
        )
    )


def _build_opts(
    out_dir: str,
    ffmpeg_dir: str,
    no_playlist: bool,
    cookies_path: str,
    profile: dict,
) -> dict:
    """단일 profile 기반 YoutubeDL 옵션을 생성합니다."""
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "ffmpeg_location": ffmpeg_dir,
        "outtmpl": os.path.join(out_dir, "nrm_%(id)s.%(ext)s"),
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "0",
            }
        ],
        "http_headers": profile["http_headers"],
        "extractor_args": profile["extractor_args"],
    }
    if no_playlist:
        opts["noplaylist"] = True
    if cookies_path and os.path.isfile(cookies_path):
        opts["cookiefile"] = cookies_path
    return opts


def download(
    url: str,
    out_dir: str,
    ffmpeg_dir: str,
    no_playlist: bool,
    cookies_path: str = "",
    user_agent: str = "",
) -> str:
    """유튜브 URL을 MP3로 다운로드하고 저장 경로를 반환합니다.

    4개 profile을 순차 시도하며, 각각 UA / client 헤더 / extractor_args 가
    완전히 일치하는 세트로 구성되어 있습니다.

    Args:
        url:          다운로드할 YouTube URL
        out_dir:      결과 MP3를 저장할 디렉터리
        ffmpeg_dir:   ffmpeg 바이너리 디렉터리
        no_playlist:  단일 영상만 받을지 여부
        cookies_path: Netscape 형식 쿠키 파일 경로 (비어 있으면 쿠키 없이 시도)
        user_agent:   현재 미사용 (profile UA를 우선함)
    """
    os.makedirs(out_dir, exist_ok=True)
    from yt_dlp import YoutubeDL  # noqa: PLC0415

    last_error: Exception | None = None

    for idx, profile in enumerate(_RETRY_PROFILES):
        profile_name = profile["name"]
        # 이전 시도로 생성된 중간 파일 정리
        _cleanup_partial(out_dir)

        try:
            opts = _build_opts(out_dir, ffmpeg_dir, no_playlist, cookies_path, profile)
            with YoutubeDL(opts) as ydl:
                ydl.download([url])

            mp3_path = _find_latest_mp3(out_dir)
            return mp3_path

        except Exception as exc:  # noqa: BLE001
            last_error = exc
            err_str = str(exc)
            print(
                f"[nrm_download] profile={profile_name} attempt={idx + 1} "
                f"error={err_str[:200]}"
            )
            if idx < len(_RETRY_PROFILES) - 1 and _is_retryable(err_str):
                print(f"[nrm_download] retrying with next profile...")
                continue
            # 재시도 불가한 오류(영상 비공개, 삭제 등)면 즉시 raise
            raise

    raise last_error or RuntimeError("모든 profile 시도 실패")


def _cleanup_partial(out_dir: str) -> None:
    """이전 시도에서 생성된 nrm_* 파일을 삭제합니다."""
    try:
        for f in os.listdir(out_dir):
            if f.startswith("nrm_"):
                try:
                    os.remove(os.path.join(out_dir, f))
                except OSError:
                    pass
    except OSError:
        pass


def _find_latest_mp3(out_dir: str) -> str:
    """출력 디렉터리에서 가장 최근에 생성된 MP3 파일 경로를 반환합니다."""
    mp3s = [
        f
        for f in os.listdir(out_dir)
        if f.lower().endswith(".mp3") and f.startswith("nrm_")
    ]
    if not mp3s:
        mp3s = [f for f in os.listdir(out_dir) if f.lower().endswith(".mp3")]
    if not mp3s:
        raise RuntimeError("MP3 파일이 생성되지 않았습니다.")
    mp3s.sort(
        key=lambda f: os.path.getmtime(os.path.join(out_dir, f)), reverse=True
    )
    return os.path.join(out_dir, mp3s[0])
