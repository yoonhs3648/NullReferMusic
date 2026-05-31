package com.nullrefer.music.ondevice

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * whisper-cli는 RAM·CPU를 많이 쓰므로 APK에서는 **한 번에 하나만** 실행한다.
 * JS에서 transcribeToLrc가 동시에 여러 번 호출돼도 FIFO 순서로 직렬 처리.
 */
object WhisperTranscribeQueue {
  private val pending = AtomicInteger(0)
  private val executor: ExecutorService =
      Executors.newSingleThreadExecutor { r ->
        Thread(r, "nrm-whisper-queue").apply { isDaemon = true }
      }

  fun submit(task: () -> Unit) {
    val waiting = pending.incrementAndGet() - 1
    if (waiting > 0) {
      NrmFileLogger.log("whisper", "transcribeToLrc 대기열 등록 — 앞에 ${waiting}건")
    }
    executor.execute {
      try {
        task()
      } finally {
        pending.decrementAndGet()
      }
    }
  }
}
