package com.nullrefer.music.ondevice

import android.content.Context
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Whisper·wav2vec2 등 대용량 모델 설치를 **한 번에 하나씩** 직렬 처리합니다.
 * 오디오 다운로드(dl:*)·가사 생성(whisper-lrc:* 등)과는 별도로 동작합니다.
 */
object NrmModelInstallQueue {
  private const val BG_TOKEN = "model-install-queue"

  data class Job(
      val jobId: String,
      val label: String,
      val run: () -> Unit,
  )

  private val queue = ConcurrentLinkedQueue<Job>()
  private val knownJobIds = ConcurrentHashMap.newKeySet<String>()
  private val worker =
      Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "nrm-model-install").apply { isDaemon = true }
      }
  private val draining = AtomicBoolean(false)

  @Volatile private var currentJobId: String? = null
  @Volatile private var currentJobLabel: String? = null

  fun isQueuedOrRunning(jobId: String): Boolean {
    val id = jobId.trim()
    if (id.isEmpty()) return false
    return knownJobIds.contains(id) || currentJobId == id
  }

  fun pendingCount(): Int = queue.size + if (currentJobId != null) 1 else 0

  fun currentLabel(): String? = currentJobLabel

  fun queuedLabels(): List<String> = queue.map { it.label }

  /**
   * @return true if newly queued; false if the same jobId is already queued or running
   */
  fun enqueue(context: Context, jobId: String, label: String, block: () -> Unit): Boolean {
    val id = jobId.trim()
    if (id.isEmpty()) return false
    if (!knownJobIds.add(id)) {
      NrmFileLogger.log("model-install-queue", "skip_duplicate id=$id")
      return false
    }
    queue.add(Job(id, label, block))
    NrmFileLogger.log(
        "model-install-queue",
        "enqueue id=$id label=$label pending=${queue.size} running=${currentJobId ?: "none"}",
    )
    NrmBackgroundWorkCoordinator.acquire(context.applicationContext, BG_TOKEN)
    scheduleDrain(context.applicationContext)
    return true
  }

  private fun scheduleDrain(appContext: Context) {
    if (!draining.compareAndSet(false, true)) return
    worker.execute {
      try {
        while (true) {
          val job = queue.poll() ?: break
          currentJobId = job.jobId
          currentJobLabel = job.label
          NrmFileLogger.log(
              "model-install-queue",
              "start id=${job.jobId} label=${job.label} waitLeft=${queue.size}",
          )
          try {
            job.run()
          } catch (t: Throwable) {
            NrmFileLogger.error("model-install-queue", "fail id=${job.jobId}", t)
          } finally {
            knownJobIds.remove(job.jobId)
            currentJobId = null
            currentJobLabel = null
            NrmFileLogger.log(
                "model-install-queue",
                "done id=${job.jobId} waitLeft=${queue.size}",
            )
          }
        }
      } finally {
        draining.set(false)
        if (queue.isNotEmpty()) {
          scheduleDrain(appContext)
        } else if (currentJobId == null) {
          NrmBackgroundWorkCoordinator.release(appContext, BG_TOKEN)
          NrmFileLogger.log("model-install-queue", "idle")
        }
      }
    }
  }
}
