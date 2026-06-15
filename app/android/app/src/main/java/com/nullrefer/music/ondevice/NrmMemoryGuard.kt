package com.nullrefer.music.ondevice

import android.app.ActivityManager
import android.content.Context

/** 대용량 ONNX·Whisper 작업 전 메모리 여유 확보 */
object NrmMemoryGuard {
  /** 정렬 작업을 이어가기 위한 최소 잔여 메모리 */
  const val MIN_WORK_AVAIL_MB = 300L

  /** wav2vec2 ONNX 세션 로드 시 관측된 대략적 RAM 점유 (로그 기준 ~700MB) */
  private const val ONNX_SESSION_RESERVE_MB = 700L

  private const val LOW_AVAIL_MB = 2_048

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

  /** ONNX 추론·trellis를 이어갈 최소 잔여 메모리(300MB) 확보 여부 */
  fun hasMinimumWorkMemory(context: Context): Boolean {
    return availMemMb(context) >= MIN_WORK_AVAIL_MB
  }

  /**
   * ONNX 세션 로드 전 시도 가능 여부.
   * 세션 점유(~700MB) + 작업 최소(300MB)를 합산해 크래시 대신 graceful fail.
   */
  fun canAttemptCtcAlign(context: Context): Boolean {
    return availMemMb(context) >= MIN_WORK_AVAIL_MB + ONNX_SESSION_RESERVE_MB
  }

  /**
   * 잔여 메모리에 따른 CTC 프로파일 (250MB 단위, ONNX 세션 로드 후 avail 기준).
   *
   * | availMb   | tier     | 줄/세그먼트 | 청크(16kHz) | 34줄 시 세그먼트 수 |
   * |-----------|----------|------------|-------------|---------------------|
   * | ≥ 1500    | high     | 8          | 10초        | 5                   |
   * | ≥ 1250    | high_mid | 8          | 5초         | 5                   |
   * | ≥ 1000    | mid      | 6          | 5초         | 6                   |
   * | ≥ 750     | mid_low  | 6          | 3초         | 6                   |
   * | ≥ 500     | low      | 4          | 1초         | 9                   |
   * | ≥ 300     | min      | 2          | 0.5초       | 17                  |
   * | < 300     | blocked  | —          | —           | 중단                |
   */
  fun resolveCtcProfile(context: Context): CtcInferenceProfile {
    val avail = availMemMb(context)
    return when {
      avail >= 1_500 ->
          CtcInferenceProfile(tier = "high", chunkSamples = 160_000, linesPerSegment = 8)
      avail >= 1_250 ->
          CtcInferenceProfile(tier = "high_mid", chunkSamples = 80_000, linesPerSegment = 8)
      avail >= 1_000 ->
          CtcInferenceProfile(tier = "mid", chunkSamples = 80_000, linesPerSegment = 6)
      avail >= 750 ->
          CtcInferenceProfile(tier = "mid_low", chunkSamples = 48_000, linesPerSegment = 6)
      avail >= 500 ->
          CtcInferenceProfile(tier = "low", chunkSamples = 16_000, linesPerSegment = 4)
      avail >= MIN_WORK_AVAIL_MB ->
          CtcInferenceProfile(tier = "min", chunkSamples = 8_000, linesPerSegment = 2)
      else -> CtcInferenceProfile(tier = "blocked", chunkSamples = 8_000, linesPerSegment = 2)
    }
  }

  /** LibreTranslate 대용량 다운로드와 ONNX가 겹치면 OOM 위험이 높다 */
  fun shouldDeferForActiveDownload(context: Context): Boolean {
    return LibreTranslatePackageDownloader.hasActiveDownload() &&
        availMemMb(context) < LOW_AVAIL_MB
  }

  /** 세그먼트·청크 사이 짧은 GC (과도한 폴백 없이 피크만 낮춤) */
  fun trimBetweenInferenceSteps(tag: String) {
    try {
      System.runFinalization()
      System.gc()
      Thread.sleep(40)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    NrmFileLogger.log(tag, "mem_trim_done availMb=${availMemMb(null)}")
  }

  /** ONNX 추론 직전 GC·짧은 대기로 OOM 가능성을 낮춘다 */
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
      Thread.sleep(if (availBefore < LOW_AVAIL_MB) 200 else 120)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    NrmFileLogger.log(tag, "mem_prepare_done availMb=${availMemMb(context)}")
  }
}
