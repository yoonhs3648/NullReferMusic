package com.nullrefer.music.ondevice

/**
 * eSpeak NG 영어 phoneme(-v en -x) → 한국어 발음 표기.
 *
 * 예: `h@l'oU` → 헬로우, `w'3:ld` → 월드
 * 혼합 줄은 라틴 단어만 치환하고 한글·기호는 유지한다.
 */
object EspeakPhonemeToHangul {
  val LATIN_WORD = Regex("""[A-Za-z][A-Za-z0-9'’,.\-]*""")

  private val LANG_TAG = Regex("""\([A-Za-z]{1,12}\)""")

  private val PHONEME_TOKEN =
      Regex(
          """tS|dZ|aI|aU|OI|oI|eI|@U|oU|e@|i@|u@|""" +
              """i:|u:|o:|a:|A:|O:|e:|E:|3:|@:|""" +
              """T|D|S|Z|N|r|l|w|j|h|m|n|p|b|t|d|k|g|f|v|s|z|""" +
              """i|I|e|E|\{|a|A|O|0|o|U|u|@|3|V|Q""",
      )

  fun convert(phonemes: String): String {
    val cleaned = cleanPhonemeString(phonemes)
    if (cleaned.isEmpty()) return ""
    return cleaned
        .split(Regex("""\s+"""))
        .filter { it.isNotEmpty() }
        .joinToString(" ") { convertWordPhonemes(it) }
        .trim()
  }

  fun transliterateLineMixed(line: String, paths: EspeakBootstrap.EspeakPaths): String {
    if (!LATIN_WORD.containsMatchIn(line)) return line
    return try {
      LATIN_WORD.replace(line) { match ->
        val word = match.value
        if (word.none { it.isLetter() }) word
        else EspeakNgExec.transliterateEnglishWord(word, paths)
      }
    } catch (e: Exception) {
      NrmFileLogger.warn("espeak", "line_fail line=${line.take(40)} err=${e.message?.take(80)}")
      line
    }
  }

  fun cleanPhonemeString(raw: String): String {
    var s = raw.replace('|', ' ')
    s = LANG_TAG.replace(s, " ")
    val sb = StringBuilder(s.length)
    for (ch in s) {
      when (ch) {
        '\'', ',', '_', '=', ';', '#', '*', '"', '.' -> Unit
        else -> sb.append(ch)
      }
    }
    return sb.toString().trim().replace(Regex("""\s+"""), " ")
  }

  fun convertWordPhonemes(phonemes: String): String {
    val tokens = tokenize(cleanPhonemeString(phonemes).replace(" ", ""))
    if (tokens.isEmpty()) return ""
    return assembleHangul(tokens)
  }

  private fun tokenize(src: String): List<String> {
    val out = ArrayList<String>()
    var i = 0
    while (i < src.length) {
      val rem = src.substring(i)
      val m = PHONEME_TOKEN.find(rem)
      if (m != null && m.range.first == 0) {
        out.add(m.value)
        i += m.value.length
      } else {
        i += 1
      }
    }
    return out
  }

  private data class Syl(val onset: Int, val vowels: List<Int>, val coda: Int)

  private fun assembleHangul(tokens: List<String>): String {
    val syls = ArrayList<Syl>()
    var i = 0

    fun peek(n: Int = 0): String? = tokens.getOrNull(i + n)
    fun isGlideVowel(): Boolean {
      val t = peek() ?: return false
      return (t == "w" || t == "j") && peek(1) != null && isVowel(peek(1)!!)
    }

    while (i < tokens.size) {
      // w/j + vowel
      if (isGlideVowel()) {
        val glide = peek()!!
        val v = peek(1)!!
        i += 2
        val vowels = coloredVowel(glide, v)
        var coda = 0
        if (peek() != null && isConsonant(peek()!!) && !isGlideVowel() && !isVowel(peek(1) ?: "")) {
          val c = peek()!!
          if (prefersCoda(c)) {
            coda = jongseong(c) ?: 0
            i += 1
            syls.add(Syl(11, vowels, coda))
            if (peek() != null && isConsonant(peek()!!) && !isVowel(peek(1) ?: "") && !isGlideVowel()) {
              val c2 = peek()!!
              i += 1
              syls.add(Syl(choseong(c2), listOf(18), 0))
            }
            continue
          }
        }
        syls.add(Syl(11, vowels, 0))
        continue
      }

      var onset = 11
      if (peek() != null && isConsonant(peek()!!) && !isGlideVowel()) {
        onset = choseong(peek()!!)
        i += 1
      }

      // 자음군 pl/tr/… → 플/트르 근사: C1+ㅡ+C2종성 후 C2를 다음 초성으로
      if (peek() != null &&
          isConsonant(peek()!!) &&
          !isGlideVowel() &&
          peek(1) != null &&
          isVowel(peek(1)!!) &&
          onset != 11) {
        val c2 = peek()!!
        syls.add(Syl(onset, listOf(18), jongseong(c2) ?: 0))
        continue
      }

      if (peek() == null || !isVowel(peek()!!)) {
        syls.add(Syl(onset, listOf(18), 0))
        continue
      }

      val vTok = peek()!!
      i += 1
      var vowels = expandVowel(vTok)
      if (onset == choseong("h") && (vTok == "@" || vTok == "@:")) {
        vowels = listOf(5) // 헬…
      }

      var coda = 0
      if (peek() != null && isConsonant(peek()!!) && !isGlideVowel()) {
        val c = peek()!!
        if (isVowel(peek(1) ?: "")) {
          // 연음: 헬+로 — 종성 ㄹ을 넣고 다음 루프에서 같은 자음을 초성으로
          if (c == "l" || c == "r" || c == "n" || c == "m") {
            coda = jongseong(c) ?: 0
          }
          // else: 자음은 다음 음절 초성 (consume 안 함)
        } else if (prefersCoda(c)) {
          coda = jongseong(c) ?: 0
          i += 1
          syls.add(Syl(onset, vowels, coda))
          if (peek() != null && isConsonant(peek()!!) && !isVowel(peek(1) ?: "") && !isGlideVowel()) {
            val c2 = peek()!!
            i += 1
            syls.add(Syl(choseong(c2), listOf(18), 0))
          }
          continue
        } else {
          // love 끝 v → 브
          syls.add(Syl(onset, vowels, 0))
          i += 1
          syls.add(Syl(choseong(c), listOf(18), 0))
          continue
        }
      }

      syls.add(Syl(onset, vowels, coda))
    }

    val sb = StringBuilder()
    for (syl in syls) {
      val vs = syl.vowels
      if (vs.isEmpty()) continue
      if (vs.size == 1) {
        sb.append(compose(syl.onset, vs[0], syl.coda))
      } else {
        sb.append(compose(syl.onset, vs[0], 0))
        for (vi in 1 until vs.size) {
          val last = vi == vs.lastIndex
          sb.append(compose(11, vs[vi], if (last) syl.coda else 0))
        }
      }
    }
    return sb.toString()
  }

