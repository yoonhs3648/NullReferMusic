package com.nullrefer.music.ondevice

import android.os.Debug
import java.io.File
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * Forced Alignment RSS/Native 단계별 계측.
 * System.gc / Thread.sleep 없음 — 측정이 동작에 영향을 주지 않게 한다.
 *
 * ART NativeHeap ≠ Ort 전용. LMKD 판단은 VmRSS(+ PeakRSS)를 우선한다.
 */
object NrmFaRssTelemetry {
  private const val TAG = "whisperx-align"
  private const val MAX_RUN_HISTORY = 8

  private val peakRssKb = AtomicLong(0)
  private val alignRunIndex = AtomicInteger(0)
  private val runPeaksKb = LongArray(MAX_RUN_HISTORY) { -1L }
  private val runPeaksLock = Any()

  data class Snap(
      val vmRssKb: Long,
      val nativeAllocMb: Double,
      val nativeHeapMb: Double,
      val javaUsedMb: Long,
  ) {
    fun compact(): String =
        String.format(
            Locale.US,
            "VmRSS_kB=%d rssMiB=%.1f NativeHeapAllocatedMb=%.1f NativeHeapSizeMb=%.1f JavaHeapUsedMb=%d",
            vmRssKb,
            if (vmRssKb > 0) vmRssKb / 1024.0 else -1.0,
            nativeAllocMb,
            nativeHeapMb,
            javaUsedMb,
        )
  }

  fun snap(): Snap {
    val alloc = Debug.getNativeHeapAllocatedSize().toDouble() / (1024.0 * 1024.0)
    val heap = Debug.getNativeHeapSize().toDouble() / (1024.0 * 1024.0)
    val rt = Runtime.getRuntime()
    val javaUsed = (rt.totalMemory() - rt.freeMemory()) / (1024L * 1024L)
    val rss = readVmRssKb()
    notePeak(rss)
    return Snap(rss, alloc, heap, javaUsed)
  }

  fun notePeak(rssKb: Long) {
    if (rssKb <= 0) return
    while (true) {
      val cur = peakRssKb.get()
      if (rssKb <= cur) break
      if (peakRssKb.compareAndSet(cur, rssKb)) break
    }
  }

  fun peakRssMiB(): Double {
    val kb = peakRssKb.get()
    return if (kb > 0) kb / 1024.0 else -1.0
  }

  fun peakRssKb(): Long = peakRssKb.get()

  fun resetPeakForNewAlignRun() {
    peakRssKb.set(0)
  }

  fun beginAlignRun(ortAbLabel: String) {
    val run = alignRunIndex.incrementAndGet()
    resetPeakForNewAlignRun()
    val s = snap()
    NrmFileLogger.log(
        TAG,
        "ctc_fa_run_start run=$run ortAb=$ortAbLabel PeakRSS_reset ${s.compact()}",
    )
  }

  fun endAlignRun(sessionAlive: Boolean, createCount: Int, destroyCount: Int) {
    val run = alignRunIndex.get()
    val peakKb = peakRssKb.get()
    synchronized(runPeaksLock) {
      val slot = ((run - 1) % MAX_RUN_HISTORY).coerceAtLeast(0)
      runPeaksKb[slot] = peakKb
    }
    val s = snap()
    NrmFileLogger.log(
        TAG,
        String.format(
            Locale.US,
            "ctc_fa_run_end run=%d PeakRSS_kB=%d PeakRSS_MiB=%.1f sessionAlive=%s createCount=%d destroyCount=%d %s",
            run,
            peakKb,
            peakKb / 1024.0,
            sessionAlive,
            createCount,
            destroyCount,
            s.compact(),
        ),
    )
    logRunHistory()
  }

  fun logRunHistory() {
    val n = alignRunIndex.get().coerceAtMost(MAX_RUN_HISTORY)
    if (n <= 0) return
    val parts = ArrayList<String>(n)
    synchronized(runPeaksLock) {
      val total = alignRunIndex.get()
      val start = (total - n).coerceAtLeast(0)
      for (i in 0 until n) {
        val runNum = start + i + 1
        val slot = (runNum - 1) % MAX_RUN_HISTORY
        val kb = runPeaksKb[slot]
        parts.add(
            String.format(
                Locale.US,
                "Run%d PeakRSS_MiB=%.1f",
                runNum,
                if (kb > 0) kb / 1024.0 else -1.0,
            ),
        )
      }
    }
    NrmFileLogger.log(TAG, "ctc_fa_run_peak_history ${parts.joinToString(" ")}")
  }

  fun logStage(stage: String) {
    val s = snap()
    NrmFileLogger.log(
        TAG,
        String.format(
            Locale.US,
            "ctc_fa_stage stage=%s PeakRSS_MiB=%.1f %s",
            stage,
            peakRssMiB(),
            s.compact(),
        ),
    )
  }

  fun logChunkBounds(chunkIndex: Int, start: Snap, end: Snap, elapsedMs: Long) {
    val rssDelta = if (start.vmRssKb > 0 && end.vmRssKb > 0) end.vmRssKb - start.vmRssKb else 0L
    val nativeDelta = end.nativeAllocMb - start.nativeAllocMb
    NrmFileLogger.log(
        TAG,
        String.format(
            Locale.US,
            "ctc_fa_chunk_span chunk=%d elapsedMs=%d chunkStart={%s} chunkEnd={%s} delta={rssDeltaKb=%d nativeDeltaMb=%.1f} PeakRSS_MiB=%.1f",
            chunkIndex,
            elapsedMs,
            start.compact(),
            end.compact(),
            rssDelta,
            nativeDelta,
            peakRssMiB(),
        ),
    )
  }

  fun logSegmentEnd(segmentIndex: Int, segmentCount: Int, elapsedMs: Long, localRealignCount: Int) {
    val s = snap()
    NrmFileLogger.log(
        TAG,
        String.format(
            Locale.US,
            "ctc_fa_segment_end segment=%d/%d elapsedMs=%d localRealignCount=%d PeakRSS_MiB=%.1f %s",
            segmentIndex + 1,
            segmentCount,
            elapsedMs,
            localRealignCount,
            peakRssMiB(),
            s.compact(),
        ),
    )
  }

  private fun readVmRssKb(): Long {
    return try {
      var rss = -1L
      File("/proc/self/status").forEachLine { line ->
        if (line.startsWith("VmRSS:")) {
          val parts = line.trim().split(Regex("\\s+"))
          if (parts.size >= 2) rss = parts[1].toLongOrNull() ?: -1L
        }
      }
      rss
    } catch (_: Throwable) {
      -1L
    }
  }
}
