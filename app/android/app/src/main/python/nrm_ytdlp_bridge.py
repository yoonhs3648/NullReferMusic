import json
import os
import time

import yt_dlp


def _nrm_log(tag, message):
    """Chaquopy → Download/NullReferenceMusic/logs/nrm-debug.log"""
    try:
        from java import jclass

        jclass("com.nullrefer.music.ondevice.NrmFileLogger").log(str(tag), str(message))
    except Exception:
        pass


_CLIENT_PROFILES = [
    ["android", "web"],
    ["ios", "web"],
    ["tv_embedded", "web"],
    ["mweb"],
    ["web"],
    ["android"],
]

_PROFILE_CACHE_NAME = "nrm-ytdlp-profile-cache.json"


def _extractor_args(player_clients):
    return {"youtube": {"player_client": player_clients}}


def _ffmpeg_dir(ffmpeg_location):
    """yt-dlp는 ffmpeg가 들어 있는 디렉터리 경로를 받는다."""
    bin_path = _resolve_ffmpeg_bin(ffmpeg_location)
    if not bin_path:
        return ""
    parent = os.path.dirname(bin_path)
    return parent if parent else ""


def _common_opts(cookie_file, ffmpeg_location=""):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "retries": 2,
        "socket_timeout": 20,
        "extractor_retries": 2,
    }
    if cookie_file and os.path.exists(cookie_file):
        opts["cookiefile"] = cookie_file
    loc_dir = _ffmpeg_dir(ffmpeg_location)
    if loc_dir:
        opts["ffmpeg_location"] = loc_dir
    return opts


def _profile_cache_path(out_dir):
    parent = os.path.dirname(os.path.abspath(out_dir or "."))
    return os.path.join(parent, _PROFILE_CACHE_NAME)


def _load_profile_cache(out_dir):
    path = _profile_cache_path(out_dir)
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        clients = data.get("clients")
        if isinstance(clients, list) and clients:
            return [str(c) for c in clients]
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        pass
    return None


def _save_profile_cache(out_dir, clients, use_cookies, kind):
    path = _profile_cache_path(out_dir)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "clients": clients,
                    "useCookies": bool(use_cookies),
                    "kind": kind,
                },
                f,
            )
    except OSError:
        pass


def _ordered_client_profiles(out_dir):
    cached = _load_profile_cache(out_dir)
    profiles = [list(p) for p in _CLIENT_PROFILES]
    if cached:
        for i, profile in enumerate(profiles):
            if profile == cached:
                profiles.insert(0, profiles.pop(i))
                break
    return profiles


def _cookie_attempts(cookie_file):
    attempts = []
    if cookie_file and os.path.exists(cookie_file):
        attempts.append(cookie_file)
    attempts.append("")
    return attempts


def _is_format_availability_error(exc):
    msg = str(exc).lower()
    return (
        "format is not available" in msg
        or "requested format" in msg
        or "no video formats" in msg
        or "no formats found" in msg
        or "does not have" in msg and "format" in msg
    )


def _format_has_url(fmt):
    return bool(fmt.get("url") or fmt.get("fragment_base_url"))


def _is_audio_only_fmt(fmt):
    if not _format_has_url(fmt):
        return False
    if fmt.get("acodec") in (None, "none"):
        return False
    if fmt.get("vcodec") not in (None, "none"):
        return False
    return True


def _is_muxed_fmt(fmt):
    if not _format_has_url(fmt):
        return False
    if fmt.get("acodec") in (None, "none"):
        return False
    if fmt.get("vcodec") in (None, "none"):
        return False
    return True


def _audio_format_score(fmt):
    ext = (fmt.get("ext") or "").lower()
    ext_pref = {"m4a": 4, "mp4": 3, "webm": 2, "opus": 2, "mp3": 1}.get(ext, 0)
    abr = fmt.get("abr") or 0
    tbr = fmt.get("tbr") or 0
    size = fmt.get("filesize") or fmt.get("filesize_approx") or 0
    return (ext_pref, abr, tbr, -size)


