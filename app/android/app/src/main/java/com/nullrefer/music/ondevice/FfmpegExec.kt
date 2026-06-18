package com.nullrefer.music.ondevice



import android.content.Context

import java.io.BufferedReader

import java.io.File

import java.io.InputStreamReader

import java.nio.charset.Charset

import java.util.concurrent.TimeUnit



/** Android FFmpeg 프로세스 — libffmpeg.so LD_LIBRARY_PATH + W^X exec */

object FfmpegExec {

  private data class ProbeCacheKey(

      val binaryPath: String,

      val libDirPath: String,

      val binaryBytes: Long,

      val libBytes: Long,

  )



  private val probeCacheLock = Any()

  @Volatile private var lastSuccessfulProbe: ProbeCacheKey? = null



  fun invalidateProbeCache() {

    synchronized(probeCacheLock) {

      lastSuccessfulProbe = null

    }

  }



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

  ) {

    NrmMediaCpuPriority.runFfmpegPriority {

      runWithPathsUnchecked(binary, libDir, ffmpegArgs, tag)

    }

  }



  /** 이미 [runFfmpegPriority] 안에서 호출할 때 (shineenc 등 연속 오디오 변환) */

  fun runWithPathsUnchecked(

      binary: File,

      libDir: File,

      ffmpegArgs: List<String>,

      tag: String = "ffmpeg",

  ) {

    runWithPathsUncheckedInner(binary, libDir, ffmpegArgs, tag)

  }



  private fun runWithPathsUncheckedInner(

      binary: File,

      libDir: File,

      ffmpegArgs: List<String>,

      tag: String,

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

    p.waitFor()

    val code = p.exitValue()

    logFfmpegProcess(tag, argv, code, out.toString())

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

  ) {

    val paths = resolve(context) ?: throw IllegalStateException("ffmpeg를 사용할 수 없습니다.")

    runWithPaths(paths.binary, paths.libDir, ffmpegArgs, tag)

  }



  fun probePaths(binary: File, libDir: File): Boolean {

    val lib = File(libDir, "libffmpeg.so")

    val key =

        ProbeCacheKey(

            binary.absolutePath,

            libDir.absolutePath,

            binary.length(),

            if (lib.isFile) lib.length() else 0L,

        )

    synchronized(probeCacheLock) {

      if (lastSuccessfulProbe == key) {

        return true

      }

    }

    return try {

      NrmMediaCpuPriority.runFfmpegPriority {

        runWithPathsUncheckedInner(binary, libDir, listOf("-version"), "ffmpeg-probe")

      }

      synchronized(probeCacheLock) {

        lastSuccessfulProbe = key

      }

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

    return NrmMediaCpuPriority.runFfmpegPriority {

      runCaptureInner(binary, libDir, ffmpegArgs, tag, timeoutSec)

    }

  }



  private fun runCaptureInner(

      binary: File,

      libDir: File,

      ffmpegArgs: List<String>,

      tag: String,

      timeoutSec: Long,

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

    logFfmpegProcess(tag, argv, code, out.toString())

    return code to out.toString()

  }



  private fun logFfmpegProcess(tag: String, cmd: List<String>, exitCode: Int, output: String) {

    if (tag == "ffmpeg-probe" && exitCode == 0) {

      NrmFileLogger.log("ffmpeg-probe", "cmd=${cmd.joinToString(" ")} exit=0")

      return

    }

    if (tag == "ffmpeg-encoders" && exitCode == 0) {

      NrmFileLogger.log("ffmpeg-encoders", "cmd=${cmd.joinToString(" ")} exit=0 (output cached)")

      return

    }

    // ffmpeg -i 단독 프로브는 출력 파일 없이 exit=1이 정상 (스트림 정보만 수집)
    if (exitCode == 1 && (tag == "ffmpeg-probe-audio" || tag == "ffmpeg-fa-probe")) {
      if (output.contains("Input #") || output.contains("Stream #")) {
        NrmFileLogger.log(tag, "probe ok exit=1")
        return
      }
    }

    val trimmed =

        when (tag) {

          "ffmpeg-encoders" -> output.take(4000)

          else -> output

        }

    NrmFileLogger.logProcess(tag, cmd, exitCode, trimmed)

  }

}


