package com.nullrefer.music.ondevice

/** 완성형 한글(가~힣)을 wav2vec2 KO vocab용 자모 문자열로 분해 */
object HangulJamo {
  private val CHO =
      charArrayOf(
          'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ',
          'ㅌ', 'ㅍ', 'ㅎ',
      )
  private val JUNG =
      charArrayOf(
          'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ',
          'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ',
      )
  private val JONG =
      charArrayOf(
          '\u0000', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ',
          'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
      )

  fun decompose(text: String): String {
    if (text.isEmpty()) return text
    val sb = StringBuilder(text.length * 2)
    for (ch in text) {
      when {
        ch in '\uAC00'..'\uD7A3' -> {
          val code = ch.code - 0xAC00
          val jongIdx = code % 28
          val jungIdx = (code / 28) % 21
          val choIdx = code / 28 / 21
          sb.append(CHO[choIdx])
          sb.append(JUNG[jungIdx])
          if (jongIdx > 0) sb.append(JONG[jongIdx])
        }
        else -> sb.append(ch)
      }
    }
    return sb.toString()
  }
}
