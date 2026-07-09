package com.nullrefer.music.ondevice

import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

/** eSpeak NG CLI 실행 (오프라인) */
object EspeakNgExec {
  fun transliterateLatinSegment(latin: String, paths: EspeakBootstrap.EspeakPaths): String {
    val trimmed = latin.trim()
    if (trimmed.isEmpty()) return latin
    val lib = File(paths.libDir, "libespeak-ng.so")
    val linkerMarker = File(paths.binary.parentFile, "${paths.binary.name}.use-linker")
    val linker =
        if (linkerMarker.isFile) linkerMarker.readText().trim() else "/system/bin/linker64"
    val cmd =
        mutableListOf<String>().apply {
          if (linkerMarker.isFile) add(linker)
          add(paths.binary.absolutePath)
          add("-v")
          add("ko")
          add("-q")
          add("-x")
          add("--stdout")
          add(trimmed)
        }
    val pb = ProcessBuilder(cmd)
    pb.environment()["LD_LIBRARY_PATH"] = paths.libDir.absolutePath
    pb.environment()["ESPEAK_DATA_PATH"] = paths.dataDir.absolutePath
    pb.redirectErrorStream(true)
    val proc = pb.start()
    val finished = proc.waitFor(45, TimeUnit.SECONDS)
    if (!finished) {
      proc.destroyForcibly()
      throw IllegalStateException("espeak_timeout")
    }
    if (proc.exitValue() != 0) {
      throw IllegalStateException("espeak_exit_${proc.exitValue()}")
    }
    val output =
        BufferedReader(InputStreamReader(proc.inputStream, Charsets.UTF_8)).use { it.readText() }
    val phonemeLine = output.lineSequence().firstOrNull { it.isNotBlank() }?.trim().orEmpty()
    if (phonemeLine.isEmpty()) return latin
    return EspeakPhonemeToHangul.convert(phonemeLine).ifBlank { latin }
  }
}
