package com.nullrefer.music.ondevice

import android.content.Context
import java.io.File

/** mp4/m4a 등 → 사용자 설정 확장자로 ffmpeg 변환 (FfmpegExec / linker 경유). */
object FfmpegTranscode {
  data class Result(
    val file: File,
    /** 실제 출력 확장자 (mp3 요청 → m4a remux 등) */
    val effectiveFormat: String,
    val fallbackReason: String? = null,
  )

  /**
   * @throws IllegalStateException ffmpeg 미준비
   * @throws Exception ffmpeg exit != 0 또는 출력 없음
   */
  fun transcode(
    context: Context,
    input: File,
    audioFormat: String,
    audioQuality: Int,
  ): Result {
    val paths =
      FfmpegBootstrap.ensure(context)
        ?: throw IllegalStateException("ffmpeg를 사용할 수 없습니다.")

    val requested = audioFormat.trim().ifBlank { "mp3" }.lowercase()
    if (requested == "mp3" && !FfmpegEncoderSupport.canReencodeMp3(context)) {
      ShineBootstrap.ensure(context)?.let { shineCli ->
        try {
          return transcodeMp3ViaShineCli(context, paths, shineCli, input, audioQuality)
        } catch (e: Exception) {
          NrmFileLogger.warn(
            "ffmpeg-transcode",
            "shineenc mp3 실패 — m4a remux fallback: ${e.message}",
          )
        }
      }
    }

    val plan = FfmpegEncoderSupport.plan(context, requested, audioQuality)
    val basePath =
      input.absolutePath.let { path ->
        val dot = path.lastIndexOf('.')
        if (dot > 0) path.substring(0, dot) else path
      }
    val out = File("$basePath.${plan.outputExt}")
    if (input.absolutePath == out.absolutePath) {
      return Result(input, plan.outputExt, plan.fallbackReason)
    }

    val args =
      listOf("-y", "-i", input.absolutePath, "-vn") +
        plan.codecArgs +
        listOf(out.absolutePath)

    NrmFileLogger.log(
      "ffmpeg-transcode",
      "시작 in=${input.absolutePath} out=${out.absolutePath} req=$requested eff=${plan.outputExt}" +
        (plan.fallbackReason?.let { " fallback=$it" } ?: ""),
    )
    FfmpegExec.runWithPaths(
      paths.binary,
      paths.libDir,
      args,
      tag = "ffmpeg-transcode",
      timeoutSec = 600,
    )

    if (!out.isFile || out.length() <= 0L) {
      throw Exception("TRANSCODE_OUTPUT_EMPTY")
    }
    try {
      input.delete()
    } catch (_: Exception) {
    }
    return Result(out, plan.outputExt, plan.fallbackReason)
  }

  /** ffmpeg libshine 없을 때 shineenc CLI로 mp3 생성 (44100Hz stereo WAV 경유). */
  private fun transcodeMp3ViaShineCli(
    context: Context,
    paths: FfmpegBootstrap.FfmpegPaths,
    shineCli: File,
    input: File,
    audioQuality: Int,
  ): Result {
    val basePath =
      input.absolutePath.let { path ->
        val dot = path.lastIndexOf('.')
        if (dot > 0) path.substring(0, dot) else path
      }
    val wav = File(input.parentFile, "nrm-shine-${System.currentTimeMillis()}.wav")
    val out = File("$basePath.mp3")
    val kbps = FfmpegEncoderSupport.mp3BitrateKbps(audioQuality)
    try {
      NrmFileLogger.log(
        "ffmpeg-transcode",
        "shineenc mp3 in=${input.absolutePath} out=${out.absolutePath} kbps=$kbps",
      )
      FfmpegExec.runWithPaths(
        paths.binary,
        paths.libDir,
        listOf(
          "-y",
          "-i",
          input.absolutePath,
          "-vn",
          "-ar",
          "44100",
          "-ac",
          "2",
          "-c:a",
          "pcm_s16le",
          wav.absolutePath,
        ),
        tag = "ffmpeg-shine-wav",
        timeoutSec = 600,
      )
      ShineExec.run(
        shineCli,
        listOf("-q", "-b", kbps.toString(), wav.absolutePath, out.absolutePath),
        tag = "shineenc",
        timeoutSec = 600,
      )
      if (!out.isFile || out.length() <= 0L) {
        throw Exception("SHINE_OUTPUT_EMPTY")
      }
      try {
        input.delete()
      } catch (_: Exception) {
      }
      return Result(out, "mp3", null)
    } finally {
      wav.delete()
    }
  }
}
