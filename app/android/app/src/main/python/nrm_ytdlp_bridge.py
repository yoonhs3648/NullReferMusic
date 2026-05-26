import os

import yt_dlp


_CLIENT_PROFILES = [
    ["android", "web"],
    ["ios", "web"],
    ["tv_embedded", "web"],
    ["web"],
]


def _extractor_args(player_clients):
    return {"youtube": {"player_client": player_clients}}


def _common_opts(cookie_file):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "retries": 3,
        "socket_timeout": 30,
    }
    if cookie_file and os.path.exists(cookie_file):
        opts["cookiefile"] = cookie_file
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
    last_error = None
    for clients in _CLIENT_PROFILES:
        opts = _common_opts(cookie_file)
        opts["extractor_args"] = _extractor_args(clients)
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(watch_url, download=False)
            return _pick_best_audio_url(info)
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"STREAM_URL_FAILED: {last_error}")


def download_audio(url, out_dir, cookie_file="", audio_format="mp3", audio_quality="0"):
    os.makedirs(out_dir, exist_ok=True)
    outtmpl = os.path.join(out_dir, "%(title).100s.%(ext)s")
    fmt = (audio_format or "mp3").strip().lower() or "mp3"
    quality = str(audio_quality if audio_quality is not None else "0").strip() or "0"

    last_error = None
    for clients in _CLIENT_PROFILES:
        opts = _common_opts(cookie_file)
        opts["extractor_args"] = _extractor_args(clients)
        opts["format"] = "bestaudio/best"
        opts["outtmpl"] = outtmpl
        opts["nopart"] = False
        opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": fmt,
                "preferredquality": quality,
            }
        ]

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])

            files = []
            for name in os.listdir(out_dir):
                if name.endswith(".part") or name.endswith(".ytdl"):
                    continue
                full_path = os.path.join(out_dir, name)
                if os.path.isfile(full_path):
                    files.append(full_path)
            if not files:
                raise RuntimeError("DOWNLOADED_FILE_NOT_FOUND")
            files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
            return os.path.abspath(files[0])
        except Exception as exc:
            last_error = exc

    raise RuntimeError(f"DOWNLOAD_FAILED: {last_error}")
