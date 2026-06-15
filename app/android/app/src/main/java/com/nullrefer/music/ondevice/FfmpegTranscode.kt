package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File

/** mp4/m4a 등 → 사용자 설정 확장자로 ffmpeg 변환 (FfmpegExec / linker 경유). */
object FfmpegTranscode {
  data class Result(
    val file: File,
    val effectiveFormat: String,
    val fallbackReason: String? = null,
  )

  fun transcode(
    context: Context,
    input: File,
    audioFormat: String,
    options: AudioEncodeOptions,
  ): Result {
    val paths =
      FfmpegBootstrap.ensure(context)
        ?: throw IllegalStateException("ffmpeg를 사용할 수 없습니다.")

    val requested = audioFormat.trim().ifBlank { "mp3" }.lowercase()
    if (requested == "mp3") {
      return transcodeToMp3(context, paths, input, options)
    }

    val plan = FfmpegEncoderSupport.plan(context, requested, options)
    if (plan.fallbackReason != null) {
      throw Exception("TRANSCODE_FORMAT_UNAVAILABLE:$requested")
    }
    return runFfmpegTranscode(paths, input, plan.outputExt, plan.codecArgs, requested, plan.fallbackReason)
  }

  fun transcode(
    context: Context,
    input: File,
    audioFormat: String,
    audioQuality: Int,
  ): Result = transcode(context, input, audioFormat, AudioEncodeOptions(quality = audioQuality))

  private fun transcodeToMp3(
    context: Context,
    paths: FfmpegBootstrap.FfmpegPaths,
    input: File,
    options: AudioEncodeOptions,
  ): Result {
    val basePath =
      input.absolutePath.let { path ->
        val dot = path.lastIndexOf('.')
        if (dot > 0) path.substring(0, dot) else path
      }
    val out = File("$basePath.mp3")
    if (input.absolutePath == out.absolutePath) {
      return Result(input, "mp3", null)
    }

    if (FfmpegEncoderSupport.canReencodeMp3(context)) {
      val plan = FfmpegEncoderSupport.plan(context, "mp3", options)
      if (plan.outputExt == "mp3" && plan.fallbackReason == null) {
        return runFfmpegTranscode(paths, input, "mp3", plan.codecArgs, "mp3", null)
      }
    }

    val shineCli =
      ShineBootstrap.ensure(context)
        ?: throw IllegalStateException("MP3 인코더(shineenc)를 사용할 수 없습니다.")

    val kbps = AudioEncodeBitrate.cbrKbpsForOptions(options)
    NrmFileLogger.log(
      "ffmpeg-transcode",
      "shineenc mp3 in=${input.absolutePath} out=${out.absolutePath} kbps=$kbps vbr=${options.vbrMode}",
    )
    NrmMediaCpuPriority.runFfmpegPriority {
      ShineMp3Transcode.transcode(paths, shineCli, input, out, kbps)
    }

    if (!out.isFile || out.length() <= 0L) {
      throw Exception("MP3_OUTPUT_EMPTY")
    }
    try {
      input.delete()
    } catch (_: Exception) {
    }
    return Result(out, "mp3", null)
  }

  private fun runFfmpegTranscode(
    paths: FfmpegBootstrap.FfmpegPaths,
    input: File,
    outputExt: String,
    codecArgs: List<String>,
    requested: String,
    fallbackReason: String?,
  ): Result {
    val basePath =
      input.absolutePath.let { path ->
        val dot = path.lastIndexOf('.')
        if (dot > 0) path.substring(0, dot) else path
      }
    val out = File("$basePath.$outputExt")
    if (input.absolutePath == out.absolutePath) {
      return Result(input, outputExt, fallbackReason)
    }

    val args =
      listOf("-y", "-i", input.absolutePath, "-vn") +
        codecArgs +
        listOf(out.absolutePath)

    NrmFileLogger.log(
      "ffmpeg-transcode",
      "시작 in=${input.absolutePath} out=${out.absolutePath} req=$requested eff=$outputExt" +
        (fallbackReason?.let { " fallback=$it" } ?: ""),
    )
    FfmpegExec.runWithPaths(
      paths.binary,
      paths.libDir,
      args,
      tag = "ffmpeg-transcode",
    )

    if (!out.isFile || out.length() <= 0L) {
      throw Exception("TRANSCODE_OUTPUT_EMPTY")
    }
    try {
      input.delete()
    } catch (_: Exception) {
    }
    return Result(out, outputExt, fallbackReason)
  }
}
