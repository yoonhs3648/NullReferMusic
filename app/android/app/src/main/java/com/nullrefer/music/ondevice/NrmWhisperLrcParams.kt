package com.nullrefer.music.ondevice

/**
 * Whisper LRC 전사 인자 (품질 우선, 큐 백로그 시만 속도로 다운시프트).
 * JS/백엔드 카탈로그·README와 의미를 맞출 것.
 */
object NrmWhisperLrcParams {
  /** 안정 우선: 1.6.1 동작값으로 복귀 */
  const val NO_SPEECH_THRESHOLD = "0.45"

  /** decoder fail 완화 — 노래·랩 구간 유지 */
  const val LOGPROB_THRESHOLD = "-1.25"

  const val ENTROPY_THRESHOLD = "3.00"

  const val TEMPERATURE = "0"

  data class Beam(val size: Int, val bestOf: Int)

  fun resolveBeam(queueDepthAtStart: Int): Beam {
    val backlog = (queueDepthAtStart - 1).coerceAtLeast(0)
    return when {
      backlog >= 1 -> Beam(1, 1)
      else -> Beam(1, 1)
    }
  }

  /** whisper-cli 인자 꼬리 (경로·스레드·빔 제외) */
  fun qualityTailArgs(beam: Beam): List<String> =
      listOf(
          "--output-lrc",
          "-bs",
          beam.size.toString(),
          "-bo",
          beam.bestOf.toString(),
          "-nth",
          NO_SPEECH_THRESHOLD,
          "-lpt",
          LOGPROB_THRESHOLD,
          "-et",
          ENTROPY_THRESHOLD,
          "-tp",
          TEMPERATURE,
      )
}
