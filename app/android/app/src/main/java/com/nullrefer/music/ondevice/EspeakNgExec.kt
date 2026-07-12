package com.nullrefer.music.ondevice

import android.os.Build
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** eSpeak NG CLI 실행 (영어 G2P → 한국어 발음 전처리) */
object EspeakNgExec {
  private val EN_VOICES = listOf("en", "en-us", "en-gb")

  private data class ProbeCacheKey(
      val binaryPath: String,
      val libDirPath: String,
      val dataDirPath: String,
      val binaryBytes: Long,
      val libBytes: Long,
  )

  private val probeCacheLock = Any()
  @Volatile private var lastSuccessfulProbe: ProbeCacheKey? = null
  @Volatile private var resolvedEnVoice: String = "en"

  /** 단어 → 한글 캐시 (가사 반복 단어 대비) */
  private val wordHangulCache = ConcurrentHashMap<String, String>()

  fun invalidateProbeCache() {
    synchronized(probeCacheLock) {
      lastSuccessfulProbe = null
    }
    wordHangulCache.clear()
  }

  /**
   * lib 권한 + 직접/linker 실행 프로브로 .use-linker 마커 결정.
   * 검증 없이 W^X fallback 마커를 쓰지 않는다.
   */
  fun ensureExecReady(paths: EspeakBootstrap.EspeakPaths) {
    EspeakBootstrap.prepareRuntimeArtifacts(paths)
    NrmExecutableFile.clearLinkerMarker(paths.binary)

    val probeArgs = probeArgsForVoice(resolvedEnVoice)
    if (probeArgv(paths, listOf(paths.binary.absolutePath) + probeArgs)) {
      NrmExecutableFile.clearLinkerMarker(paths.binary)
      return
    }

    val linker = defaultLinkerPath()
    if (linker.isNotEmpty()) {
      if (probeArgv(paths, listOf(linker, paths.binary.absolutePath) + probeArgs)) {
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
      val voice = resolveEnglishVoice(paths) ?: run {
        NrmFileLogger.warn("espeak", "exec 프로브 실패 — 영어 보이스 없음")
        return false
      }
      resolvedEnVoice = voice
      ensureExecReady(paths)
      if (!probeArgv(paths, NrmExecutableFile.buildExecArgv(paths.binary, probeArgsForVoice(voice)))) {
        NrmFileLogger.warn("espeak", "exec 프로브 실패 path=${paths.binary.absolutePath}")
        return false
      }
      synchronized(probeCacheLock) {
        lastSuccessfulProbe = key
      }
      NrmFileLogger.log(
          "espeak",
          "probe_ok bin=${paths.binary.name} libDir=${paths.libDir.name} " +
              "data=${paths.dataDir.name} voice=$voice",
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

  /** 영어 단어 1개 → 한국어 발음 표기 */
  fun transliterateEnglishWord(word: String, paths: EspeakBootstrap.EspeakPaths): String {
    val trimmed = word.trim()
    if (trimmed.isEmpty()) return word
    val cacheKey = trimmed.lowercase()
    wordHangulCache[cacheKey]?.let { return restoreCapsHint(trimmed, it) }

    EspeakBootstrap.prepareRuntimeArtifacts(paths)
    val voice = resolvedEnVoice
    val (code, output) =
        runCapture(
            paths,
            listOf("-v", voice, "-q", "-x", "--stdout", trimmed),
            timeoutSec = 30,
        )
    if (code != 0) {
      val errTail = output.trim().take(120)
      throw IllegalStateException(
          if (errTail.isNotEmpty()) "espeak_exit_${code}:$errTail"
          else "espeak_exit_$code",
      )
    }
    val phonemeLine = output.lineSequence().firstOrNull { it.isNotBlank() }?.trim().orEmpty()
    if (phonemeLine.isEmpty()) return word
    val hangul = EspeakPhonemeToHangul.convert(phonemeLine).ifBlank { word }
    wordHangulCache[cacheKey] = hangul
    return hangul
  }

  /** @deprecated 혼합 줄은 [EspeakPhonemeToHangul.transliterateLineMixed] 사용 */
  fun transliterateLine(line: String, paths: EspeakBootstrap.EspeakPaths): String {
    return EspeakPhonemeToHangul.transliterateLineMixed(line, paths)
  }

  private fun probeArgsForVoice(voice: String): List<String> =
      listOf("-v", voice, "-q", "-x", "--stdout", "hello")

  private fun resolveEnglishVoice(paths: EspeakBootstrap.EspeakPaths): String? {
    EspeakBootstrap.prepareRuntimeArtifacts(paths)
    for (voice in EN_VOICES) {
      val args = probeArgsForVoice(voice)
      val direct = listOf(paths.binary.absolutePath) + args
      if (probeArgv(paths, direct)) {
        // 결과가 영어 phoneme 스러운지(한글 음절 없이 ASCII) 확인
        val (code, out) = runCaptureArgv(paths, NrmExecutableFile.buildExecArgv(paths.binary, args), 15)
        if (code == 0) {
          val line = out.lineSequence().firstOrNull { it.isNotBlank() }?.trim().orEmpty()
          if (line.isNotEmpty() && line.none { isHangulSyllable(it) }) {
            NrmFileLogger.log("espeak", "en_voice_ok voice=$voice sample=${line.take(40)}")
            return voice
          }
        }
      }
      val linker = defaultLinkerPath()
      if (linker.isNotEmpty()) {
        if (probeArgv(paths, listOf(linker, paths.binary.absolutePath) + args)) {
          NrmExecutableFile.writeLinkerMarker(paths.binary, linker)
          val (code, out) =
              runCaptureArgv(
                  paths,
                  listOf(linker, paths.binary.absolutePath) + args,
                  15,
              )
          if (code == 0) {
            val line = out.lineSequence().firstOrNull { it.isNotBlank() }?.trim().orEmpty()
            if (line.isNotEmpty() && line.none { isHangulSyllable(it) }) {
              NrmFileLogger.log("espeak", "en_voice_ok voice=$voice sample=${line.take(40)}")
              return voice
            }
          }
        }
      }
    }
    return null
  }

  private fun isHangulSyllable(ch: Char): Boolean {
    val code = ch.code
    return code in 0xAC00..0xD7A3
  }

  private fun restoreCapsHint(original: String, hangul: String): String = hangul

  private fun probeArgv(paths: EspeakBootstrap.EspeakPaths, argv: List<String>): Boolean {
    return try {
      val (code, out) = runCaptureArgv(paths, argv, timeoutSec = 15)
      val ok = code == 0 && out.lineSequence().any { it.isNotBlank() }
      if (!ok) {
        val trimmed = out.trim()
        if (trimmed.contains("cannot locate symbol", ignoreCase = true) ||
            trimmed.contains("CANNOT LINK EXECUTABLE", ignoreCase = true)) {
          NrmFileLogger.warn(
              "espeak",
              "probe_fail linker_symbol_mismatch code=$code " +
                  "hint=CLI/lib must be same NDK build (not APK libttsespeak) " +
                  "out=${trimmed.take(220)}",
          )
        } else {
          NrmFileLogger.warn(
              "espeak",
              "probe_fail code=$code argvTail=${argv.takeLast(3).joinToString(" ")} " +
                  "out=${trimmed.take(200)}",
          )
        }
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
