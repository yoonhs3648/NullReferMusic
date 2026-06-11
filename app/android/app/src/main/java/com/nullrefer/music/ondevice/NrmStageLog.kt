package com.nullrefer.music.ondevice

/** yt-dlp / ffmpeg / whisper / demux 등 단위 프로세스 단계 로그 (download-stage 태그) */
object NrmStageLog {
  fun log(
      process: String,
      event: String,
      fields: Map<String, Any?> = emptyMap(),
  ) {
    val sb = StringBuilder("process=$process event=$event")
    for ((k, v) in fields) {
      if (v == null) continue
      sb.append(' ').append(k).append('=').append(v)
    }
    NrmFileLogger.log("download-stage", sb.toString())
  }
}
