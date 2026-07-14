package com.nullrefer.music.ondevice

import android.app.ActivityManager
import android.content.Context
import kotlin.math.max
import kotlin.math.min

/** 대용량 ONNX·Whisper 작업 전 메모리 여유 확보 */
object NrmMemoryGuard {
  /** 세그먼트·trellis를 이어갈 최소 잔여 메모리 */
  const val MIN_WORK_AVAIL_MB = 200L

  /** wav2vec2-base(ephemeral ONNX) — 잔여 RAM ~300MB에서도 CTC 시도 */
  private const val CTC_BASE_MIN_ATTEMPT_AVAIL_MB = 260L

  /** ONNX 청크 추론 직전 최소 잔여 메모리 (세션 로드 후 avail 급락 대비) */
  private const val MIN_CHUNK_AVAIL_MB = 90L

  /** ONNX 세션 로드 직후 trellis 시작 가능 최소 잔여 */
  private const val POST_SESSION_CTC_MIN_AVAIL_MB = 90L

  /** 세션 로드 전 여유 판단용 (관측 피크 ~500MB) */
  private const val ONNX_SESSION_RESERVE_MB = 480L

  private const val LOW_AVAIL_MB = 2_048

  private const val SAMPLE_RATE = 16_000

  data class CtcInferenceProfile(
      val tier: String,
      val chunkSamples: Int,
  )

  fun availMemMb(context: Context? = null): Long {
    context?.let { ctx ->
      try {
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        if (am != null) {
          val info = ActivityManager.MemoryInfo()
          am.getMemoryInfo(info)
          return info.availMem / (1024 * 1024)
        }
      } catch (_: Exception) {
        // fallback below
      }
    }
    val rt = Runtime.getRuntime()
    return (rt.maxMemory() - rt.totalMemory() + rt.freeMemory()) / (1024 * 1024)
  }

  fun isLowMemory(context: Context? = null): Boolean {
    return availMemMb(context) < LOW_AVAIL_MB
  }

  fun hasMinimumWorkMemory(context: Context): Boolean {
    return availMemMb(context) >= MIN_WORK_AVAIL_MB
  }

  fun canAttemptCtcAlign(context: Context, onnxReserveMb: Long = ONNX_SESSION_RESERVE_MB): Boolean {
    val avail = availMemMb(context)
    // base ONNX(~380MB 파일): mmap+ephemeral 세션 — 대용량 reserve 합산 금지
    if (onnxReserveMb in 1..280L) {
      return avail >= CTC_BASE_MIN_ATTEMPT_AVAIL_MB
    }
    val reserve = max(onnxReserveMb, ONNX_SESSION_RESERVE_MB / 2)
    return avail >= MIN_WORK_AVAIL_MB + reserve
  }

  fun minAvailMbForCtcAttempt(onnxReserveMb: Long = ONNX_SESSION_RESERVE_MB): Long {
    if (onnxReserveMb in 1..280L) return CTC_BASE_MIN_ATTEMPT_AVAIL_MB
    val reserve = max(onnxReserveMb, ONNX_SESSION_RESERVE_MB / 2)
    return MIN_WORK_AVAIL_MB + reserve
  }

  fun canProceedCtcAfterSession(context: Context): Boolean {
    return availMemMb(context) >= POST_SESSION_CTC_MIN_AVAIL_MB
  }

  fun canRunCtcWithoutSession(context: Context): Boolean {
    return availMemMb(context) >= MIN_WORK_AVAIL_MB
  }

  fun canRunOnnxChunk(context: Context): Boolean {
    return availMemMb(context) >= MIN_CHUNK_AVAIL_MB
  }

  /**
   * 잔여 메모리에 따른 CTC 프로파일.
   * ONNX 세션 로드 후 avail이 급락할 수 있어 시작 시점보다 보수적으로 잡는다.
   */
  fun resolveCtcProfile(context: Context, quality: String = "standard"): CtcInferenceProfile {
    val base = profileForAvail(availMemMb(context))
    return boostProfileForQuality(base, quality)
  }

  private fun boostProfileForQuality(base: CtcInferenceProfile, quality: String): CtcInferenceProfile {
    return when (quality) {
      "accurate" ->
          when (base.tier) {
            // ~4s @16kHz — 5초+ chunk는 GC/취소 포인트가 늦어 kill 리스크↑
            "high" -> base.copy(chunkSamples = 64_000)
            "high_mid" -> base.copy(chunkSamples = 56_000)
            "mid" -> base.copy(chunkSamples = 48_000)
            "mid_low" -> base.copy(chunkSamples = 40_000)
            "low" -> base.copy(chunkSamples = 32_000)
            "min" -> base.copy(chunkSamples = 16_000)
            "ultra" -> base.copy(chunkSamples = 8_000)
            "ultra_low" -> base.copy(chunkSamples = 4_000)
            else -> base
          }
      "fast" ->
          CtcInferenceProfile(
              tier = base.tier,
              chunkSamples = min(base.chunkSamples, 32_000),
          )
      else -> base
    }
  }