def _pick_best_audio_format(info):
    formats = info.get("formats") or []
    audio_only = [f for f in formats if _is_audio_only_fmt(f)]
    if not audio_only:
        return None
    audio_only.sort(key=_audio_format_score, reverse=True)
    return audio_only[0]


def _pick_smallest_muxed_format(info):
    formats = info.get("formats") or []
    muxed = [f for f in formats if _is_muxed_fmt(f)]
    if not muxed:
        return None
    muxed.sort(
        key=lambda f: (
            f.get("filesize") or f.get("filesize_approx") or 10**12,
            -(f.get("abr") or f.get("tbr") or 0),
        )
    )
    return muxed[0]


def _pick_best_audio_url(info):
    fmt = _pick_best_audio_format(info)
    if fmt and fmt.get("url"):
        return fmt["url"]
    if info.get("url"):
        return info["url"]
    raise RuntimeError("NO_STREAM_URL")


def _extract_info(url, cookie_file, ffmpeg_location, clients):
    opts = _common_opts(cookie_file, ffmpeg_location)
    opts["extractor_args"] = _extractor_args(clients)
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


def _newest_file_in_dir(out_dir):
    files = []
    for name in os.listdir(out_dir):
        if name.endswith(".part") or name.endswith(".ytdl"):
            continue
        full_path = os.path.join(out_dir, name)
        if os.path.isfile(full_path):
            files.append(full_path)
    if not files:
        return None
    files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    return os.path.abspath(files[0])


def _resolve_ffmpeg_bin(ffmpeg_location):
    loc = (ffmpeg_location or "").strip()
    if not loc:
        return ""
    if os.path.isfile(loc):
        return loc
    candidate = os.path.join(loc, "ffmpeg")
    if os.path.isfile(candidate):
        return candidate
    return loc


def _read_linker_marker(ffmpeg_bin):
    marker = ffmpeg_bin + ".use-linker"
    if not os.path.isfile(marker):
        return ""
    try:
        with open(marker, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def _build_ffmpeg_cmd(ffmpeg_bin, *args):
    linker = _read_linker_marker(ffmpeg_bin)
    if linker:
        return [linker, ffmpeg_bin, *args]
    return [ffmpeg_bin, *args]


def _ffmpeg_env(ffmpeg_location):
    bin_path = _resolve_ffmpeg_bin(ffmpeg_location)
    if not bin_path:
        return None
    lib_dir = os.path.dirname(bin_path)
    env = os.environ.copy()
    if lib_dir:
        prev = env.get("LD_LIBRARY_PATH", "").strip()
        env["LD_LIBRARY_PATH"] = lib_dir if not prev else f"{lib_dir}:{prev}"
    return env


def _audio_codec_args(fmt, quality):
    q = str(quality if quality is not None else "0").strip() or "0"
    if fmt == "mp3":
        return ["-codec:a", "libshine", "-b:a", "128k"]
    if fmt in ("m4a", "aac"):
        return ["-codec:a", "aac", "-b:a", "192k"]
    if fmt == "opus":
        return ["-codec:a", "libopus", "-b:a", "128k"]
    if fmt in ("vorbis", "ogg"):
        return ["-codec:a", "libvorbis", "-q:a", q]
    if fmt == "flac":
        return ["-codec:a", "flac"]
    if fmt == "wav":
        return ["-codec:a", "pcm_s16le"]
    return ["-codec:a", "copy"]


def transcode_audio(input_path, audio_format, audio_quality="0", ffmpeg_location="", ffmpeg_lib_dir=""):
    """다운로드 결과를 사용자가 고른 확장자로 ffmpeg 변환."""
    _nrm_log(
        "yt-dlp-py",
        f"transcode_audio in={input_path} fmt={audio_format} q={audio_quality} ffmpeg={ffmpeg_location}",
    )
    inp = (input_path or "").strip()
    if not inp or not os.path.isfile(inp):
        raise RuntimeError("TRANSCODE_INPUT_MISSING")
    fmt = (audio_format or "mp3").strip().lower() or "mp3"
    ffmpeg_bin = _resolve_ffmpeg_bin(ffmpeg_location)
    if not ffmpeg_bin or not os.path.isfile(ffmpeg_bin):
        raise RuntimeError("FFMPEG_REQUIRED")

    base, _ = os.path.splitext(inp)
    out_path = f"{base}.{fmt}"
    if os.path.abspath(inp) == os.path.abspath(out_path):
        return out_path

    import subprocess

    cmd = _build_ffmpeg_cmd(
        ffmpeg_bin,
        "-y",
        "-i",
        inp,
        "-vn",
        *_audio_codec_args(fmt, audio_quality),
        out_path,
    )
    env = _ffmpeg_env(ffmpeg_bin) or os.environ.copy()
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "")[-2000:]
        _nrm_log("yt-dlp-py", f"transcode_audio FAIL code={proc.returncode} tail={tail}")
        raise RuntimeError(f"TRANSCODE_FAILED: {tail}")
    if not os.path.isfile(out_path) or os.path.getsize(out_path) <= 0:
        raise RuntimeError("TRANSCODE_OUTPUT_EMPTY")
    try:
        os.remove(inp)
    except OSError:
        pass
    return os.path.abspath(out_path)