  private fun prefersCoda(t: String): Boolean =
      t in setOf("l", "r", "n", "m", "N", "g", "k", "d", "t", "b", "p")

  private fun expandVowel(t: String): List<Int> =
      when (t) {
        "oU", "@U" -> listOf(8, 13) // 오우
        "aI" -> listOf(0, 20) // 아이
        "aU" -> listOf(0, 13) // 아우
        "OI", "oI" -> listOf(8, 20) // 오이
        "eI" -> listOf(5, 20) // 에이
        "e@" -> listOf(5, 4)
        "i@" -> listOf(20, 4)
        "u@" -> listOf(13, 4)
        else -> listOf(mapVowel(t))
      }

  private fun coloredVowel(glide: String, v: String): List<Int> {
    if (glide == "w") {
      return when (v) {
        "i", "I", "i:" -> listOf(16) // 위
        "a", "a:", "A", "A:", "{" -> listOf(9) // 와
        "e", "E", "e:" -> listOf(15) // 웨
        "@", "3", "3:", "V", "@:" -> listOf(14) // 워
        else -> listOf(14)
      }
    }
    return when (v) {
      "a", "a:", "A", "{" -> listOf(2)
      "o", "o:", "O", "@U", "oU" -> listOf(12)
      "u", "u:", "U" -> listOf(17)
      "e", "E", "@", "3", "V" -> listOf(6)
      "i", "I", "i:" -> listOf(20)
      else -> listOf(mapVowel(v))
    }
  }

  private fun isVowel(t: String): Boolean =
      t.isNotEmpty() &&
          t in
              setOf(
                  "i",
                  "I",
                  "i:",
                  "e",
                  "E",
                  "e:",
                  "E:",
                  "{",
                  "a",
                  "a:",
                  "A",
                  "A:",
                  "O",
                  "O:",
                  "0",
                  "o",
                  "o:",
                  "U",
                  "u",
                  "u:",
                  "@",
                  "@:",
                  "3",
                  "3:",
                  "V",
                  "Q",
                  "aI",
                  "aU",
                  "OI",
                  "oI",
                  "eI",
                  "@U",
                  "oU",
                  "e@",
                  "i@",
                  "u@",
              )

  private fun isConsonant(t: String): Boolean = t.isNotEmpty() && !isVowel(t)

  private fun mapVowel(t: String): Int =
      when (t) {
        "i", "I", "i:" -> 20
        "e", "E", "e:", "E:" -> 5
        "{" -> 1
        "a", "a:", "A", "A:" -> 0
        "O", "O:", "0", "Q", "o", "o:" -> 8
        "U", "u", "u:" -> 13
        "@", "@:", "3", "3:", "V" -> 4
        else -> 4
      }

  private fun choseong(t: String): Int =
      when (t) {
        "g" -> 0
        "n" -> 2
        "d" -> 3
        "l", "r" -> 5
        "m" -> 6
        "b", "v" -> 7
        "s", "S", "T", "D" -> 9
        "z", "dZ", "Z" -> 12 // 즈/지
        "N", "w", "j" -> 11
        "tS" -> 14
        "k" -> 15
        "t" -> 16
        "p", "f" -> 17
        "h" -> 18
        else -> 11
      }

  private fun jongseong(t: String): Int? =
      when (t) {
        "g", "k" -> 1
        "n" -> 4
        "d", "t" -> 7
        "l", "r" -> 8
        "m" -> 16
        "b", "p" -> 17
        "s", "S", "z", "f", "T", "D" -> 19
        "N" -> 21
        else -> null
      }

  private fun compose(l: Int, v: Int, t: Int): Char {
    return (0xAC00 + (l * 21 + v) * 28 + t).toChar()
  }
}
