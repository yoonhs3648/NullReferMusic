package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File

/** yt-dlp 등이 muxed(영상+오디오) 파일을 받았을 때 오디오 트랙만 분리합니다. */
object AudioDemux {
  private val videoStreamRe =
      Regex("""Stream\s+#\d+:\d+.*?:\s*Video:""", RegexOption.IGNORE_CASE)

  fun hasVideoStream(paths: FfmpegBootstrap.FfmpegPaths, input: File): Boolean {
    val (_, out) =
        FfmpegExec.runCapture(
            paths.binary,
            paths.libDir,
            listOf("-hide_banner", "-i", input.absolutePath),
            tag = "ffmpeg-probe-audio",
            timeoutSec = 45,
        )
    return videoStreamRe.containsMatchIn(out)
  }

  fun ensureAudioOnly(context: Context, input: File, audioQuality: Int = 0): File =
    ensureAudioOnly(context, input, AudioEncodeOptions(quality = audioQuality))

  fun ensureAudioOnly(context: Context, input: File, options: AudioEncodeOptions): File {
    val paths = FfmpegBootstrap.ensure(context) ?: return input
    if (!input.isFile) return input

    if (!hasVideoStream(paths, input)) {
      NrmFileLogger.log("audio-demux", "skip audio-only path=${input.absolutePath} bytes=${input.length()}")
      return input
    }

    val out =
        File(
            input.parentFile,
            "nrm-audio-${System.currentTimeMillis()}-${input.nameWithoutExtension}.m4a",
        )
    val t0 = System.currentTimeMillis()
    NrmFileLogger.log(
        "audio-demux",
        "demux start in=${input.absolutePath} bytes=${input.length()} out=${out.absolutePath}",
    )

    try {
      FfmpegExec.runWithPaths(
          paths.binary,
          paths.libDir,
          listOf(
              "-y",
              "-i",
              input.absolutePath,
              "-vn",
              "-map",
              "0:a:0",
              "-codec:a",
              "copy",
              out.absolutePath,
          ),
          tag = "ffmpeg-demux",
      )
    } catch (copyErr: Exception) {
      NrmFileLogger.warn("audio-demux", "aac copy 실패 — aac 재인코딩: ${copyErr.message}")
      if (out.exists()) out.delete()
      val aacArgs =
          if (options.useCbr()) {
            listOf("-codec:a", "aac", "-b:a", AudioEncodeBitrate.ffmpegBitrateArg(options.quality))
          } else {
            listOf(
                "-codec:a",
                "aac",
                "-q:a",
                AudioEncodeBitrate.aacVbrQ(options).toString(),
            )
          }
      FfmpegExec.runWithPaths(
          paths.binary,
          paths.libDir,
          listOf("-y", "-i", input.absolutePath, "-vn", "-map", "0:a:0") + aacArgs + listOf(out.absolutePath),
          tag = "ffmpeg-demux-aac",
      )
    }

    if (!out.isFile || out.length() <= 0L) {
      throw Exception("DEMUX_OUTPUT_EMPTY")
    }

    try {
      input.delete()
    } catch (_: Exception) {
    }

    NrmFileLogger.log(
        "audio-demux",
        "demux ok out=${out.absolutePath} bytes=${out.length()} ms=${System.currentTimeMillis() - t0}",
    )
    return out
  }
}
