package com.nullrefer.music.ondevice

/**
 * 다운로드 설정 — VBR·무손실 모드.
 * JS [nrmDownloadSettings.ts] / Python [nrm_ytdlp_bridge] 와 id 동기화.
 */
data class AudioEncodeOptions(
    val quality: Int = 0,
    val vbrMode: String = "vbr_best",
    val losslessMode: String = "smart",
) {
  fun useCbr(): Boolean = vbrMode == "cbr"

  fun vbrTier(): Int =
      when (vbrMode) {
        "vbr_compact" -> 2
        "vbr_balanced" -> 1
        "cbr" -> -1
        else -> 0
      }

  fun alwaysReencode(): Boolean = losslessMode == "always_reencode"

  fun preferLosslessPath(): Boolean = losslessMode == "lossless_path"

  fun preferSmartCopy(): Boolean =
      losslessMode == "smart" || losslessMode == "lossless_path"
}
