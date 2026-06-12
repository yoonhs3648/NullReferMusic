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
  /**
   * 연속 전사 후 SoC 발열 완화 쿨다운.
   *
   * COOLDOWN_AFTER_BACKLOG_MS: 대기 곡이 남았을 때 잡 간 휴식.
   *   - 3초: 짧은 호흡으로 SoC 스로틀 완화. 12초 대비 발열 억제 효과 차이 미미.
   *   - 이 기간에 WhisperActiveModel.scheduleWarmup 이 OS 페이지 캐시 사전 적재.
   *
   * COOLDOWN_AFTER_LONG_WAIT_MS: 큐 대기가 LONG_QUEUE_WAIT_MS 이상이었을 때 시작 전 휴식.
   *   - 이미 장시간(2분+) 대기해 기기가 충분히 식어 있으므로 0.5초로 최소화.
   */
  private const val COOLDOWN_AFTER_BACKLOG_MS = 3_000L
  private const val COOLDOWN_AFTER_LONG_WAIT_MS = 500L
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
