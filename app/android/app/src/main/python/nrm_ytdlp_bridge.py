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
    ["web"],
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


def get_audio_stream_url(video_id, cookie_file=""):
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    _nrm_log("yt-dlp-py", f"get_audio_stream_url video_id={video_id} cookie={bool(cookie_file)}")
    last_error = None
    for clients in _CLIENT_PROFILES:
        opts = _common_opts(cookie_file)
        opts["extractor_args"] = _extractor_args(clients)
        try:
            _nrm_log("yt-dlp-py", f"extract_info clients={clients}")
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(watch_url, download=False)
            url = _pick_best_audio_url(info)
            _nrm_log("yt-dlp-py", f"get_audio_stream_url OK clients={clients} url_len={len(url)}")
            return url
        except Exception as exc:
            last_error = exc
            _nrm_log("yt-dlp-py", f"get_audio_stream_url fail clients={clients} err={exc}")
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


def _ffmpeg_exec_argv(ffmpeg_bin, args):
    """Kotlin NrmExecutableFile.buildExecArgv 와 동일 — .use-linker 마커 시 linker 경유."""
    marker = ffmpeg_bin + ".use-linker"
    if os.path.isfile(marker):
        try:
            with open(marker, encoding="utf-8") as f:
                linker = f.read().strip()
            if linker:
                return [linker, ffmpeg_bin, *args]
        except OSError:
            pass
    return [ffmpeg_bin, *args]


def _audio_codec_args(fmt, quality):
    q = str(quality if quality is not None else "0").strip() or "0"
    if fmt == "mp3":
        return ["-codec:a", "libmp3lame", "-q:a", q]
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


def transcode_audio(input_path, audio_format, audio_quality="0", ffmpeg_location=""):
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

    cmd = _ffmpeg_exec_argv(
        ffmpeg_bin,
        [
            "-y",
            "-i",
            inp,
            "-vn",
            *_audio_codec_args(fmt, audio_quality),
            out_path,
        ],
    )
    proc = subprocess.run(cmd, capture_output=True, text=True)
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


def _attempt_download(url, out_dir, cookie_file, ffmpeg_location, use_convert, fmt, quality, clients):
    opts = _common_opts(cookie_file, ffmpeg_location)
    opts["extractor_args"] = _extractor_args(clients)
    opts["format"] = "bestaudio/best"
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
    for clients in _CLIENT_PROFILES:
        try:
            _nrm_log("yt-dlp-py", f"download attempt clients={clients}")
            path = _attempt_download(
                url,
                out_dir,
                cookie_file,
                ffmpeg_location,
                False,
                "m4a",
                "0",
                clients,
            )
            _nrm_log("yt-dlp-py", f"download_audio OK path={path} size={os.path.getsize(path)}")
            return path
        except Exception as exc:
            last_error = exc
            _nrm_log("yt-dlp-py", f"download fail clients={clients} err={exc}")

    raise RuntimeError(f"DOWNLOAD_FAILED: {last_error}")
