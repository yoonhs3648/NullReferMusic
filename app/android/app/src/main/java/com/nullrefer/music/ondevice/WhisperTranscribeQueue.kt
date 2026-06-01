package com.nullrefer.music.ondevice

import android.os.SystemClock
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * whisper-cli는 RAM·CPU를 많이 쓰므로 APK에서는 **한 번에 하나만** 실행한다.
 * JS에서 transcribeToLrc가 동시에 여러 번 호출돼도 FIFO 순서로 직렬 처리.
 */
object WhisperTranscribeQueue {
  private val pending = AtomicInteger(0)
  /** 연속 전사 후 SoC 스로틀 완화용 짧은 휴식(ms) */
  private const val COOLDOWN_AFTER_BACKLOG_MS = 20_000L
  private const val COOLDOWN_AFTER_LONG_WAIT_MS = 15_000L
  private const val LONG_QUEUE_WAIT_MS = 120_000L

  private val executor: ExecutorService =
      Executors.newSingleThreadExecutor { r ->
        Thread(r, "nrm-whisper-queue").apply { isDaemon = true }
      }

  @Volatile private var lastJobWallMs: Long = 0L

  fun submit(label: String = "", task: (queueDepthAtStart: Int) -> Unit) {
    val enqueuedAt = SystemClock.elapsedRealtime()
    val depth = pending.incrementAndGet()
    val ahead = depth - 1
    NrmFileLogger.log(
        "whisper-queue",
        "enqueue depth=$depth ahead=$ahead label=${label.ifBlank { "(none)" }}",
    )
    if (NrmWhisperPerfLog.ENABLED) {
      NrmFileLogger.log(
          NrmWhisperPerfLog.TAG,
          "queue enqueue depth=$depth ahead=$ahead waiters=$ahead label=${label.ifBlank { "(none)" }}",
      )
    }
    executor.execute {
      val waitMs = SystemClock.elapsedRealtime() - enqueuedAt
      if (waitMs >= LONG_QUEUE_WAIT_MS) {
        NrmFileLogger.log(
            "whisper-queue",
            "cooldown before start waitMs=$waitMs sleepMs=$COOLDOWN_AFTER_LONG_WAIT_MS depthAtStart=$depth",
        )
        Thread.sleep(COOLDOWN_AFTER_LONG_WAIT_MS)
      }
      NrmFileLogger.log(
          "whisper-queue",
          "dequeue waitMs=$waitMs depthAtStart=$depth label=${label.ifBlank { "(none)" }}",
      )
      if (NrmWhisperPerfLog.ENABLED) {
        NrmFileLogger.log(
            NrmWhisperPerfLog.TAG,
            "queue dequeue waitMs=$waitMs depthAtStart=$depth label=${label.ifBlank { "(none)" }}",
        )
      }
      val jobT0 = SystemClock.elapsedRealtime()
      try {
        task(depth)
      } finally {
        lastJobWallMs = SystemClock.elapsedRealtime() - jobT0
        val remaining = pending.decrementAndGet()
        NrmFileLogger.log(
            "whisper-queue",
            "done remaining=$remaining label=${label.ifBlank { "(none)" }}",
        )
        if (NrmWhisperPerfLog.ENABLED) {
          NrmFileLogger.log(
              NrmWhisperPerfLog.TAG,
              "queue done remaining=$remaining totalWaitMs=$waitMs jobWallMs=$lastJobWallMs label=${label.ifBlank { "(none)" }}",
          )
        }
        if (remaining > 0) {
          NrmFileLogger.log(
              "whisper-queue",
              "cooldown after job remaining=$remaining sleepMs=$COOLDOWN_AFTER_BACKLOG_MS jobWallMs=$lastJobWallMs",
          )
          Thread.sleep(COOLDOWN_AFTER_BACKLOG_MS)
        }
      }
    }
  }
}
