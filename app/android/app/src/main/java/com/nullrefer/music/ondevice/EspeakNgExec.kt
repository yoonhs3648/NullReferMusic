package com.nullrefer.music.ondevice

import android.os.Build
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

/** eSpeak NG CLI 실행 (오프라인 FA 전처리) */
object EspeakNgExec {
  private val PROBE_ARGS = listOf("-v", "ko", "-q", "-x", "--stdout", "test")

  private data class ProbeCacheKey(
      val binaryPath: String,
      val libDirPath: String,
      val dataDirPath: String,
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

  /**
   * lib 권한 + 직접/linker 실행 프로브(실제 transliteration)로 .use-linker 마커 결정.
   * 검증 없이 W^X fallback 마커를 쓰지 않는다.
   */
  fun ensureExecReady(paths: EspeakBootstrap.EspeakPaths) {
    EspeakBootstrap.prepareRuntimeArtifacts(paths)
    NrmExecutableFile.clearLinkerMarker(paths.binary)

    if (probeArgv(paths, listOf(paths.binary.absolutePath) + PROBE_ARGS)) {
      NrmExecutableFile.clearLinkerMarker(paths.binary)
      return
    }

    val linker = defaultLinkerPath()
    if (linker.isNotEmpty()) {
      if (probeArgv(paths, listOf(linker, paths.binary.absolutePath) + PROBE_ARGS)) {
        NrmExecutableFile.writeLinkerMarker(paths.binary, linker)
        NrmFileLogger.log("espeak", "linker exec OK linker=$linker")
        return
      }
    }

    NrmFileLogger.warn("espeak", "ensureExecReady 실패 path=${paths.binary.absolutePath}")
  }

  fun probePaths(paths: EspeakBootstrap.EspeakPaths): Boolean {
    val lib = paths.libFile()
    val key =
        ProbeCacheKey(
            paths.binary.absolutePath,
            paths.libDir.absolutePath,
            paths.dataDir.absolutePath,
            paths.binary.length(),
            if (lib.isFile) lib.length() else 0L,
        )
    synchronized(probeCacheLock) {
      if (lastSuccessfulProbe == key) {
        return true
      }
    }
    return try {
      ensureExecReady(paths)
      if (!probeArgv(paths, NrmExecutableFile.buildExecArgv(paths.binary, PROBE_ARGS))) {
        NrmFileLogger.warn("espeak", "exec 프로브 실패 path=${paths.binary.absolutePath}")
        return false
      }
      synchronized(probeCacheLock) {
        lastSuccessfulProbe = key
      }
      NrmFileLogger.log(
          "espeak",
          "probe_ok bin=${paths.binary.name} libDir=${paths.libDir.name} " +
              "data=${paths.dataDir.name}",
      )
      true
    } catch (e: Exception) {
      NrmFileLogger.warn(
          "espeak",
          "exec 프로브 실패 path=${paths.binary.absolutePath} err=${e.message}",
      )
      false
    }
  }

  /** 줄 단위 1회 — 라틴 포함 가사 줄 전체를 eSpeak에 넘긴다 */
  fun transliterateLine(line: String, paths: EspeakBootstrap.EspeakPaths): String {
    val trimmed = line.trim()
    if (trimmed.isEmpty()) return line
    EspeakBootstrap.prepareRuntimeArtifacts(paths)
    val (code, output) =
        runCapture(
            paths,
            listOf("-v", "ko", "-q", "-x", "--stdout", trimmed),
            timeoutSec = 45,
        )
    if (code != 0) {
      val errTail = output.trim().take(120)
      throw IllegalStateException(
          if (errTail.isNotEmpty()) "espeak_exit_${code}:$errTail"
          else "espeak_exit_$code",
      )
    }
    val phonemeLine = output.lineSequence().firstOrNull { it.isNotBlank() }?.trim().orEmpty()
    if (phonemeLine.isEmpty()) return line
    return EspeakPhonemeToHangul.convert(phonemeLine).ifBlank { line }
  }

  private fun probeArgv(paths: EspeakBootstrap.EspeakPaths, argv: List<String>): Boolean {
    return try {
      val (code, out) = runCaptureArgv(paths, argv, timeoutSec = 15)
      val ok = code == 0 && out.lineSequence().any { it.isNotBlank() }
      if (!ok) {
        NrmFileLogger.warn(
            "espeak",
            "probe_fail code=$code argvTail=${argv.takeLast(3).joinToString(" ")} " +
                "out=${out.trim().take(200)}",
        )
      }
      ok
    } catch (e: Exception) {
      NrmFileLogger.warn("espeak", "probe_fail err=${e.message?.take(200)}")
      false
    }
  }

  private fun runCapture(
      paths: EspeakBootstrap.EspeakPaths,
      args: List<String>,
      timeoutSec: Long,
  ): Pair<Int, String> {
    val argv = NrmExecutableFile.buildExecArgv(paths.binary, args)
    return runCaptureArgv(paths, argv, timeoutSec)
  }

  private fun runCaptureArgv(
      paths: EspeakBootstrap.EspeakPaths,
      argv: List<String>,
      timeoutSec: Long,
  ): Pair<Int, String> {
    val pb = ProcessBuilder(argv)
    applyEspeakEnv(pb, paths)
    pb.redirectErrorStream(true)
    val proc = pb.start()
    val finished = proc.waitFor(timeoutSec, TimeUnit.SECONDS)
    if (!finished) {
      proc.destroyForcibly()
      throw IllegalStateException("espeak_timeout")
    }
    val output =
        BufferedReader(InputStreamReader(proc.inputStream, Charsets.UTF_8)).use { it.readText() }
    return proc.exitValue() to output
  }

  private fun applyEspeakEnv(pb: ProcessBuilder, paths: EspeakBootstrap.EspeakPaths) {
    val env = pb.environment()
    val libDirs = linkedSetOf<String>()
    libDirs.add(paths.libDir.absolutePath)
    paths.binary.parentFile?.absolutePath?.let { libDirs.add(it) }
    val prev = env["LD_LIBRARY_PATH"]?.trim().orEmpty()
    val merged =
        (libDirs + prev.split(':'))
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinct()
            .joinToString(":")
    env["LD_LIBRARY_PATH"] = merged
    env["ESPEAK_DATA_PATH"] = paths.dataDir.absolutePath
  }

  private fun defaultLinkerPath(): String {
    val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
    return if (abi.startsWith("arm64") || abi == "x86_64") {
      "/system/bin/linker64"
    } else {
      "/system/bin/linker"
    }
  }
}
