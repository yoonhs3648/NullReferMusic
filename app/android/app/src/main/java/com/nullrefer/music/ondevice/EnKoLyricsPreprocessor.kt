package com.nullrefer.music.ondevice

import android.content.Context

/** 멜론 plain 가사 — EN→KO transliterator 전처리 (FA 입력용) */
object EnKoLyricsPreprocessor {
  val LATIN_WORD = Regex("""[A-Za-z][A-Za-z0-9'’,.\-]*""")

  fun transliterateLines(context: Context, lines: List<String>): List<String> {
    val paths =
        EnKoTransliteratorBootstrap.pathsIfReady(context)
            ?: EnKoTransliteratorBootstrap.ensure(context)
    if (paths == null) {
      NrmFileLogger.warn("en-ko-transliterator", "skip_preprocess not_installed lines=${lines.size}")
      return lines
    }
    if (!EnKoTransliteratorInfer.probe(paths)) {
      NrmFileLogger.warn("en-ko-transliterator", "skip_preprocess probe_fail lines=${lines.size}")
      return lines
    }
    var changed = 0
    val out =
        lines.map { line ->
          val trimmed = line.trim()
          if (trimmed.isEmpty()) {
            trimmed
          } else {
            val converted = EnKoTransliteratorInfer.transliterateLineMixed(trimmed, paths)
            if (converted != trimmed) changed += 1
            converted
          }
        }
    NrmFileLogger.log(
        "en-ko-transliterator",
        "preprocess_done lines=${lines.size} changedLines=$changed " +
            "sample=${out.firstOrNull { it.any { ch -> ch.code in 0xAC00..0xD7A3 } }?.take(48) ?: ""}",
    )
    return out
  }
}
