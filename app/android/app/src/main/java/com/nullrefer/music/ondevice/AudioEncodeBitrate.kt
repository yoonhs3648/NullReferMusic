package com.nullrefer.music.ondevice

/**
 * 다운로드 비트레이트·VBR 눈금.
 * MP3·M4A(AAC) 공통. Python [nrm_ytdlp_bridge._bitrate_kbps] 와 동기화.
 */
object AudioEncodeBitrate {
  private val KBPS_BY_QUALITY =
      intArrayOf(320, 256, 224, 192, 160, 128, 112, 96, 80, 64)

  /** libmp3lame VBR -q:a (0=최고 … 9=최저) */
  private val LAME_VBR_Q = intArrayOf(0, 2, 3, 4, 5, 6, 7, 8, 8, 9)

  /** ffmpeg aac -q:a (낮을수록 고품질, 1~6 실사용) */
  private val AAC_VBR_Q = intArrayOf(1, 2, 3, 4, 5, 6, 6, 7, 7, 8)

  fun kbpsForQuality(quality: Int): Int {
    val q = quality.coerceIn(0, KBPS_BY_QUALITY.lastIndex)
    return KBPS_BY_QUALITY[q]
  }

  fun ffmpegBitrateArg(quality: Int): String = "${kbpsForQuality(quality)}k"

  /** shineenc 등 CBR 전용 — VBR 모드일 때 티어별 기본 kbps */
  fun cbrKbpsForOptions(options: AudioEncodeOptions): Int {
    if (options.useCbr()) return kbpsForQuality(options.quality)
    return when (options.vbrTier()) {
      2 -> kbpsForQuality(5)
      1 -> kbpsForQuality(3)
      else -> kbpsForQuality(minOf(options.quality, 1))
    }
  }

  fun lameVbrQ(options: AudioEncodeOptions): Int {
    if (options.useCbr()) return LAME_VBR_Q[options.quality.coerceIn(0, 9)]
    return when (options.vbrTier()) {
      2 -> 6
      1 -> 3
      else -> 0
    }
  }

  fun aacVbrQ(options: AudioEncodeOptions): Int {
    if (options.useCbr()) return AAC_VBR_Q[options.quality.coerceIn(0, 9)]
    return when (options.vbrTier()) {
      2 -> 6
      1 -> 4
      else -> 1
    }
  }
}
