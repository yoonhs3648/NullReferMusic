package com.nullrefer.music.ondevice

import android.content.Context
import android.os.Process
import android.os.SystemClock
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Forced Alignment(wav2vec2/aeneas) 전용 순차 큐.
 *
 * - Activity/RN Thread에서 직접 ONNX를 돌리지 않고, 이 Executor에서만 실행한다.
 * - FGS 토큰(`align-run:`) + PARTIAL_WAKE_LOCK은 잡 단위로 acquire/release.
 * - 스레드는 [Process.THREAD_PRIORITY_FOREGROUND]로 CPU 스케줄링을 높인다.
 * - ONNX Session은 큐가 빌 때만 close (곡마다 재생성 금지).
 */
object ForcedAlignWorkQueue {
  private val pending = AtomicInteger(0)

  private val executor: ExecutorService =
      Executors.newSingleThreadExecutor { r ->
        Thread(r, "nrm-forced-align-queue").apply {
          isDaemon = true
          priority = Thread.NORM_PRIORITY
        }
      }

  fun pendingCount(): Int = pending.get()

  fun submit(context: Context, label: String = "", task: () -> Unit) {
    val appContext = context.applicationContext
    val enqueuedAt = SystemClock.elapsedRealtime()
    val depth = pending.incrementAndGet()
    val ahead = depth - 1
    val token = "align-run:${System.currentTimeMillis()}-$depth"
    NrmFileLogger.log(
        "forced-align-queue",
        "enqueue depth=$depth ahead=$ahead label=${label.ifBlank { "(none)" }}",
    )
    NrmBackgroundWorkCoordinator.acquire(appContext, token)
    updateProgressNotification(appContext, depth, ahead, running = false)
    executor.execute {
      Process.setThreadPriority(Process.THREAD_PRIORITY_FOREGROUND)
      val waitMs = SystemClock.elapsedRealtime() - enqueuedAt
      NrmFileLogger.log(
          "forced-align-queue",
          "dequeue waitMs=$waitMs depthAtStart=$depth label=${label.ifBlank { "(none)" }}",
      )
      updateProgressNotification(appContext, pending.get(), ahead = 0, running = true)
      try {
        task()
      } finally {
        val remaining = pending.decrementAndGet()
        NrmBackgroundWorkCoordinator.release(appContext, token)
        NrmFileLogger.log(
            "forced-align-queue",
            "done remaining=$remaining label=${label.ifBlank { "(none)" }}",
        )
        if (remaining <= 0) {
          Wav2Vec2CtcForcedAligner.releaseOnnxSession()
          NrmForegroundNotificationBinder.onLyricsProgressDismissed()
          NrmBackgroundWorkService.refreshNotification(appContext)
        } else {
          updateProgressNotification(appContext, remaining, ahead = remaining - 1, running = false)
        }
      }
    }
  }

  private fun updateProgressNotification(
      context: Context,
      depth: Int,
      ahead: Int,
      running: Boolean,
  ) {
    val body =
        when {
          running && depth > 1 -> "Forced Alignment 정렬 중 · 대기 ${depth - 1}곡"
          running -> "Forced Alignment 정렬 중"
          ahead > 0 -> "가사 생성 대기 중 · 앞 ${ahead}곡"
          else -> "가사(LRC) 생성 중"
        }
    NrmForegroundNotificationBinder.onLyricsProgressShown("가사 생성 중", body)
    NrmBackgroundWorkService.refreshNotification(context)
  }
}
