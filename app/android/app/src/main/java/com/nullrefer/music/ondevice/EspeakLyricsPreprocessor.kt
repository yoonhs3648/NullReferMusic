package com.nullrefer.music.ondevice

import android.content.Context

/** 멜론 plain 가사 — eSpeak NG 전처리 (FA 입력용, 엔진 미변경) */
object EspeakLyricsPreprocessor {
  fun transliterateLines(context: Context, lines: List<String>): List<String> {
    val paths = EspeakBootstrap.pathsIfReady(context) ?: EspeakBootstrap.ensure(context)
    if (paths == null) {
      NrmFileLogger.warn("espeak", "skip_preprocess not_installed lines=${lines.size}")
      return lines
    }
    EspeakNgExec.invalidateProbeCache()
    if (!EspeakNgExec.probePaths(paths)) {
      NrmFileLogger.warn("espeak", "skip_preprocess probe_fail lines=${lines.size}")
      return lines
    }
    return lines.map { line ->
      val trimmed = line.trim()
      if (trimmed.isEmpty()) trimmed
      else EspeakPhonemeToHangul.transliterateLineMixed(trimmed, paths)
    }
  }
}
