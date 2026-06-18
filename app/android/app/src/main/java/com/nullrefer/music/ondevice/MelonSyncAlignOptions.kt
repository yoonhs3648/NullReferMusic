package com.nullrefer.music.ondevice

import com.facebook.react.bridge.ReadableMap

enum class MelonSyncVocabKind {
  KO,
  EN,
}

data class MelonSyncAlignOptions(
    val quality: String = QUALITY_ACCURATE,
    val firstLineIntroCorrection: Boolean = true,
    val vocalRangeAutoDetect: Boolean = true,
    val lyricsLang: String = "ko",
) {
  val isAccurate: Boolean
    get() = quality == QUALITY_ACCURATE

  val isFast: Boolean
    get() = quality == QUALITY_FAST

  fun vocabKind(): MelonSyncVocabKind =
      if (lyricsLang.trim().lowercase() == "en") MelonSyncVocabKind.EN else MelonSyncVocabKind.KO

  fun trellisPlanMargin(): Double =
      when (quality) {
        QUALITY_FAST -> 0.85
        QUALITY_STANDARD -> 0.92
        else -> 0.98
      }

  fun chunkOverlapSamples(): Int =
      when (quality) {
        QUALITY_FAST -> 0
        QUALITY_STANDARD -> 1_200
        else -> 4_000
      }

  fun minIntroMs(): Int = if (firstLineIntroCorrection) 800 else 0

  fun onsetProbeThreshold(): Float = if (isAccurate) 2.8f else 3.2f

  companion object {
    const val QUALITY_ACCURATE = "accurate"
    const val QUALITY_STANDARD = "standard"
    const val QUALITY_FAST = "fast"

    fun fromReadable(map: ReadableMap?): MelonSyncAlignOptions {
      if (map == null) return MelonSyncAlignOptions()
      val quality =
          when (map.getString("quality")?.trim()?.lowercase()) {
            QUALITY_FAST -> QUALITY_FAST
            QUALITY_STANDARD -> QUALITY_STANDARD
            else -> QUALITY_ACCURATE
          }
      val intro =
          if (map.hasKey("firstLineIntroCorrection") && !map.isNull("firstLineIntroCorrection")) {
            map.getBoolean("firstLineIntroCorrection")
          } else {
            true
          }
      val vocal =
          if (map.hasKey("vocalRangeAutoDetect") && !map.isNull("vocalRangeAutoDetect")) {
            map.getBoolean("vocalRangeAutoDetect")
          } else {
            true
          }
      val lang = map.getString("lyricsLang")?.trim()?.lowercase()?.takeIf { it == "en" || it == "ko" } ?: "ko"
      return MelonSyncAlignOptions(
          quality = quality,
          firstLineIntroCorrection = intro,
          vocalRangeAutoDetect = vocal,
          lyricsLang = lang,
      )
    }
  }
}
