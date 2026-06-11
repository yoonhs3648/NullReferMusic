package com.nullrefer.music.ondevice

import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.nio.charset.Charset
import java.util.concurrent.TimeUnit

/** shineenc CLI 실행 (linker64 / W^X 경유). */
object ShineExec {
  @Volatile private var lastProbedPath: String? = null
  @Volatile private var lastProbedBytes: Long = -1L
  @Volatile private var lastProbeOk: Boolean = false

  /** 동일 파일·크기면 subprocess 프로브 생략 (세션 캐시). */
  fun probeIfNeeded(cli: File): Boolean {
    val path = cli.absolutePath
    val bytes = if (cli.isFile) cli.length() else -1L
    if (path == lastProbedPath && bytes == lastProbedBytes && lastProbeOk) {
      return true
    }
    val ok = probe(cli)
    lastProbedPath = path
    lastProbedBytes = bytes
    lastProbeOk = ok
    return ok
  }

  fun probe(cli: File, timeoutSec: Long = 10): Boolean {
    val (code, out) = runCapture(cli, listOf("-h"), "shine-probe", timeoutSec)
    if (code == 0) return true
    val lower = out.lowercase()
    if (lower.contains("usage:") || lower.contains("shineenc")) return true
    NrmFileLogger.warn("shine", "프로브 실패 exit=$code out=${out.take(200)}")
    return false
  }

  fun run(cli: File, args: List<String>, tag: String = "shineenc", timeoutSec: Long = 600) {
    NrmMediaCpuPriority.runFfmpegPriority {
      runUnchecked(cli, args, tag, timeoutSec)
    }
  }

  /** 이미 [NrmMediaCpuPriority.runFfmpegPriority] 안에서 호출할 때 */
  fun runUnchecked(cli: File, args: List<String>, tag: String = "shineenc", timeoutSec: Long = 600) {
    val code = runCaptureInner(cli, args, tag, timeoutSec).first
    if (code != 0) {
      throw Exception("${tag}_exit_$code")
    }
  }

  private fun runCapture(
    cli: File,
    args: List<String>,
    tag: String,
    timeoutSec: Long,
  ): Pair<Int, String> {
    return NrmMediaCpuPriority.runFfmpegPriority {
      runCaptureInner(cli, args, tag, timeoutSec)
    }
  }

  private fun runCaptureInner(
    cli: File,
    args: List<String>,
    tag: String,
    timeoutSec: Long,
  ): Pair<Int, String> {
    NrmExecutableFile.ensureExecMode(cli, NrmExecutableFile.PROBE_HELP)
    val argv = NrmExecutableFile.buildExecArgv(cli, args)
    NrmFileLogger.log(tag, "프로세스 시작: ${argv.joinToString(" ")}")
    val pb = ProcessBuilder(argv)
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
      throw Exception("${tag}_timeout")
    }
    val code = p.exitValue()
    NrmFileLogger.logProcess(tag, argv, code, out.toString())
    return code to out.toString()
  }
}