  private fun profileForAvail(avail: Long): CtcInferenceProfile {
    return when {
      avail >= 1_800 ->
          CtcInferenceProfile(tier = "high", chunkSamples = 64_000)
      avail >= 1_600 ->
          CtcInferenceProfile(tier = "high_mid", chunkSamples = 56_000)
      avail >= 1_400 ->
          CtcInferenceProfile(tier = "high_mid", chunkSamples = 48_000)
      avail >= 1_100 ->
          CtcInferenceProfile(tier = "mid", chunkSamples = 48_000)
      avail >= 850 ->
          CtcInferenceProfile(tier = "mid_low", chunkSamples = 32_000)
      avail >= 600 ->
          CtcInferenceProfile(tier = "low", chunkSamples = 16_000)
      avail >= 450 ->
          CtcInferenceProfile(tier = "min", chunkSamples = 8_000)
      avail >= 360 ->
          CtcInferenceProfile(tier = "ultra", chunkSamples = 4_000)
      avail >= CTC_BASE_MIN_ATTEMPT_AVAIL_MB ->
          CtcInferenceProfile(tier = "ultra_low", chunkSamples = 2_000)
      else -> CtcInferenceProfile(tier = "blocked", chunkSamples = 2_000)
    }
  }

  /** 세그먼트·청크 루프 안에서 실시간 avail로 프로파일을 다시 계산한다. */
  fun resolveLiveCtcProfile(context: Context, fallback: CtcInferenceProfile): CtcInferenceProfile {
    val live = profileForAvail(availMemMb(context))
    if (live.tier == "blocked") return fallback
    return conservativeMerge(fallback, live)
  }

  private fun conservativeMerge(
      a: CtcInferenceProfile,
      b: CtcInferenceProfile,
  ): CtcInferenceProfile {
    return CtcInferenceProfile(
        tier = b.tier,
        chunkSamples = min(a.chunkSamples, b.chunkSamples),
    )
  }

  fun effectiveChunkSamples(context: Context, baseChunkSamples: Int): Int {
    val avail = availMemMb(context)
    val floor =
        when {
          avail < CTC_BASE_MIN_ATTEMPT_AVAIL_MB -> 1_600
          avail < 360 -> 2_000
          else -> 4_000
        }
    val cap =
        when {
          avail >= 1_200 -> baseChunkSamples
          avail >= 900 -> min(baseChunkSamples, 48_000)
          avail >= 650 -> min(baseChunkSamples, 32_000)
          avail >= 450 -> min(baseChunkSamples, 16_000)
          avail >= 360 -> min(baseChunkSamples, 8_000)
          avail >= CTC_BASE_MIN_ATTEMPT_AVAIL_MB -> min(baseChunkSamples, 4_000)
          avail >= MIN_CHUNK_AVAIL_MB -> min(baseChunkSamples, 2_000)
          else -> min(baseChunkSamples, 1_600)
        }
    val scaled = (max(floor, cap) * NrmThermalGuard.chunkSampleScale(context)).toInt()
    return max(floor, scaled)
  }

  /** wav2vec2 ONNX — 앱 수명 재사용 (곡마다 ephemeral create 아님). 해제는 MainApplication trim/lowMem. */
  fun requiresEphemeralOnnxSession(profile: CtcInferenceProfile): Boolean = false

  fun shouldDeferForActiveDownload(context: Context): Boolean {
    val avail = availMemMb(context)
    // 큐에만 있고 추출이 시작되지 않은 dl 토큰은 FA를 막지 않는다
    return NrmBackgroundWorkCoordinator.hasActiveAudioExtractJobs() && avail < LOW_AVAIL_MB
  }

  /** 청크·세그먼트 사이 GC. 여유 RAM이 충분하면 sleep·로그를 최소화한다. */
  fun trimBetweenInferenceSteps(context: Context?, tag: String, force: Boolean = false) {
    val avail = availMemMb(context)
    if (!force && avail >= 1_400) {
      return
    }
    val sleepMs =
        when {
          avail >= 900 -> 8L
          avail < MIN_CHUNK_AVAIL_MB -> 120L
          avail < MIN_WORK_AVAIL_MB -> 80L
          avail < 600 -> 60L
          else -> 24L
        }
    try {
      if (avail < 900 || force) {
        System.runFinalization()
        System.gc()
      }
      if (sleepMs > 0) {
        Thread.sleep(sleepMs)
      }
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    if (avail < 900 || force) {
      NrmFileLogger.log(tag, "mem_trim_done availMb=${availMemMb(context)}")
    }
  }

  /** 청크 추론 전 메모리가 부족하면 짧게 GC 후 재시도. 실패 시 false. */
  fun waitForChunkMemory(context: Context, tag: String, maxAttempts: Int = 5): Boolean {
    repeat(maxAttempts) { attempt ->
      if (canRunOnnxChunk(context)) return true
      NrmFileLogger.warn(
          tag,
          "ctc_chunk_wait attempt=${attempt + 1} availMb=${availMemMb(context)}",
      )
      trimBetweenInferenceSteps(context, tag)
    }
    return canRunOnnxChunk(context)
  }

  fun prepareForHeavyInference(context: Context, tag: String) {
    val availBefore = availMemMb(context)
    NrmFileLogger.log(tag, "mem_prepare availMb=$availBefore low=${availBefore < LOW_AVAIL_MB}")
    if (shouldDeferForActiveDownload(context)) {
      NrmFileLogger.warn(tag, "mem_prepare active_download_defer availMb=$availBefore")
    }
    try {
      System.runFinalization()
      System.gc()
      Thread.sleep(if (availBefore < LOW_AVAIL_MB) 220 else 140)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    NrmFileLogger.log(tag, "mem_prepare_done availMb=${availMemMb(context)}")
  }

  fun chunkDurationMs(chunkSamples: Int): Long {
    return (chunkSamples.toLong() * 1000L) / SAMPLE_RATE
  }
}

