package com.nullrefer.music.ondevice

import android.content.Context
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.nio.charset.Charset
import java.util.concurrent.TimeUnit

/** Android FFmpeg 프로세스 — libffmpeg.so LD_LIBRARY_PATH + W^X exec */
object FfmpegExec {
  fun applyLibEnv(pb: ProcessBuilder, libDir: String) {
    if (libDir.isBlank()) return
    val env = pb.environment()
    val prev = env["LD_LIBRARY_PATH"]?.trim().orEmpty()
    env["LD_LIBRARY_PATH"] = if (prev.isBlank()) libDir else "$libDir:$prev"
  }

  fun resolve(context: Context): FfmpegBootstrap.FfmpegPaths? = FfmpegBootstrap.pathsIfReady(context)

  fun runWithPaths(
    binary: File,
    libDir: File,
    ffmpegArgs: List<String>,
    tag: String = "ffmpeg",
    timeoutSec: Long = 180,
  ) {
    val argv = NrmExecutableFile.buildExecArgv(binary, ffmpegArgs)
    NrmFileLogger.log(tag, "프로세스 시작: ${argv.joinToString(" ")}")
    val pb = ProcessBuilder(argv)
    applyLibEnv(pb, libDir.absolutePath)
    pb.redirectErrorStream(true)
    val p = pb.start()
    val out = StringBuilder()
    BufferedReader(InputStreamReader(p.inputStream, Charset.defaultCharset())).use { r ->
      var line: String?
      while (r.readLine().also { line = it } != null) {
        out.append(line).append('\n')
      }
    }
    val finished = p.waitFor(timeoutSec, TimeUnit.SECONDS)
    if (!finished) {
      p.destroyForcibly()
      throw Exception("ffmpeg_timeout")
    }
    val code = p.exitValue()
    NrmFileLogger.logProcess(tag, argv, code, out.toString())
    if (code != 0) {
      throw Exception("ffmpeg_exit_$code")
    }
  }

  fun buildProcess(context: Context, ffmpegArgs: List<String>): ProcessBuilder {
    val paths =
      resolve(context)
        ?: throw IllegalStateException("ffmpeg를 사용할 수 없습니다.")
    val argv = NrmExecutableFile.buildExecArgv(paths.binary, ffmpegArgs)
    val pb = ProcessBuilder(argv)
    applyLibEnv(pb, paths.libDir.absolutePath)
    pb.redirectErrorStream(true)
    return pb
  }

  fun run(
    context: Context,
    ffmpegArgs: List<String>,
    tag: String = "ffmpeg",
    timeoutSec: Long = 180,
  ) {
    val paths = resolve(context) ?: throw IllegalStateException("ffmpeg를 사용할 수 없습니다.")
    runWithPaths(paths.binary, paths.libDir, ffmpegArgs, tag, timeoutSec)
  }

  fun probePaths(binary: File, libDir: File): Boolean {
    return try {
      runWithPaths(binary, libDir, listOf("-version"), tag = "ffmpeg-probe", timeoutSec = 15)
      true
    } catch (e: Exception) {
      NrmFileLogger.warn("ffmpeg", "exec 프로브 실패 path=${binary.absolutePath} err=${e.message}")
      false
    }
  }

  fun probe(context: Context): Boolean {
    val paths = resolve(context) ?: return false
    return probePaths(paths.binary, paths.libDir)
  }

  /** stdout/stderr 합친 출력과 exit code 반환 (probe·encoders 목록용) */
  fun runCapture(
    binary: File,
    libDir: File,
    ffmpegArgs: List<String>,
    tag: String = "ffmpeg",
    timeoutSec: Long = 60,
  ): Pair<Int, String> {
    val argv = NrmExecutableFile.buildExecArgv(binary, ffmpegArgs)
    val pb = ProcessBuilder(argv)
    applyLibEnv(pb, libDir.absolutePath)
    pb.redirectErrorStream(true)
    val p = pb.start()
    val out = StringBuilder()
    BufferedReader(InputStreamReader(p.inputStream, Charset.defaultCharset())).use { r ->
      var line: String?
      while (r.readLine().also { line = it } != null) {
        out.append(line).append('\n')
      }
    }
    val finished = p.waitFor(timeoutSec, TimeUnit.SECONDS)
    if (!finished) {
      p.destroyForcibly()
      return -1 to "timeout"
    }
    val code = p.exitValue()
    NrmFileLogger.logProcess(tag, argv, code, out.toString().take(4000))
    return code to out.toString()
  }
}
