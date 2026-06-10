import os

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

_FORMAT_SELECTORS = [
    "bestaudio[ext=m4a]/bestaudio/best",
    "bestaudio/best",
    "ba/b",
]


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
        "retries": 3,
        "socket_timeout": 30,
    }
    if cookie_file and os.path.exists(cookie_file):
        opts["cookiefile"] = cookie_file
    loc_dir = _ffmpeg_dir(ffmpeg_location)
    if loc_dir:
        opts["ffmpeg_location"] = loc_dir
    return opts


def _pick_best_audio_url(info):
    formats = info.get("formats") or []
    audio_only = []
    for fmt in formats:
        if not fmt.get("url"):
            continue
        if fmt.get("acodec") in (None, "none"):
            continue
        if fmt.get("vcodec") != "none":
            continue
        audio_only.append(fmt)

    if audio_only:
        audio_only.sort(key=lambda f: (f.get("abr") or 0, f.get("tbr") or 0), reverse=True)
        return audio_only[0]["url"]
    if info.get("url"):
        return info["url"]
    raise RuntimeError("NO_STREAM_URL")


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
    )


def get_audio_stream_url(video_id, cookie_file=""):
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    _nrm_log("yt-dlp-py", f"get_audio_stream_url video_id={video_id} cookie={bool(cookie_file)}")
    last_error = None
    for cf in _cookie_attempts(cookie_file):
        for clients in _CLIENT_PROFILES:
            opts = _common_opts(cf)
            opts["extractor_args"] = _extractor_args(clients)
            try:
                _nrm_log(
                    "yt-dlp-py",
                    f"extract_info clients={clients} cookies={bool(cf)}",
                )
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(watch_url, download=False)
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
    raise RuntimeError(f"STREAM_URL_FAILED: {last_error}")


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


def _is_ffmpeg_error(exc):
    msg = str(exc).lower()
    return (
        "ffmpeg" in msg
        or "postprocessor" in msg
        or "ffprobe" in msg
        or "executable" in msg and "not found" in msg
    )


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


def _audio_codec_args(fmt, quality):
    q = str(quality if quality is not None else "0").strip() or "0"
    if fmt == "mp3":
        # Android LGPL ffmpeg: libmp3lame(GPL) 없음 → libshine 또는 m4a remux
        return ["-codec:a", "libshine", "-b:a", "128k"]
    if fmt in ("m4a", "aac"):
        return ["-codec:a", "aac", "-b:a", "192k"]
    if fmt == "opus":
        return ["-codec:a", "libopus", "-b:a", "128k"]
    if fmt == "vorbis" or fmt == "ogg":
        return ["-codec:a", "libvorbis", "-q:a", q]
    if fmt == "flac":
        return ["-codec:a", "flac"]
    if fmt == "wav":
        return ["-codec:a", "pcm_s16le"]
    return ["-codec:a", "copy"]


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


def _read_linker_marker(ffmpeg_bin):
    """Kotlin NrmExecutableFile.ensureExecMode() 가 기록한 .use-linker 마커."""
    marker = ffmpeg_bin + ".use-linker"
    if not os.path.isfile(marker):
        return ""
    try:
        with open(marker, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def _build_ffmpeg_cmd(ffmpeg_bin, *args):
    """API 29+ W^X: linker64 경유가 필요하면 [linker, bin, ...args] 로 구성."""
    linker = _read_linker_marker(ffmpeg_bin)
    if linker:
        return [linker, ffmpeg_bin, *args]
    return [ffmpeg_bin, *args]


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
    _nrm_log("yt-dlp-py", f"transcode_audio cmd0={cmd[0]} argc={len(cmd)}")
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "")[-2000:]
        _nrm_log("yt-dlp-py", f"transcode_audio FAIL code={proc.returncode} tail={tail}")
        raise RuntimeError(f"TRANSCODE_FAILED: {tail}")
    if not os.path.isfile(out_path) or os.path.getsize(out_path) <= 0:
        _nrm_log("yt-dlp-py", "transcode_audio output empty")
        raise RuntimeError("TRANSCODE_OUTPUT_EMPTY")
    _nrm_log("yt-dlp-py", f"transcode_audio OK out={out_path} size={os.path.getsize(out_path)}")
    try:
        os.remove(inp)
    except OSError:
        pass
    return os.path.abspath(out_path)


def _ensure_target_extension(path, target_fmt, ffmpeg_location, quality):
    ext = os.path.splitext(path)[1].lstrip(".").lower()
    if ext == target_fmt:
        return path
    return transcode_audio(path, target_fmt, quality, ffmpeg_location)


def _attempt_download(
    url,
    out_dir,
    cookie_file,
    ffmpeg_location,
    use_convert,
    fmt,
    quality,
    clients,
    format_selector="bestaudio/best",
):
    opts = _common_opts(cookie_file, ffmpeg_location)
    opts["extractor_args"] = _extractor_args(clients)
    opts["format"] = format_selector
    opts["outtmpl"] = os.path.join(out_dir, "%(title).100s.%(ext)s")
    opts["nopart"] = False

    if use_convert:
        opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": fmt,
                "preferredquality": quality,
            }
        ]

    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])

    path = _newest_file_in_dir(out_dir)
    if not path:
        raise RuntimeError("DOWNLOADED_FILE_NOT_FOUND")
    return path


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
    1) yt-dlp로 bestaudio만 받기 (예전 안정 경로)
    2) 확장자 변환은 JS/Kotlin 단계의 transcodeAudio에서 처리
    """
    _nrm_log(
        "yt-dlp-py",
        f"download_audio url={url} out={out_dir} fmt={audio_format} ffmpeg={ffmpeg_location}",
    )
    os.makedirs(out_dir, exist_ok=True)
    last_error = None
    for cf in _cookie_attempts(cookie_file):
        for clients in _CLIENT_PROFILES:
            for fmt_sel in _FORMAT_SELECTORS:
                try:
                    _nrm_log(
                        "yt-dlp-py",
                        f"download attempt clients={clients} cookies={bool(cf)} format={fmt_sel}",
                    )
                    path = _attempt_download(
                        url,
                        out_dir,
                        cf,
                        ffmpeg_location,
                        False,
                        "m4a",
                        "0",
                        clients,
                        fmt_sel,
                    )
                    _nrm_log(
                        "yt-dlp-py",
                        f"download_audio OK path={path} size={os.path.getsize(path)}",
                    )
                    return path
                except Exception as exc:
                    last_error = exc
                    _nrm_log(
                        "yt-dlp-py",
                        f"download fail clients={clients} cookies={bool(cf)} format={fmt_sel} err={exc}",
                    )
                    if not _is_format_availability_error(exc):
                        break

    raise RuntimeError(f"DOWNLOAD_FAILED: {last_error}")