def _download_with_format_id(
    url,
    out_dir,
    cookie_file,
    ffmpeg_location,
    clients,
    format_id,
):
    opts = _common_opts(cookie_file, ffmpeg_location)
    opts["extractor_args"] = _extractor_args(clients)
    opts["format"] = str(format_id)
    opts["outtmpl"] = os.path.join(out_dir, "%(title).100s.%(ext)s")
    opts["nopart"] = False

    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])

    path = _newest_file_in_dir(out_dir)
    if not path:
        raise RuntimeError("DOWNLOADED_FILE_NOT_FOUND")
    return path


def _try_profile(url, out_dir, cookie_file, ffmpeg_location, clients, t0):
    extract_ms = 0
    t_extract = time.monotonic()
    info = _extract_info(url, cookie_file, ffmpeg_location, clients)
    extract_ms = int((time.monotonic() - t_extract) * 1000)

    audio_fmt = _pick_best_audio_format(info)
    if audio_fmt and audio_fmt.get("format_id") is not None:
        fmt_id = audio_fmt["format_id"]
        ext = audio_fmt.get("ext") or "?"
        _nrm_log(
            "yt-dlp-py",
            f"audio-only format_id={fmt_id} ext={ext} clients={clients} cookies={bool(cookie_file)} extractMs={extract_ms}",
        )
        t_dl = time.monotonic()
        path = _download_with_format_id(
            url,
            out_dir,
            cookie_file,
            ffmpeg_location,
            clients,
            fmt_id,
        )
        dl_ms = int((time.monotonic() - t_dl) * 1000)
        _nrm_log(
            "download-stage",
            f"process=ytdlp-py event=extract_ok kind=audio_only clients={clients} cookies={bool(cookie_file)} "
            f"format_id={fmt_id} ext={ext} size={os.path.getsize(path)} extractMs={extract_ms} downloadMs={dl_ms} "
            f"elapsedMs={int((time.monotonic() - t0) * 1000)}",
        )
        _save_profile_cache(out_dir, clients, bool(cookie_file), "audio_only")
        return path

    return None


