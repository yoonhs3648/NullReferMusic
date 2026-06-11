package com.nullrefer.music.ondevice

import java.io.File
import java.util.concurrent.TimeUnit
import android.os.SystemClock

/** shineenc MP3 변환 — ffmpeg PCM 파이프 또는 임시 WAV 폴백 */
object ShineMp3Transcode {
  fun transcode(
      paths: FfmpegBootstrap.FfmpegPaths,
      shineCli: File,
      input: File,
      outMp3: File,
      kbps: Int,
  ) {
    val t0 = SystemClock.elapsedRealtime()
    try {
      transcodeViaPipe(paths, shineCli, input, outMp3, kbps)
      NrmStageLog.log(
          "ffmpeg",
          "shine_mp3_ok",
          mapOf(
              "method" to "pipe",
              "elapsedMs" to (SystemClock.elapsedRealtime() - t0),
              "kbps" to kbps,
              "outBytes" to outMp3.length(),
          ),
      )
    } catch (pipeErr: Exception) {
      NrmFileLogger.warn("ffmpeg-transcode", "shineenc pipe 실패 → wav 폴백: ${pipeErr.message}")
      val wavT0 = SystemClock.elapsedRealtime()
      transcodeViaTempWav(paths, shineCli, input, outMp3, kbps)
      NrmStageLog.log(
          "ffmpeg",
          "shine_mp3_ok",
          mapOf(
              "method" to "wav_temp",
              "elapsedMs" to (SystemClock.elapsedRealtime() - wavT0),
              "totalMs" to (SystemClock.elapsedRealtime() - t0),
              "kbps" to kbps,
              "outBytes" to outMp3.length(),
          ),
      )
    }
  }

  private fun pcmFfmpegArgs(input: File): List<String> =
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
      )

  private fun transcodeViaPipe(
      paths: FfmpegBootstrap.FfmpegPaths,
      shineCli: File,
      input: File,
      outMp3: File,
      kbps: Int,
  ) {
    NrmExecutableFile.ensureExecMode(shineCli, NrmExecutableFile.PROBE_HELP)
    val ffmpegArgv =
        NrmExecutableFile.buildExecArgv(
            paths.binary,
            pcmFfmpegArgs(input) + listOf("-f", "wav", "pipe:1"),
        )
    val shineArgv =
        NrmExecutableFile.buildExecArgv(
            shineCli,
            listOf("-q", "-b", kbps.toString(), "-", outMp3.absolutePath),
        )

    NrmFileLogger.log(
        "ffmpeg-transcode",
        "shineenc pipe start in=${input.absolutePath} out=${outMp3.absolutePath} kbps=$kbps",
    )

    val ffmpegPb = ProcessBuilder(ffmpegArgv)
    FfmpegExec.applyLibEnv(ffmpegPb, paths.libDir.absolutePath)
    ffmpegPb.redirectOutput(ProcessBuilder.Redirect.PIPE)
    ffmpegPb.redirectError(ProcessBuilder.Redirect.PIPE)

    val shinePb = ProcessBuilder(shineArgv)
    shinePb.redirectInput(ProcessBuilder.Redirect.PIPE)
    shinePb.redirectErrorStream(true)

    val ffmpeg = ffmpegPb.start()
    val shine = shinePb.start()

    val errText = StringBuilder()
    val errDrain =
        Thread {
          ffmpeg.errorStream.bufferedReader().use { r ->
            var line: String?
            while (r.readLine().also { line = it } != null) {
              errText.append(line).append('\n')
            }
          }
        }
    errDrain.start()

    val copyErr =
        runCatching {
          ffmpeg.inputStream.use { ins ->
            shine.outputStream.use { outs -> ins.copyTo(outs) }
          }
        }
    try {
      shine.outputStream.close()
    } catch (_: Exception) {
    }

    val ffFinished = ffmpeg.waitFor(600, TimeUnit.SECONDS)
    if (!ffFinished) {
      ffmpeg.destroyForcibly()
      shine.destroyForcibly()
      throw Exception("ffmpeg_pipe_timeout")
    }
    errDrain.join(5000)

    val shFinished = shine.waitFor(600, TimeUnit.SECONDS)
    if (!shFinished) {
      shine.destroyForcibly()
      throw Exception("shineenc_pipe_timeout")
    }

    val ffCode = ffmpeg.exitValue()
    val shCode = shine.exitValue()
    if (ffCode != 0) {
      NrmFileLogger.warn("ffmpeg-shine-pipe", "ffmpeg exit=$ffCode err=${errText.toString().take(400)}")
      throw Exception("ffmpeg_pipe_exit_$ffCode")
    }
    if (shCode != 0) {
      throw Exception("shineenc_pipe_exit_$shCode")
    }
    if (!outMp3.isFile || outMp3.length() <= 0L) {
      throw Exception("SHINE_PIPE_OUTPUT_EMPTY")
    }
  }

  private fun transcodeViaTempWav(
      paths: FfmpegBootstrap.FfmpegPaths,
      shineCli: File,
      input: File,
      outMp3: File,
      kbps: Int,
  ) {
    val wav = File(input.parentFile, "nrm-shine-${System.currentTimeMillis()}.wav")
    try {
      FfmpegExec.runWithPaths(
          paths.binary,
          paths.libDir,
          pcmFfmpegArgs(input) + listOf(wav.absolutePath),
          tag = "ffmpeg-shine-wav",
      )
      ShineExec.run(shineCli, listOf("-q", "-b", kbps.toString(), wav.absolutePath, outMp3.absolutePath))
      if (!outMp3.isFile || outMp3.length() <= 0L) {
        throw Exception("SHINE_OUTPUT_EMPTY")
      }
    } finally {
      wav.delete()
    }
  }
}
