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
    var latinWords = 0
    val out =
        lines.map { line ->
          val trimmed = line.trim()
          if (trimmed.isEmpty()) {
            trimmed
          } else {
            val converted = EspeakPhonemeToHangul.transliterateLineMixed(trimmed, paths)
            if (converted != trimmed) latinWords += 1
            converted
          }
        }
    NrmFileLogger.log(
        "espeak",
        "preprocess_done lines=${lines.size} changedLines=$latinWords " +
            "sample=${out.firstOrNull { it.any { ch -> ch.code in 0xAC00..0xD7A3 } }?.take(48) ?: ""}",
    )
    return out
  }
}