def _try_muxed_profile(url, out_dir, cookie_file, ffmpeg_location, clients, t0):
    extract_ms = 0
    t_extract = time.monotonic()
    info = _extract_info(url, cookie_file, ffmpeg_location, clients)
    extract_ms = int((time.monotonic() - t_extract) * 1000)

    muxed_fmt = _pick_smallest_muxed_format(info)
    if not muxed_fmt or muxed_fmt.get("format_id") is None:
        return None

    fmt_id = muxed_fmt["format_id"]
    ext = muxed_fmt.get("ext") or "?"
    _nrm_log(
        "yt-dlp-py",
        f"muxed fallback format_id={fmt_id} ext={ext} clients={clients} cookies={bool(cookie_file)} extractMs={extract_ms}",
    )
    t_dl = time.monotonic()
    path = _download_with_format_id(
        url,
        out_dir,
        cookie_file,
        ffmpeg_location,
        clients,
        fmt_id,
    )
    dl_ms = int((time.monotonic() - t_dl) * 1000)
    _nrm_log(
        "download-stage",
        f"process=ytdlp-py event=extract_ok_muxed clients={clients} cookies={bool(cookie_file)} "
        f"format_id={fmt_id} ext={ext} size={os.path.getsize(path)} extractMs={extract_ms} downloadMs={dl_ms} "
        f"elapsedMs={int((time.monotonic() - t0) * 1000)}",
    )
    _save_profile_cache(out_dir, clients, bool(cookie_file), "muxed")
    return path


def get_audio_stream_url(video_id, cookie_file=""):
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    _nrm_log("yt-dlp-py", f"get_audio_stream_url video_id={video_id} cookie={bool(cookie_file)}")
    last_error = None
    cache_dir = os.path.join(os.path.expanduser("~"), ".cache")
    profiles = _ordered_client_profiles(cache_dir)
    for cf in _cookie_attempts(cookie_file):
        for clients in profiles:
            try:
                info = _extract_info(watch_url, cf, "", clients)
                url = _pick_best_audio_url(info)
                _nrm_log(
                    "yt-dlp-py",
                    f"get_audio_stream_url OK clients={clients} cookies={bool(cf)} url_len={len(url)}",
                )
                return url
            except Exception as exc:
                last_error = exc
                _nrm_log(
                    "yt-dlp-py",
                    f"get_audio_stream_url fail clients={clients} cookies={bool(cf)} err={exc}",
                )
                if not _is_format_availability_error(exc):
                    break
    raise RuntimeError(f"STREAM_URL_FAILED: {last_error}")


def download_audio(
    url,
    out_dir,
    cookie_file="",
    audio_format="mp3",
    audio_quality="0",
    ffmpeg_location="",
    ffmpeg_lib_dir="",
):
    """
    1) extract_info 1회 → audio-only format_id로 1회 다운로드
    2) 불가 시 최소 muxed 1회 (Kotlin AudioDemux가 영상 제거)
    3) MP3 등 최종 변환은 Kotlin shine/ffmpeg 단계
    """
    _nrm_log(
        "download-stage",
        f"process=ytdlp-py event=download_start url={url[:120]} fmt={audio_format}",
    )
    t0 = time.monotonic()
    os.makedirs(out_dir, exist_ok=True)
    last_error = None
    profiles = _ordered_client_profiles(out_dir)

    for cf in _cookie_attempts(cookie_file):
        for clients in profiles:
            try:
                path = _try_profile(url, out_dir, cf, ffmpeg_location, clients, t0)
                if path:
                    return path
            except Exception as exc:
                last_error = exc
                _nrm_log(
                    "yt-dlp-py",
                    f"audio-only fail clients={clients} cookies={bool(cf)} err={exc}",
                )
                if not _is_format_availability_error(exc):
                    break

    # muxed 최후 1~2 profile만 (전체 매트릭스 재시도 금지)
    muxed_profiles = profiles[:2]
    for cf in _cookie_attempts(cookie_file)[:1]:
        for clients in muxed_profiles:
            try:
                path = _try_muxed_profile(url, out_dir, cf, ffmpeg_location, clients, t0)
                if path:
                    return path
            except Exception as exc:
                last_error = exc
                _nrm_log(
                    "yt-dlp-py",
                    f"muxed fail clients={clients} cookies={bool(cf)} err={exc}",
                )

    raise RuntimeError(f"DOWNLOAD_FAILED: {last_error}")
