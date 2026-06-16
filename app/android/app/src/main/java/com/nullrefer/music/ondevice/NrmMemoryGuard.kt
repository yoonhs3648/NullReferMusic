package com.nullrefer.music.ondevice

import android.app.ActivityManager
import android.content.Context
import kotlin.math.max
import kotlin.math.min

/** 대용량 ONNX·Whisper 작업 전 메모리 여유 확보 */
object NrmMemoryGuard {
  /** 세그먼트·trellis를 이어갈 최소 잔여 메모리 */
  const val MIN_WORK_AVAIL_MB = 220L

  /** ONNX 청크 추론 직전 최소 잔여 메모리 */
  private const val MIN_CHUNK_AVAIL_MB = 160L

  /** ONNX 세션 로드 직후 trellis 시작 가능 최소 잔여 */
  private const val POST_SESSION_CTC_MIN_AVAIL_MB = 180L

  /** 세션 로드 전 여유 판단용 (관측 피크 ~500MB) */
  private const val ONNX_SESSION_RESERVE_MB = 480L

  private const val LOW_AVAIL_MB = 2_048

  private const val SAMPLE_RATE = 16_000

  data class CtcInferenceProfile(
      val tier: String,
      val chunkSamples: Int,
      val linesPerSegment: Int,
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
    val reserve = max(onnxReserveMb, ONNX_SESSION_RESERVE_MB / 2)
    return availMemMb(context) >= MIN_WORK_AVAIL_MB + reserve
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
  fun resolveCtcProfile(context: Context): CtcInferenceProfile {
    return profileForAvail(availMemMb(context))
  }

  private fun profileForAvail(avail: Long): CtcInferenceProfile {
    return when {
      avail >= 1_800 ->
          CtcInferenceProfile(tier = "high", chunkSamples = 80_000, linesPerSegment = 6)
      avail >= 1_400 ->
          CtcInferenceProfile(tier = "high_mid", chunkSamples = 64_000, linesPerSegment = 6)
      avail >= 1_100 ->
          CtcInferenceProfile(tier = "mid", chunkSamples = 48_000, linesPerSegment = 4)
      avail >= 850 ->
          CtcInferenceProfile(tier = "mid_low", chunkSamples = 32_000, linesPerSegment = 4)
      avail >= 600 ->
          CtcInferenceProfile(tier = "low", chunkSamples = 16_000, linesPerSegment = 3)
      avail >= 450 ->
          CtcInferenceProfile(tier = "min", chunkSamples = 8_000, linesPerSegment = 2)
      avail >= MIN_WORK_AVAIL_MB ->
          CtcInferenceProfile(tier = "ultra", chunkSamples = 4_000, linesPerSegment = 1)
      else -> CtcInferenceProfile(tier = "blocked", chunkSamples = 4_000, linesPerSegment = 1)
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
        linesPerSegment = min(a.linesPerSegment, b.linesPerSegment),
    )
  }

  fun effectiveChunkSamples(context: Context, baseChunkSamples: Int): Int {
    val avail = availMemMb(context)
    val cap =
        when {
          avail >= 1_200 -> baseChunkSamples
          avail >= 900 -> min(baseChunkSamples, 48_000)
          avail >= 650 -> min(baseChunkSamples, 32_000)
          avail >= 450 -> min(baseChunkSamples, 16_000)
          avail >= MIN_CHUNK_AVAIL_MB -> min(baseChunkSamples, 8_000)
          else -> min(baseChunkSamples, 4_000)
        }
    return max(4_000, cap)
  }

  fun requiresEphemeralOnnxSession(profile: CtcInferenceProfile): Boolean = true

  fun shouldDeferForActiveDownload(context: Context): Boolean {
    val avail = availMemMb(context)
    if (NrmBackgroundWorkCoordinator.hasDownloadTokens() && avail < LOW_AVAIL_MB) {
      return true
    }
    return LibreTranslatePackageDownloader.hasActiveDownload() && avail < LOW_AVAIL_MB
  }

  /** 청크·세그먼트 사이 GC. avail이 낮을수록 대기 시간을 늘린다. */
  fun trimBetweenInferenceSteps(context: Context?, tag: String) {
    val avail = availMemMb(context)
    val sleepMs =
        when {
          avail < MIN_CHUNK_AVAIL_MB -> 120L
          avail < MIN_WORK_AVAIL_MB -> 80L
          avail < 600 -> 60L
          else -> 40L
        }
    try {
      System.runFinalization()
      System.gc()
      Thread.sleep(sleepMs)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    NrmFileLogger.log(tag, "mem_trim_done availMb=${availMemMb(context)}")
  }

  /** 청크 추론 전 메모리가 부족하면 짧게 GC 후 재시도. 실패 시 false. */
  fun waitForChunkMemory(context: Context, tag: String, maxAttempts: Int = 3): Boolean {
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
    if (LibreTranslatePackageDownloader.hasActiveDownload()) {
      NrmFileLogger.warn(
          tag,
          "mem_prepare libretranslate_download_active availMb=$availBefore — 임시 다운로드 정리",
      )
      LibreTranslatePackageDownloader.trimInFlightDownloads(context)
    }
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
