package com.nullrefer.music.ondevice

import android.content.Context

/**
 * Android FFmpeg (LGPL, --disable-gpl) 에서 사용 가능한 오디오 인코더를 런타임 probe.
 * libmp3lame(GPL) 없음 → libshine 또는 m4a remux(aac copy) 로 대체.
 */
object FfmpegEncoderSupport {
  data class TranscodePlan(
    val outputExt: String,
    val codecArgs: List<String>,
    /** mp3 요청이 m4a remux로 대체된 경우 등 */
    val fallbackReason: String? = null,
  )

  @Volatile
  private var cachedEncoders: Set<String>? = null

  fun invalidateCache() {
    cachedEncoders = null
  }

  fun encoders(context: Context): Set<String> {
    cachedEncoders?.let { return it }
    synchronized(this) {
      cachedEncoders?.let { return it }
      val paths = FfmpegBootstrap.ensure(context) ?: return emptySet()
      val (_, output) =
        FfmpegExec.runCapture(
          paths.binary,
          paths.libDir,
          listOf("-hide_banner", "-encoders"),
          tag = "ffmpeg-encoders",
          timeoutSec = 30,
        )
      val found = mutableSetOf<String>()
      for (line in output.lineSequence()) {
        //  A....D aac                  (점·문자 6칸 플래그 + 공백 + 이름)
        val m = Regex("""^\s+(\S{6})\s+(\S+)""").find(line) ?: continue
        val flags = m.groupValues[1]
        if (!flags.startsWith("A")) continue
        found.add(m.groupValues[2].trim())
      }
      val mp3Enc = when {
        found.contains("libshine") -> "libshine"
        found.contains("libmp3lame") -> "libmp3lame"
        else -> "none"
      }
      NrmFileLogger.log(
        "ffmpeg",
        "encoders probe count=${found.size} mp3=$mp3Enc hasAac=${found.contains("aac")}",
      )
      cachedEncoders = found
      return found
    }
  }

  fun plan(context: Context, fmt: String, quality: Int): TranscodePlan {
    val enc = encoders(context)
    val q = quality.coerceIn(0, 9).toString()
    return when (fmt.lowercase()) {
      "mp3" ->
        when {
          enc.contains("libshine") ->
            TranscodePlan(
              "mp3",
              listOf("-codec:a", "libshine", "-b:a", mp3BitrateK(quality)),
            )
          enc.contains("libmp3lame") ->
            TranscodePlan("mp3", listOf("-codec:a", "libmp3lame", "-q:a", q))
          else ->
            TranscodePlan(
              "m4a",
              listOf("-codec:a", "copy"),
              "mp3_unavailable_m4a_remux",
            )
        }
      "m4a", "aac" ->
        if (enc.contains("aac")) {
          TranscodePlan("m4a", listOf("-codec:a", "aac", "-b:a", "192k"))
        } else {
          TranscodePlan("m4a", listOf("-codec:a", "copy"))
        }
      "opus" ->
        if (enc.contains("libopus")) {
          TranscodePlan("opus", listOf("-codec:a", "libopus", "-b:a", "128k"))
        } else {
          TranscodePlan("m4a", listOf("-codec:a", "copy"), "opus_unavailable_m4a_remux")
        }
      "vorbis", "ogg" ->
        if (enc.contains("libvorbis")) {
          TranscodePlan("ogg", listOf("-codec:a", "libvorbis", "-q:a", q))
        } else {
          TranscodePlan("m4a", listOf("-codec:a", "copy"), "vorbis_unavailable_m4a_remux")
        }
      "flac" ->
        if (enc.contains("flac")) {
          TranscodePlan("flac", listOf("-codec:a", "flac"))
        } else {
          TranscodePlan("m4a", listOf("-codec:a", "copy"), "flac_unavailable_m4a_remux")
        }
      "wav" -> TranscodePlan("wav", listOf("-codec:a", "pcm_s16le"))
      else -> TranscodePlan(fmt.lowercase(), listOf("-codec:a", "copy"))
    }
  }

  /** 메타데이터 재래핑 시 mp3 재인코딩 가능 여부 */
  fun canReencodeMp3(context: Context): Boolean {
    val enc = encoders(context)
    return enc.contains("libshine") || enc.contains("libmp3lame")
  }

  /** libshine / shineenc CBR kbps (quality 0=최고 … 9=최저) */
  fun mp3BitrateKbps(quality: Int): Int =
    when (quality.coerceIn(0, 9)) {
      0 -> 320
      1 -> 256
      2 -> 224
      3 -> 192
      4 -> 160
      5 -> 128
      6 -> 112
      7 -> 96
      8 -> 80
      else -> 64
    }

  private fun mp3BitrateK(quality: Int): String = "${mp3BitrateKbps(quality)}k"
}
