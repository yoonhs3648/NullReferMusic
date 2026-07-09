package com.nullrefer.music.ondevice

/**
 * eSpeak NG phoneme 문자열 → 한글 표기(발음) 근사 변환.
 * 출력에 이미 한글이 있으면 그대로 사용한다.
 */
object EspeakPhonemeToHangul {
  private val LATIN_WORD = Regex("""[A-Za-z][A-Za-z0-9'’,.\-]*""")

  fun convert(phonemes: String): String {
    val t = phonemes.replace("|", " ").trim()
    if (t.isEmpty()) return ""
    if (t.any { isHangulSyllable(it) }) {
      return collapseSpaces(t)
    }
    return collapseSpaces(mapAsciiPhonemes(t))
  }

  fun transliterateLineMixed(line: String, paths: EspeakBootstrap.EspeakPaths): String {
    if (!LATIN_WORD.containsMatchIn(line)) return line
    return try {
      EspeakNgExec.transliterateLine(line, paths)
    } catch (e: Exception) {
      NrmFileLogger.warn("espeak", "line_fail line=${line.take(40)} err=${e.message?.take(80)}")
      line
    }
  }

  private fun isHangulSyllable(ch: Char): Boolean {
    val code = ch.code
    return code in 0xAC00..0xD7A3 || code in 0x1100..0x11FF || code in 0x3130..0x318F
  }

  private fun collapseSpaces(s: String): String {
    return s.trim().replace(Regex("""\s+"""), " ")
  }

  /** eSpeak ASCII phoneme → 한글 음절 근사 (영어→한국어 발음 표기) */
  private fun mapAsciiPhonemes(src: String): String {
    val lower = src.lowercase()
    val sb = StringBuilder()
    var i = 0
    while (i < lower.length) {
      val rem = lower.substring(i)
      val chunk =
          when {
            rem.startsWith("tsh") -> "치"
            rem.startsWith("ch") -> "치"
            rem.startsWith("sh") -> "시"
            rem.startsWith("th") -> "스"
            rem.startsWith("ph") -> "프"
            rem.startsWith("ng") -> "응"
            rem.startsWith("oo") -> "우"
            rem.startsWith("ee") -> "이"
            rem.startsWith("ou") -> "아우"
            rem.startsWith("ow") -> "오"
            rem.startsWith("oy") -> "오이"
            rem.startsWith("ay") -> "에이"
            rem.startsWith("ai") -> "아이"
            rem.startsWith("ea") -> "이"
            rem.startsWith("er") -> "어"
            rem.startsWith("or") -> "오"
            rem.startsWith("ar") -> "아"
            rem.startsWith("ir") -> "어"
            rem.startsWith("ur") -> "어"
            rem.startsWith("w3:") || rem.startsWith("w3") -> "워"
            rem.startsWith("3:") -> "어"
            rem.startsWith("@") -> "어"
            rem.startsWith("a:") -> "아"
            rem.startsWith("i:") -> "이"
            rem.startsWith("u:") -> "우"
            rem.startsWith("o:") -> "오"
            rem.startsWith("e:") -> "에"
            rem.startsWith("aI") || rem.startsWith("ai") -> "아이"
            rem.startsWith("aU") || rem.startsWith("au") -> "아우"
            rem.startsWith("OI") || rem.startsWith("oi") -> "오이"
            rem.startsWith("eI") || rem.startsWith("ei") -> "에이"
            rem.startsWith("@U") || rem.startsWith("@u") -> "오"
            rem.startsWith("w") -> "우"
            rem.startsWith("j") -> "이"
            rem.startsWith("r") -> "르"
            rem.startsWith("l") -> "ㄹ"
            rem.startsWith("m") -> "므"
            rem.startsWith("n") -> "느"
            rem.startsWith("k") -> "크"
            rem.startsWith("g") -> "그"
            rem.startsWith("d") -> "드"
            rem.startsWith("t") -> "트"
            rem.startsWith("b") -> "브"
            rem.startsWith("p") -> "프"
            rem.startsWith("f") -> "프"
            rem.startsWith("v") -> "브"
            rem.startsWith("s") -> "스"
            rem.startsWith("z") -> "즈"
            rem.startsWith("h") -> "흐"
            rem.startsWith("a") -> "아"
            rem.startsWith("e") -> "에"
            rem.startsWith("i") -> "이"
            rem.startsWith("o") -> "오"
            rem.startsWith("u") -> "우"
            else -> rem.substring(0, 1)
          }
      sb.append(chunk)
      i +=
          when {
            rem.startsWith("tsh") -> 3
            rem.startsWith("ch") -> 2
            rem.startsWith("sh") -> 2
            rem.startsWith("th") -> 2
            rem.startsWith("ph") -> 2
            rem.startsWith("ng") -> 2
            rem.startsWith("oo") -> 2
            rem.startsWith("ee") -> 2
            rem.startsWith("ou") -> 2
            rem.startsWith("ow") -> 2
            rem.startsWith("oy") -> 2
            rem.startsWith("ay") -> 2
            rem.startsWith("ai") -> 2
            rem.startsWith("ea") -> 2
            rem.startsWith("er") -> 2
            rem.startsWith("or") -> 2
            rem.startsWith("ar") -> 2
            rem.startsWith("ir") -> 2
            rem.startsWith("ur") -> 2
            rem.startsWith("w3:") -> 3
            rem.startsWith("w3") -> 2
            rem.startsWith("3:") -> 2
            rem.startsWith("@") -> 1
            rem.startsWith("a:") -> 2
            rem.startsWith("i:") -> 2
            rem.startsWith("u:") -> 2
            rem.startsWith("o:") -> 2
            rem.startsWith("e:") -> 2
            rem.startsWith("aI") || rem.startsWith("ai") -> 2
            rem.startsWith("aU") || rem.startsWith("au") -> 2
            rem.startsWith("OI") || rem.startsWith("oi") -> 2
            rem.startsWith("eI") || rem.startsWith("ei") -> 2
            rem.startsWith("@U") || rem.startsWith("@u") -> 2
            else -> 1
          }
    }
    return sb.toString()
  }
}
