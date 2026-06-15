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

  fun plan(context: Context, fmt: String, options: AudioEncodeOptions): TranscodePlan {
    val enc = encoders(context)
    val qStr = options.quality.coerceIn(0, 9).toString()
    return when (fmt.lowercase()) {
      "mp3" ->
        when {
          enc.contains("libmp3lame") && !options.useCbr() ->
            TranscodePlan(
              "mp3",
              listOf(
                "-codec:a",
                "libmp3lame",
                "-q:a",
                AudioEncodeBitrate.lameVbrQ(options).toString(),
              ),
            )
          enc.contains("libshine") ->
            TranscodePlan(
              "mp3",
              listOf(
                "-codec:a",
                "libshine",
                "-b:a",
                "${AudioEncodeBitrate.cbrKbpsForOptions(options)}k",
              ),
            )
          enc.contains("libmp3lame") ->
            TranscodePlan(
              "mp3",
              listOf("-codec:a", "libmp3lame", "-b:a", AudioEncodeBitrate.ffmpegBitrateArg(options.quality)),
            )
          else ->
            TranscodePlan(
              "m4a",
              listOf("-codec:a", "copy"),
              "mp3_unavailable_m4a_remux",
            )
        }
      "m4a", "aac" ->
        if (enc.contains("aac")) {
          if (!options.useCbr()) {
            TranscodePlan(
              "m4a",
              listOf(
                "-codec:a",
                "aac",
                "-q:a",
                AudioEncodeBitrate.aacVbrQ(options).toString(),
              ),
            )
          } else {
            TranscodePlan(
              "m4a",
              listOf(
                "-codec:a",
                "aac",
                "-b:a",
                AudioEncodeBitrate.ffmpegBitrateArg(options.quality),
              ),
            )
          }
        } else {
          TranscodePlan("m4a", listOf("-codec:a", "copy"))
        }
      "opus" ->
        if (enc.contains("libopus")) {
          if (!options.useCbr()) {
            TranscodePlan("opus", listOf("-codec:a", "libopus", "-q:a", qStr))
          } else {
            TranscodePlan("opus", listOf("-codec:a", "libopus", "-b:a", "128k"))
          }
        } else {
          TranscodePlan("m4a", listOf("-codec:a", "copy"), "opus_unavailable_m4a_remux")
        }
      "vorbis", "ogg" ->
        if (enc.contains("libvorbis")) {
          TranscodePlan("ogg", listOf("-codec:a", "libvorbis", "-q:a", qStr))
        } else {
          TranscodePlan("m4a", listOf("-codec:a", "copy"), "vorbis_unavailable_m4a_remux")
        }
      "flac" ->
        if (enc.contains("flac")) {
          TranscodePlan("flac", listOf("-codec:a", "flac"))
        } else {
          TranscodePlan("m4a", listOf("-codec:a", "copy"), "flac_unavailable_m4a_remux")
        }
      "wav" -> TranscodePlan("wav", listOf("-ar", "44100", "-ac", "2", "-codec:a", "pcm_s16le"))
      else -> TranscodePlan(fmt.lowercase(), listOf("-codec:a", "copy"))
    }
  }

  fun plan(context: Context, fmt: String, quality: Int): TranscodePlan =
    plan(context, fmt, AudioEncodeOptions(quality = quality))

  fun canReencodeMp3(context: Context): Boolean {
    val enc = encoders(context)
    return enc.contains("libshine") || enc.contains("libmp3lame")
  }

  fun mp3BitrateKbps(quality: Int): Int = AudioEncodeBitrate.kbpsForQuality(quality)
}
